(function () {
  'use strict';
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var shell    = document.getElementById('pdf-viewer-shell');
  var prevBtn  = document.getElementById('pdf-prev');
  var nextBtn  = document.getElementById('pdf-next');
  var pageInfo = document.getElementById('pdf-page-info');
  var pdfPath  = shell.dataset.pdf;
  var spread   = shell.dataset.spread === 'true';

  var canvasL = document.getElementById('pdf-canvas-left');
  var canvasR = document.getElementById('pdf-canvas-right');
  var ctxL    = canvasL && canvasL.getContext('2d');
  var ctxR    = canvasR && canvasR.getContext('2d');
  var spinner = document.getElementById('pdf-spinner');
  if (spinner) spinner.style.display = 'flex';

  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  shell.style.visibility = 'hidden';
  shell.style.transition = 'opacity 150ms ease';
  shell.style.opacity    = '0';

  var pdfDoc      = null;
  var currentPage = 1;
  var firstRender = true;
  var rendering   = false;
  var pendingPage = null;

  // pageCache[n] = { canvas, cssWidth, cssHeight, hiDpr } | 'pending'
  // hiDpr:true  → canvas is at full DPR, blit 1:1
  // hiDpr:false → canvas is at 1× DPR, blit upscaled
  var pageCache     = {};
  var prefetchTimer = null;

  // Active background RenderTask objects — cancelled immediately on user nav
  var bgTasks = [];

  function cancelBgTasks() {
    bgTasks.forEach(function (t) { try { t.cancel(); } catch (e) {} });
    bgTasks = [];
  }

  var scheduleIdle = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 1500 }); }
    : function (fn) { setTimeout(fn, 120); };

  // ── Layout ───────────────────────────────────────────────────────────────────
  function getAvailPerPage() {
    var wrap  = (canvasL || canvasR).parentElement;
    var H     = wrap.getBoundingClientRect().height;
    if (H < 100) H = window.innerHeight * 0.78;
    var availH = Math.max(H - 32, 200);
    var viewW  = wrap.getBoundingClientRect().width || window.innerWidth;
    var availW = spread
      ? Math.max((viewW - 35) / 2, 100)
      : Math.max(viewW - 32, 100);
    return { w: availW, h: availH };
  }

  function cssScaleFor(page) {
    var avail    = getAvailPerPage();
    var unscaled = page.getViewport({ scale: 1 });
    return Math.min(avail.h / unscaled.height, avail.w / unscaled.width);
  }

  // ── Cache ─────────────────────────────────────────────────────────────────────
  // Background: render at 1× DPR into an off-screen canvas.
  // Returns a Promise so callers can chain sequentially.
  function cacheOne(num) {
    if (!pdfDoc || num == null || num < 1 || num > pdfDoc.numPages) {
      return Promise.resolve();
    }
    if (pageCache[num]) return Promise.resolve();
    pageCache[num] = 'pending';

    return pdfDoc.getPage(num).then(function (page) {
      var scale = cssScaleFor(page);
      var vp    = page.getViewport({ scale: scale }); // 1× — no DPR multiply
      var oc    = document.createElement('canvas');
      oc.width  = vp.width;
      oc.height = vp.height;
      var task  = page.render({ canvasContext: oc.getContext('2d'), viewport: vp });
      bgTasks.push(task);
      return task.promise.then(function () {
        bgTasks = bgTasks.filter(function (t) { return t !== task; });
        pageCache[num] = {
          canvas:    oc,
          cssWidth:  Math.round(vp.width),
          cssHeight: Math.round(vp.height),
          hiDpr:     false
        };
      });
    }).catch(function () {
      // Cancelled or failed — evict so it can be retried
      if (pageCache[num] === 'pending') delete pageCache[num];
    });
  }

  function evictCache(center) {
    var KEEP = 8;
    Object.keys(pageCache).forEach(function (k) {
      if (Math.abs(parseInt(k, 10) - center) > KEEP) delete pageCache[k];
    });
  }

  function warmPage(num) {
    if (!pdfDoc || num < 1 || num > pdfDoc.numPages) return;
    pdfDoc.getPage(num);
  }

  // Chain background renders sequentially so the worker queue never gets deep.
  // Next spread (highest urgency) renders in parallel; rest chain one-by-one.
  function schedulePrefetch(center) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      evictCache(center);
      var step = spread ? 2 : 1;

      // Urgency tier 1: immediate next spread — render in parallel right away
      var urgentNums = [center + step];
      if (spread) urgentNums.push(center + step + 1);
      urgentNums.forEach(function (n) { cacheOne(n); });

      // Urgency tier 2: everything else — chain sequentially via idle callback
      scheduleIdle(function () {
        var queue = [];
        for (var i = 2; i <= 4; i++) {
          queue.push(center + i * step);
          if (spread) queue.push(center + i * step + 1);
        }
        queue.push(center - step);
        if (spread && center - step >= 1) queue.push(center - step + 1);
        // Warm pages just beyond prefetch range (parser only, no render)
        warmPage(center + 5 * step);
        warmPage(center - 2 * step);

        // Sequential chain: each starts only after previous completes
        queue.reduce(function (chain, num) {
          return chain.then(function () { return cacheOne(num); });
        }, Promise.resolve());
      });
    }, 60);
  }

  // ── Blit cache → visible canvas ───────────────────────────────────────────────
  function blitFromCache(num, canvas, ctx) {
    var cached = pageCache[num];
    if (!cached || cached === 'pending') return false;
    canvas.style.visibility = 'visible';
    if (cached.hiDpr) {
      // Foreground-rendered at full DPR — 1:1 blit, zero quality loss
      canvas.width        = cached.canvas.width;
      canvas.height       = cached.canvas.height;
      canvas.style.width  = cached.cssWidth  + 'px';
      canvas.style.height = cached.cssHeight + 'px';
      ctx.drawImage(cached.canvas, 0, 0);
    } else {
      // Background-rendered at 1× — upscale to DPR (GPU-accelerated)
      var physW = Math.round(cached.cssWidth  * DPR);
      var physH = Math.round(cached.cssHeight * DPR);
      canvas.width        = physW;
      canvas.height       = physH;
      canvas.style.width  = cached.cssWidth  + 'px';
      canvas.style.height = cached.cssHeight + 'px';
      ctx.drawImage(cached.canvas, 0, 0, physW, physH);
    }
    return true;
  }

  // ── Foreground render ─────────────────────────────────────────────────────────
  function renderOne(num, canvas, ctx) {
    if (!canvas || num == null || num < 1 || num > pdfDoc.numPages) {
      if (canvas) { canvas.style.visibility = 'hidden'; }
      return Promise.resolve();
    }

    var cached = pageCache[num];

    // If we have a full-DPR cached copy, blit it 1:1 and we're done
    if (cached && cached !== 'pending' && cached.hiDpr) {
      blitFromCache(num, canvas, ctx);
      return Promise.resolve();
    }

    // If we only have a 1× preview, show it immediately for responsiveness,
    // then fall through to render the full-DPR version on top of it
    if (cached && cached !== 'pending' && !cached.hiDpr) {
      blitFromCache(num, canvas, ctx);
    } else {
      canvas.style.visibility = 'visible';
    }

    return pdfDoc.getPage(num).then(function (page) {
      var scale = cssScaleFor(page);
      var vp    = page.getViewport({ scale: scale * DPR });
      canvas.width        = vp.width;
      canvas.height       = vp.height;
      canvas.style.width  = Math.round(vp.width  / DPR) + 'px';
      canvas.style.height = Math.round(vp.height / DPR) + 'px';
      // Foreground renders are not cancellable — they must always complete
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        // Store full-DPR copy in cache — next visit blits 1:1, zero upscale cost
        var cssW = parseInt(canvas.style.width,  10);
        var cssH = parseInt(canvas.style.height, 10);
        var oc   = document.createElement('canvas');
        oc.width  = vp.width;
        oc.height = vp.height;
        oc.getContext('2d').drawImage(canvas, 0, 0);
        pageCache[num] = { canvas: oc, cssWidth: cssW, cssHeight: cssH, hiDpr: true };
      });
    });
  }

  // ── Render spread ─────────────────────────────────────────────────────────────
  function renderPage(num) {
    rendering = true;
    var leftNum, rightNum;

    if (spread) {
      if (num === 1) {
        leftNum = null; rightNum = 1; currentPage = 1;
      } else {
        var even = (num % 2 === 0) ? num : num - 1;
        leftNum = even; rightNum = even + 1; currentPage = even;
      }
    } else {
      leftNum = null; rightNum = num; currentPage = num;
    }

    Promise.all([
      renderOne(leftNum,  canvasL, ctxL),
      renderOne(rightNum, canvasR, ctxR)
    ]).then(function () {
      rendering = false;

      if (spread) {
        pageInfo.textContent = (leftNum != null && rightNum <= pdfDoc.numPages)
          ? leftNum + '\u2013' + rightNum + ' / ' + pdfDoc.numPages
          : (leftNum || rightNum) + ' / ' + pdfDoc.numPages;
      } else {
        pageInfo.textContent = rightNum + ' / ' + pdfDoc.numPages;
      }

      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = spread
        ? (rightNum >= pdfDoc.numPages)
        : (currentPage >= pdfDoc.numPages);

      var wL    = canvasL ? (parseInt(canvasL.style.width, 10) || 0) : 0;
      var wR    = canvasR ? (parseInt(canvasR.style.width, 10) || 0) : 0;
      var pageW = wL || wR;
      var twoW  = spread ? (pageW * 2 + 3) : pageW;
      shell.style.width  = (twoW + 36) + 'px';
      shell.style.margin = '0 auto';

      if (firstRender) {
        firstRender = false;
        if (spinner) spinner.style.display = 'none';
        shell.style.visibility = 'visible';
        requestAnimationFrame(function () { shell.style.opacity = '1'; });
      }

      document.dispatchEvent(new CustomEvent('pdfPageChanged', { detail: { page: currentPage } }));

      schedulePrefetch(currentPage);

      if (pendingPage !== null) {
        var p = pendingPage; pendingPage = null; renderPage(p);
      }
    }).catch(function (err) {
      console.error('Render error:', err);
      rendering = false;
      pageInfo.textContent = 'Render error';
    });
  }

  function goTo(num) {
    // Cancel all background work immediately — the worker is now free for us
    cancelBgTasks();
    if (rendering) { pendingPage = num; return; }
    renderPage(num);
  }

  // ── Load PDF ──────────────────────────────────────────────────────────────────
  pdfjsLib.getDocument({
    url: pdfPath,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    enableXfa: false
  }).promise.then(function (pdf) {
    pdfDoc = pdf;
    pageInfo.textContent = 'Loading\u2026';
    for (var i = 1; i <= Math.min(4, pdf.numPages); i++) warmPage(i);
    requestAnimationFrame(function () { renderPage(1); });
  }).catch(function (err) {
    console.error('Failed to load PDF:', err);
    if (spinner) {
      spinner.querySelector('.pdf-spinner-ring').style.display = 'none';
      var label = spinner.querySelector('.pdf-spinner-label');
      if (label) label.textContent = 'Failed to load';
    } else {
      pageInfo.textContent = 'Failed to load PDF';
    }
  });

  // ── Navigation ────────────────────────────────────────────────────────────────
  prevBtn.addEventListener('click', function () {
    if (!pdfDoc || currentPage <= 1) return;
    goTo(spread ? (currentPage === 2 ? 1 : currentPage - 2) : currentPage - 1);
  });

  nextBtn.addEventListener('click', function () {
    if (!pdfDoc) return;
    var next = spread ? (currentPage === 1 ? 2 : currentPage + 2) : currentPage + 1;
    if (next > pdfDoc.numPages) return;
    goTo(next);
  });

  document.addEventListener('keydown', function (e) {
    if (!pdfDoc) return;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevBtn.click();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextBtn.click();
  });

  // ── Resize ────────────────────────────────────────────────────────────────────
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      cancelBgTasks();
      pageCache = {};
      if (pdfDoc && !rendering) renderPage(currentPage);
    }, 250);
  });
})();
