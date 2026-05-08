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

  var pdfDoc      = null;
  var currentPage = 1;
  var rendering   = false;
  var pendingPage = null;

  // ── Pre-render cache ─────────────────────────────────────────────────────────
  // pageCache[n] = { canvas, cssWidth, cssHeight }  or  'pending'
  var pageCache  = {};
  var prefetchTimer = null;

  function getAvailPerPage() {
    var wrap = (canvasL || canvasR).parentElement;
    var H = wrap.getBoundingClientRect().height;
    if (H < 100) H = window.innerHeight * 0.78;
    var availH = Math.max(H - 32, 200);
    // Use viewport width for the width budget — never read from the shell,
    // which may already be shrunk, causing a feedback loop on re-render.
    var viewW = window.innerWidth;
    var pad = 32;
    var gap = 3;
    var availW = spread
      ? Math.max((viewW - pad - gap) / 2, 100)
      : Math.max(viewW - pad, 100);
    return { w: availW, h: availH };
  }

  // Render a single page number into an off-screen canvas and store in cache.
  function cacheOne(num) {
    if (!pdfDoc || num == null || num < 1 || num > pdfDoc.numPages) return;
    if (pageCache[num]) return; // already cached or in-flight
    pageCache[num] = 'pending';
    pdfDoc.getPage(num).then(function (page) {
      var dpr      = window.devicePixelRatio || 1;
      var avail    = getAvailPerPage();
      var unscaled = page.getViewport({ scale: 1 });
      var cssScale = Math.min(avail.h / unscaled.height, avail.w / unscaled.width);
      var vp       = page.getViewport({ scale: cssScale * dpr });
      var oc       = document.createElement('canvas');
      oc.width     = vp.width;
      oc.height    = vp.height;
      return page.render({ canvasContext: oc.getContext('2d'), viewport: vp }).promise
        .then(function () {
          pageCache[num] = {
            canvas:    oc,
            cssWidth:  Math.round(vp.width  / dpr),
            cssHeight: Math.round(vp.height / dpr)
          };
        });
    }).catch(function () { delete pageCache[num]; });
  }

  // Evict cache entries far from current position to cap memory usage.
  function evictCache(center) {
    var KEEP = 8;
    Object.keys(pageCache).forEach(function (k) {
      if (Math.abs(parseInt(k, 10) - center) > KEEP) delete pageCache[k];
    });
  }

  // Queue prefetch of surrounding pages after a short idle delay.
  function schedulePrefetch(center) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      evictCache(center);
      var step = spread ? 2 : 1;
      // Pre-render 2 spreads ahead and 1 spread behind
      for (var i = 1; i <= 2; i++) {
        cacheOne(center + i * step);
        if (spread) cacheOne(center + i * step + 1);
      }
      cacheOne(center - step);
      if (spread && center - step >= 1) cacheOne(center - step + 1);
    }, 80); // small delay so current render finishes first
  }

  // Copy a cached page onto a visible canvas. Returns true if cache hit.
  function blitFromCache(num, canvas, ctx) {
    var cached = pageCache[num];
    if (!cached || cached === 'pending') return false;
    canvas.width        = cached.canvas.width;
    canvas.height       = cached.canvas.height;
    canvas.style.width  = cached.cssWidth  + 'px';
    canvas.style.height = cached.cssHeight + 'px';
    canvas.style.visibility = 'visible';
    ctx.drawImage(cached.canvas, 0, 0);
    return true;
  }

  // ── Render one page to a visible canvas ──────────────────────────────────────
  function renderOne(num, canvas, ctx) {
    if (!canvas || num == null || num < 1 || num > pdfDoc.numPages) {
      if (canvas) { canvas.style.visibility = 'hidden'; }
      return Promise.resolve();
    }

    // Fast path: blit from cache
    if (blitFromCache(num, canvas, ctx)) return Promise.resolve();

    // Slow path: render fresh and also populate cache entry
    canvas.style.visibility = 'visible';
    return pdfDoc.getPage(num).then(function (page) {
      var dpr      = window.devicePixelRatio || 1;
      var avail    = getAvailPerPage();
      var unscaled = page.getViewport({ scale: 1 });
      var cssScale = Math.min(avail.h / unscaled.height, avail.w / unscaled.width);
      var vp       = page.getViewport({ scale: cssScale * dpr });
      canvas.width        = vp.width;
      canvas.height       = vp.height;
      canvas.style.width  = Math.round(vp.width  / dpr) + 'px';
      canvas.style.height = Math.round(vp.height / dpr) + 'px';
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        // Populate cache from what we just drew
        var oc = document.createElement('canvas');
        oc.width  = canvas.width;
        oc.height = canvas.height;
        oc.getContext('2d').drawImage(canvas, 0, 0);
        pageCache[num] = {
          canvas:    oc,
          cssWidth:  parseInt(canvas.style.width,  10),
          cssHeight: parseInt(canvas.style.height, 10)
        };
      });
    });
  }

  // ── Render a spread (or single page) ─────────────────────────────────────────
  function renderPage(num) {
    rendering = true;
    var leftNum, rightNum;

    if (spread) {
      if (num === 1) {
        leftNum     = null;
        rightNum    = 1;
        currentPage = 1;
      } else {
        var even = (num % 2 === 0) ? num : num - 1;
        leftNum     = even;
        rightNum    = even + 1;
        currentPage = even;
      }
    } else {
      leftNum     = null;
      rightNum    = num;
      currentPage = num;
    }

    Promise.all([
      renderOne(leftNum,  canvasL, ctxL),
      renderOne(rightNum, canvasR, ctxR)
    ]).then(function () {
      rendering = false;

      if (spread) {
        if (leftNum != null && rightNum <= pdfDoc.numPages) {
          pageInfo.textContent = leftNum + '\u2013' + rightNum + ' / ' + pdfDoc.numPages;
        } else {
          pageInfo.textContent = (leftNum || rightNum) + ' / ' + pdfDoc.numPages;
        }
      } else {
        pageInfo.textContent = rightNum + ' / ' + pdfDoc.numPages;
      }

      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = spread
        ? (rightNum >= pdfDoc.numPages)
        : (currentPage >= pdfDoc.numPages);

      // Shrink-wrap the shell to the actual canvas widths so it doesn't stretch wide.
      // In spread mode always reserve two-page width, even on the cover (one visible page).
      var wL = canvasL ? (parseInt(canvasL.style.width, 10) || 0) : 0;
      var wR = canvasR ? (parseInt(canvasR.style.width, 10) || 0) : 0;
      var pageW  = wL || wR;  // width of a single page
      var twoW   = spread ? (pageW * 2 + 3) : pageW;  // 3px gap between pages
      var pad    = 32;  // 1rem padding × 2 sides inside .pdf-canvas-wrap
      var bord   = 4;   // 2px border × 2 sides on .pdf-shell
      shell.style.width  = (twoW + pad + bord) + 'px';
      shell.style.margin = '0 auto';

      document.dispatchEvent(new CustomEvent('pdfPageChanged', { detail: { page: currentPage } }));

      // Kick off background pre-rendering of adjacent pages
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

  // ── Load PDF ──────────────────────────────────────────────────────────────────
  pdfjsLib.getDocument(pdfPath).promise.then(function (pdf) {
    pdfDoc = pdf;
    pageInfo.textContent = 'Loading\u2026';
    requestAnimationFrame(function () { renderPage(1); });
  }).catch(function (err) {
    pageInfo.textContent = 'Failed to load PDF';
    console.error(err);
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

  // ── Resize: invalidate cache (scale changed) and re-render ───────────────────
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      pageCache = {};
      if (pdfDoc && !rendering) renderPage(currentPage);
    }, 250);
  });
})();
