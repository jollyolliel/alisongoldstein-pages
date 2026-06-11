/* ─────────────────────────────────────────────────────────────────────
   preview.js — live preview iframe: real same-origin navigation
   (iframe.src, not srcdoc), debounced DOM patching driven purely by the
   data-cms* annotations in the loaded page, scroll-animation
   force-reveal (on load AND after every list patch — known prior bug),
   editor↔preview scroll sync, page auto-detect on iframe navigation,
   and rendered-size-aware WebP image compression.

   List items are rendered with CMSTpl.renderList on the page's own
   <template data-cms-template> — the same call stamp.js makes at build
   time, so preview and build output can never diverge.
───────────────────────────────────────────────────────────────────── */
'use strict';

var CMSPreview = (function () {

  var pvTimer = null;
  var syncObs = null;
  var previewReady = false;

  function frame() { return document.getElementById('preview-frame'); }
  function frameDoc() {
    try { return frame().contentDocument || frame().contentWindow.document; }
    catch (e) { return null; }
  }

  /* ── load / navigation ─────────────────────────────────────────── */

  function pagePath(page) {
    return CMS.config.urlRoot + page.url;
  }

  function loadPreview(page, force) {
    var f = frame();
    var url = CMSCore.baseOrigin() + pagePath(page);
    document.getElementById('preview-loading').style.display = 'flex';
    previewReady = false;
    var current;
    try { current = f.contentWindow.location.href; } catch (e) { current = null; }
    if (force || current !== url) f.src = url;
    else onFrameLoad(); // already there — just re-run the pipeline
  }

  /* Match the iframe's current pathname to a schema page
     (longest-prefix). This is what flips the editor tab when the user
     clicks a link inside the preview. */
  function detectPage(pathname) {
    var best = null, bestLen = -1;
    CMS.schema.pages.forEach(function (p) {
      var full = pagePath(p).replace(/index\.html$/, '');
      var norm = pathname.replace(/index\.html$/, '');
      if (norm === full || norm.indexOf(full) === 0) {
        if (full.length > bestLen) { best = p; bestLen = full.length; }
      }
    });
    return best;
  }

  function onFrameLoad() {
    document.getElementById('preview-loading').style.display = 'none';
    var doc = frameDoc();
    if (!doc) return;
    try {
      var pathname = frame().contentWindow.location.pathname;
      var page = detectPage(pathname);
      if (page && CMS.activePage && page.id !== CMS.activePage.id) {
        CMSCore.setActivePage(page, true); // true: don't reload the frame
      }
    } catch (e) { /* cross-origin or about:blank — ignore */ }
    forceReveal(doc);
    installSyncObserver(doc);
    patchPreview(doc);
    previewReady = true;
  }

  function initFrameNav() {
    frame().addEventListener('load', onFrameLoad);
  }

  /* ── scroll-animation handling ─────────────────────────────────── */

  /* Pages with IntersectionObserver-driven reveal animations keep
     content invisible until scrolled into view; inside the editing
     preview everything must be visible immediately — and AGAIN after
     every innerHTML patch, because freshly inserted elements start
     hidden (this exact bug shipped once in the MVP). */
  function revealSelector() {
    var sels = CMS.config.preview.revealSelectors || [];
    return sels.length ? sels.join(', ') : null;
  }

  function forceReveal(root) {
    var sel = revealSelector();
    if (!sel) return;
    var cls = CMS.config.preview.visibleClass || 'visible';
    try {
      if (root.matches && root.matches(sel)) root.classList.add(cls);
    } catch (e) {}
    root.querySelectorAll(sel).forEach(function (el) { el.classList.add(cls); });
  }

  function reReveal(doc, container) {
    if (!container) return;
    forceReveal(container);
    try {
      var lc = doc.defaultView && doc.defaultView.lucide;
      if (lc) lc.createIcons();
    } catch (e) {}
  }

  /* ── DOM patching (no page refresh) ────────────────────────────── */

  function schedulePreviewUpdate() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(function () {
      if (!previewReady) return;
      var doc = frameDoc();
      if (doc) patchPreview(doc);
    }, 350);
  }

  function resolveSrc(value) {
    return CMS.pendingPreview[value] || value;
  }

  /* Swap staged (not-yet-published) image paths for their data URLs so
     uploads preview instantly. */
  function resolvePendingImgs(root) {
    root.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (src && CMS.pendingPreview[src]) img.src = CMS.pendingPreview[src];
    });
  }

  function patchPreview(doc) {
    var C = CMS.C;

    doc.querySelectorAll('[data-cms]').forEach(function (el) {
      var k = el.getAttribute('data-cms');
      if (k in C) el.textContent = C[k];
    });

    doc.querySelectorAll('[data-cms-html]').forEach(function (el) {
      var k = el.getAttribute('data-cms-html');
      if (!(k in C)) return;
      if (el.innerHTML !== C[k]) {
        el.innerHTML = C[k];
        reReveal(doc, el);
      }
    });

    doc.querySelectorAll('[data-cms-attr]').forEach(function (el) {
      el.getAttribute('data-cms-attr').split(',').forEach(function (pair) {
        var parts = pair.split(':');
        var attr = parts[0] && parts[0].trim();
        var k = parts[1] && parts[1].trim();
        if (attr && k && (k in C)) el.setAttribute(attr, C[k]);
      });
    });

    doc.querySelectorAll('[data-cms-img]').forEach(function (el) {
      var k = el.getAttribute('data-cms-img');
      if (k in C) el.setAttribute('src', resolveSrc(C[k]));
    });

    doc.querySelectorAll('[data-cms-list]').forEach(function (el) {
      var k = el.getAttribute('data-cms-list');
      if (!(k in C) || !Array.isArray(C[k])) return;
      var tplEl = el.querySelector('template[data-cms-template]');
      if (!tplEl) return;
      Array.prototype.slice.call(el.children).forEach(function (child) {
        if (child !== tplEl) el.removeChild(child);
      });
      el.insertAdjacentHTML('beforeend', CMSTpl.renderList(tplEl.innerHTML, C[k]));
      var pat = el.getAttribute('data-cms-count-class');
      if (pat) el.className = CMSTpl.applyCountClass(el.className, pat, C[k].length);
      resolvePendingImgs(el);
      reReveal(doc, el); // critical: re-show animations on fresh nodes
      try {
        var hook = doc.defaultView && doc.defaultView.cmsAfterPatch;
        if (hook) hook(el, k);
      } catch (e) {}
    });
  }

  /* ── editor ↔ preview scroll sync ──────────────────────────────── */

  function installSyncObserver(doc) {
    if (syncObs) { try { syncObs.disconnect(); } catch (e) {} syncObs = null; }
    try {
      syncObs = new doc.defaultView.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) highlightEditorCard(e.target.getAttribute('data-cms-section'));
        });
      }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
      doc.querySelectorAll('[data-cms-section]').forEach(function (s) { syncObs.observe(s); });
    } catch (e) {}
  }

  function highlightEditorCard(key) {
    if (!key) return;
    document.querySelectorAll('.sec-card.synced').forEach(function (el) { el.classList.remove('synced'); });
    var card = document.querySelector('.sec-card[data-section="' + key + '"]');
    if (!card) return;
    card.classList.add('synced');
    var pane = document.getElementById('editor-pane');
    pane.scrollTo({ top: card.offsetTop - pane.clientHeight * 0.15, behavior: 'smooth' });
  }

  /* ── image upload: measure → compress to WebP → stage ──────────── */

  /* Find the rendered element for this image field in the live preview
     and derive the upload size from its on-screen dimensions (×2 for
     retina), so an image slot that renders at 300px never ships 4K. */
  function measureTarget(field, ctx) {
    var ABS_CAP = 2400;
    var doc = frameDoc();
    var el = null;
    if (doc) {
      if (ctx && ctx.listKey != null) {
        var item = doc.querySelector('[data-cms-list="' + ctx.listKey + '"] [data-cms-item="' + ctx.index + '"]');
        if (item) el = item.tagName === 'IMG' ? item : item.querySelector('img');
      } else {
        el = doc.querySelector('[data-cms-img="' + field.key + '"]');
      }
    }
    var w = 0, h = 0;
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 10) { w = Math.ceil(r.width) * 2; h = Math.ceil(r.height) * 2; }
    }
    if (!w) {
      w = field.maxWidth || CMS.config.admin.imageDefaultMax;
      h = 0; // unconstrained height
    }
    if (field.maxWidth && w > field.maxWidth) {
      if (h) h = Math.round(h * field.maxWidth / w);
      w = field.maxWidth;
    }
    if (w > ABS_CAP) { if (h) h = Math.round(h * ABS_CAP / w); w = ABS_CAP; }
    if (h > ABS_CAP) { w = Math.round(w * ABS_CAP / h); h = ABS_CAP; }
    return { w: w, h: h };
  }

  function compressToWebP(file, maxW, maxH, quality, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (maxH && h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          if (!blob) { cb(null, null); return; }
          var base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          cb(blob, base + '-' + Date.now() + '.webp');
        }, 'image/webp', quality);
      };
      img.onerror = function () { cb(null, null); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* Full upload pipeline used by the editor's image widgets.
     done(err, value) — value is the content.json path to store. */
  function uploadImage(file, field, ctx, done) {
    var size = measureTarget(field, ctx);
    compressToWebP(file, size.w, size.h, CMS.config.admin.imageQuality, function (blob, filename) {
      if (!blob) { done('could not read/encode image'); return; }
      CMSCore.stageImage(blob, filename, function (value) { done(null, value); }, done);
    });
  }

  return {
    initFrameNav: initFrameNav,
    loadPreview: loadPreview,
    schedulePreviewUpdate: schedulePreviewUpdate,
    uploadImage: uploadImage
  };
})();
