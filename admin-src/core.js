/* ─────────────────────────────────────────────────────────────────────
   core.js — state, config boot, schema/content loading, GitHub
   publishing, image staging. Site-agnostic: everything specific comes
   from the injected cms.config.json subset and the generated schema.
───────────────────────────────────────────────────────────────────── */
'use strict';

/* Shared state for core.js / editor.js / preview.js */
var CMS = {
  config: null,
  schema: null,
  C: null,                // content.json object (the editing model)
  activePage: null,       // schema page object
  ghToken: null,
  pendingFiles: {},       // repo path → base64 (staged for next publish)
  pendingPreview: {}      // content value (url path) → data URL, for previewing unpublished images
};

var CMSCore = (function () {

  /* ── boot / config ─────────────────────────────────────────────── */

  function boot() {
    var injected = document.getElementById('cms-config').textContent.trim();
    if (!injected || injected === '__CMS_CONFIG__') {
      document.body.innerHTML = '<p style="padding:30px;font-family:sans-serif">' +
        'This is the admin source template — it only runs after ' +
        '<code>node build/encrypt.js</code> injects config and a token. ' +
        'Visit <code>/admin/</code> instead.</p>';
      return;
    }
    CMS.config = JSON.parse(injected);
    CMS.ghToken = CMS_TOKEN; // injected alongside the config by encrypt.js
    start();
  }

  function start() {
    document.getElementById('brand').textContent = (CMS.config.siteName || 'Site') + ' — Editor';
    document.title = (CMS.config.siteName || 'Site') + ' — Editor';
    wireHeader();
    init();
  }

  function wireHeader() {
    document.getElementById('publish-btn').addEventListener('click', publish);
    document.getElementById('reload-btn').addEventListener('click', function () {
      CMSPreview.loadPreview(CMS.activePage, true);
    });
    document.getElementById('view-site-btn').addEventListener('click', function () {
      window.open(siteUrl(''), '_blank');
    });
  }

  /* ── URLs ──────────────────────────────────────────────────────── */

  function baseOrigin() {
    if (location.protocol === 'file:') return CMS.config.devServerUrl || 'http://127.0.0.1:5500';
    return location.origin;
  }

  /* Absolute URL of a path relative to the site root. */
  function siteUrl(rel) {
    return baseOrigin() + CMS.config.urlRoot + rel;
  }

  /* ── init: load schema + content ───────────────────────────────── */

  function init() {
    setStatus('Loading…', '');
    Promise.all([
      fetch(siteUrl(CMS.config.schemaFile) + '?t=' + Date.now()).then(toJson),
      fetch(siteUrl(CMS.config.contentFile) + '?t=' + Date.now()).then(toJson)
    ]).then(function (res) {
      CMS.schema = res[0];
      CMS.C = res[1];
      setStatus('Loaded', 'ok');
      buildTabs();
      CMSPreview.initFrameNav();
      setActivePage(CMS.schema.pages[0]);
    }).catch(function (e) {
      setStatus('Load error: ' + e.message, 'err');
    });
  }

  function toJson(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.url);
    return r.json();
  }

  /* ── page tabs ─────────────────────────────────────────────────── */

  function buildTabs() {
    var nav = document.getElementById('page-tabs');
    nav.innerHTML = '';
    CMS.schema.pages.forEach(function (page) {
      var b = document.createElement('button');
      b.className = 'ptab';
      b.type = 'button';
      b.textContent = page.label;
      b.setAttribute('data-page', page.id);
      b.addEventListener('click', function () { setActivePage(page); });
      nav.appendChild(b);
    });
  }

  /* Switch the editor (and, unless the change came from iframe
     navigation, the preview) to a page. */
  function setActivePage(page, fromFrame) {
    CMS.activePage = page;
    document.querySelectorAll('.ptab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-page') === page.id);
    });
    CMSEditor.renderEditor();
    if (!fromFrame) CMSPreview.loadPreview(page, false);
  }

  /* ── status / badge ────────────────────────────────────────────── */

  function setStatus(msg, type) {
    var el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className = type || '';
  }

  function updatePublishBadge() {
    var badge = document.getElementById('publish-badge');
    var n = Object.keys(CMS.pendingFiles).length;
    badge.textContent = n + ' image' + (n === 1 ? '' : 's');
    badge.style.display = n > 0 ? '' : 'none';
  }

  /* ── GitHub API (git data flow: one commit for everything) ─────── */

  function ghFetch(method, path, body) {
    var repo = CMS.config.repo;
    return fetch('https://api.github.com/repos/' + repo.owner + '/' + repo.name + path, {
      method: method,
      headers: {
        'Authorization': 'token ' + CMS.ghToken,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || r.status); });
      return r.json();
    });
  }

  function publish() {
    var btn = document.getElementById('publish-btn');
    btn.disabled = true;
    setStatus('Publishing…', '');

    var prefix = CMS.config.repo.pathPrefix || '';
    var branch = CMS.config.repo.branch || 'main';
    var files = {};
    Object.keys(CMS.pendingFiles).forEach(function (p) { files[p] = CMS.pendingFiles[p]; });
    files[prefix + CMS.config.contentFile] =
      btoa(unescape(encodeURIComponent(JSON.stringify(CMS.C, null, 2) + '\n')));

    var imgCount = Object.keys(CMS.pendingFiles).length;
    var msg = 'Update site content via CMS' + (imgCount ? ' + ' + imgCount + ' image(s)' : '');

    var headSha, treeSha;
    ghFetch('GET', '/git/refs/heads/' + branch)
      .then(function (ref) {
        headSha = ref.object.sha;
        return ghFetch('GET', '/git/commits/' + headSha);
      })
      .then(function (commit) {
        treeSha = commit.tree.sha;
        return Promise.all(Object.keys(files).map(function (path) {
          return ghFetch('POST', '/git/blobs', { content: files[path], encoding: 'base64' })
            .then(function (blob) { return { path: path, mode: '100644', type: 'blob', sha: blob.sha }; });
        }));
      })
      .then(function (treeItems) {
        return ghFetch('POST', '/git/trees', { base_tree: treeSha, tree: treeItems });
      })
      .then(function (newTree) {
        return ghFetch('POST', '/git/commits', { message: msg, tree: newTree.sha, parents: [headSha] });
      })
      .then(function (newCommit) {
        return ghFetch('PATCH', '/git/refs/heads/' + branch, { sha: newCommit.sha });
      })
      .then(function () {
        CMS.pendingFiles = {};
        setStatus('Published ✓ — site rebuilding (~1 min)', 'ok');
        btn.disabled = false;
        updatePublishBadge();
      })
      .catch(function (e) {
        setStatus('Publish failed: ' + e.message, 'err');
        btn.disabled = false;
      });
  }

  /* ── image staging ─────────────────────────────────────────────── */

  /* Stage a compressed image blob for the next publish. Calls
     onSuccess with the content value to store (site-root-relative URL
     path). The blob's data URL is kept so the preview can show the
     image before it exists on the server. */
  function stageImage(blob, filename, onSuccess, onError) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var repoPath = (CMS.config.repo.pathPrefix || '') + CMS.config.imagesDir + '/' + filename;
      var value = CMS.config.urlRoot + CMS.config.imagesDir + '/' + filename;
      CMS.pendingFiles[repoPath] = dataUrl.split(',')[1];
      CMS.pendingPreview[value] = dataUrl;
      updatePublishBadge();
      onSuccess(value);
    };
    reader.onerror = function () { onError('FileReader error'); };
    reader.readAsDataURL(blob);
  }

  return {
    boot: boot,
    siteUrl: siteUrl,
    baseOrigin: baseOrigin,
    setActivePage: setActivePage,
    setStatus: setStatus,
    stageImage: stageImage
  };
})();
