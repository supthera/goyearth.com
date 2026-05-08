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

  // Cap DPR at 2 — beyond that adds render cost with no visible benefit
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var pdfDoc      = null;
  var currentPage = 1;
  var rendering   = false;
  var pendingPage = null;

  // pageCache[n] = { canvas, cssWidth, cssHeight } | 'pending'
  var pageCache     = {};
  var prefetchTimer = null;

  // requestIdleCallback with setTimeout fallback
  var scheduleIdle = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 1500 }); }
    : function (fn) { setTimeout(fn, 120); };

  // ── Layout ──────────────────────────────────────────────────────────────────
  function getAvailPerPage() {
    var wrap  = (canvasL || canvasR).parentElement;
    var H     = wrap.getBoundingClientRect().height;
    if (H < 100) H = window.innerHeight * 0.78;
    var availH = Math.max(H - 32, 200);
    var viewW  = window.innerWidth;
    var availW = spread
      ? Math.max((viewW - 35) / 2, 100)   // 32px pad + 3px gap
      : Math.max(viewW - 32,       100);
    return { w: availW, h: availH };
  }

  function cssScaleFor(page) {
    var avail    = getAvailPerPage();
    var unscaled = page.getViewport({ scale: 1 });
    return Math.min(avail.h / unscaled.height, avail.w / unscaled.width);
  }

  // ── Cache ───────────────────────────────────────────────────────────────────

  // Background cache: render at 1× DPR (fast). drawImage scales fine on blit.
  function cacheOne(num) {
    if (!pdfDoc || num == null || num < 1 || num > pdfDoc.numPages) return;
    if (pageCache[num]) return;
    pageCache[num] = 'pending';
    pdfDoc.getPage(num).then(function (page) {
      var scale = cssScaleFor(page);          // CSS scale
      var vp    = page.getViewport({ scale: scale }); // 1× — no DPR multiply
      var oc    = document.createElement('canvas');
      oc.width  = vp.width;
      oc.height = vp.height;
      return page.render({ canvasContext: oc.getContext('2d'), viewport: vp }).promise
        .then(function () {
          pageCache[num] = {
            canvas:    oc,
            cssWidth:  Math.round(vp.width),
            cssHeight: Math.round(vp.height),
            scale:     scale   // remember scale so blit can upscale correctly
          };
        });
    }).catch(function () { delete pageCache[num]; });
  }

  function evictCache(center) {
    var KEEP = 8;
    Object.keys(pageCache).forEach(function (k) {
      if (Math.abs(parseInt(k, 10) - center) > KEEP) delete pageCache[k];
    });
  }

  // Pre-warm PDF.js's internal page parser (no canvas render, just parse+decode)
  function warmPage(num) {
    if (!pdfDoc || num < 1 || num > pdfDoc.numPages) return;
    pdfDoc.getPage(num); // PDF.js caches internally; cheap if already cached
  }

  function schedulePrefetch(center) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      evictCache(center);
      scheduleIdle(function () {
        var step = spread ? 2 : 1;
        // 3 spreads ahead, 1 behind
        for (var i = 1; i <= 3; i++) {
          cacheOne(center + i * step);
          if (spread) cacheOne(center + i * step + 1);
        }
        cacheOne(center - step);
        if (spread && center - step >= 1) cacheOne(center - step + 1);
        // Also warm pages just beyond cache range so PDF.js has them parsed
        warmPage(center + 4 * step);
        warmPage(center - 2 * step);
      });
    }, 60);
  }

  // ── Blit cached page to visible canvas ─────────────────────────────────────
  // The cache is 1× DPR; we upscale the physical canvas to DPR via drawImage.
  function blitFromCache(num, canvas, ctx) {
    var cached = pageCache[num];
    if (!cached || cached === 'pending') return false;
    var physW = Math.round(cached.cssWidth  * DPR);
    var physH = Math.round(cached.cssHeight * DPR);
    canvas.width        = physW;
    canvas.height       = physH;
    canvas.style.width  = cached.cssWidth  + 'px';
    canvas.style.height = cached.cssHeight + 'px';
    canvas.style.visibility = 'visible';
    ctx.drawImage(cached.canvas, 0, 0, physW, physH);
    return true;
  }

  // ── Render one page at full DPR to a visible canvas ────────────────────────
  function renderOne(num, canvas, ctx) {
    if (!canvas || num == null || num < 1 || num > pdfDoc.numPages) {
      if (canvas) { canvas.style.visibility = 'hidden'; }
      return Promise.resolve();
    }

    if (blitFromCache(num, canvas, ctx)) return Promise.resolve();

    canvas.style.visibility = 'visible';
    return pdfDoc.getPage(num).then(function (page) {
      var scale = cssScaleFor(page);
      var vp    = page.getViewport({ scale: scale * DPR });
      canvas.width        = vp.width;
      canvas.height       = vp.height;
      canvas.style.width  = Math.round(vp.width  / DPR) + 'px';
      canvas.style.height = Math.round(vp.height / DPR) + 'px';
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        // Populate cache from rendered canvas (copy at 1× for lighter memory)
        var cssW = parseInt(canvas.style.width,  10);
        var cssH = parseInt(canvas.style.height, 10);
        var oc   = document.createElement('canvas');
        oc.width  = cssW;
        oc.height = cssH;
        oc.getContext('2d').drawImage(canvas, 0, 0, cssW, cssH);
        pageCache[num] = { canvas: oc, cssWidth: cssW, cssHeight: cssH, scale: scale };
      });
    });
  }

  // ── Render spread ───────────────────────────────────────────────────────────
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

      // Shrink-wrap shell — always two-page width in spread mode
      var wL    = canvasL ? (parseInt(canvasL.style.width, 10) || 0) : 0;
      var wR    = canvasR ? (parseInt(canvasR.style.width, 10) || 0) : 0;
      var pageW = wL || wR;
      var twoW  = spread ? (pageW * 2 + 3) : pageW;
      shell.style.width  = (twoW + 36) + 'px'; // 32px wrap pad + 4px border
      shell.style.margin = '0 auto';

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
    if (rendering) { pendingPage = num; return; }
    renderPage(num);
  }

  // ── Load PDF ────────────────────────────────────────────────────────────────
  pdfjsLib.getDocument({
    url: pdfPath,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    enableXfa: false
  }).promise.then(function (pdf) {
    pdfDoc = pdf;
    pageInfo.textContent = 'Loading\u2026';
    // Pre-warm first 4 pages immediately so PDF.js has them parsed
    for (var i = 1; i <= Math.min(4, pdf.numPages); i++) warmPage(i);
    requestAnimationFrame(function () { renderPage(1); });
  }).catch(function (err) {
    pageInfo.textContent = 'Failed to load PDF';
    console.error(err);
  });

  // ── Navigation ──────────────────────────────────────────────────────────────
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

  // ── Resize ──────────────────────────────────────────────────────────────────
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      pageCache = {};
      if (pdfDoc && !rendering) renderPage(currentPage);
    }, 250);
  });
})();
