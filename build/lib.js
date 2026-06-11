/* ─────────────────────────────────────────────────────────────────────
   Shared Node helpers for the CMS build scripts (scan.js / stamp.js /
   encrypt.js). Zero dependencies — fs/path only, regex-based HTML
   scanning (same trade-off the proven MVP build made).
───────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/* ── Config ──────────────────────────────────────────────────────── */

/* cms.config.json may contain // line comments. */
function stripJsonComments(src) {
  return src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
}

function applyConfigDefaults(config) {
  config.contentFile = config.contentFile || 'content.json';
  config.schemaFile = config.schemaFile || 'cms-schema.json';
  config.imagesDir = config.imagesDir || 'images';
  config.urlRoot = config.urlRoot || '/';
  if (!config.urlRoot.endsWith('/')) config.urlRoot += '/';
  config.preview = config.preview || {};
  config.preview.revealSelectors = config.preview.revealSelectors || [];
  config.preview.visibleClass = config.preview.visibleClass || 'visible';
  config.admin = config.admin || {};
  config.admin.loginOutput = config.admin.loginOutput || 'admin/index.html';
  config.admin.imageDefaultMax = config.admin.imageDefaultMax || 1600;
  config.admin.imageQuality = config.admin.imageQuality || 0.82;
  config.repo = config.repo || {};
  config.repo.branch = config.repo.branch || 'main';
  config.repo.pathPrefix = config.repo.pathPrefix || '';
  return config;
}

/* Load cms.config.json: explicit --config argument, else walk up from cwd.
   Returns { config, rootDir } where rootDir is the site root (the
   directory containing the config file). */
function loadConfig(argv) {
  let configPath = null;
  const ix = argv.indexOf('--config');
  if (ix !== -1 && argv[ix + 1]) {
    configPath = path.resolve(argv[ix + 1]);
  } else {
    let dir = process.cwd();
    for (;;) {
      const candidate = path.join(dir, 'cms.config.json');
      if (fs.existsSync(candidate)) { configPath = candidate; break; }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error(
      'cms.config.json not found. Run from your site root, or pass ' +
      '--config path/to/cms.config.json'
    );
  }
  const config = applyConfigDefaults(
    JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')))
  );
  return { config, rootDir: path.dirname(configPath), configPath };
}

/* Resolve the list of pages to process. Uses config.pages if present,
   else discovers root-level "*.html" plus one-level-deep "index.html"
   files containing "data-cms", excluding common non-content dirs. */
function resolvePages(config, rootDir) {
  if (Array.isArray(config.pages) && config.pages.length) {
    return config.pages.map(p => ({
      id: p.id || (p.path === 'index.html' ? 'home' : p.path.split(/[\\/]/)[0]),
      path: p.path,
      url: p.url != null ? p.url : (p.path === 'index.html' ? '' : p.path.replace(/index\.html$/, '')),
      label: p.label || titleCase((p.id || p.path).replace(/[-_]/g, ' '))
    }));
  }
  const SKIP_DIRS = new Set(['node_modules', 'cms', 'admin', 'admin-src', 'login-template', 'images', 'css', 'js', 'fonts', '.git']);
  const pages = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.html')) pages.push(e.name);
    else if (e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase())) {
      const idx = path.join(e.name, 'index.html');
      if (fs.existsSync(path.join(rootDir, idx))) pages.push(idx);
    }
  }
  return pages
    .filter(rel => fs.readFileSync(path.join(rootDir, rel), 'utf8').includes('data-cms'))
    .map(rel => {
      const norm = rel.replace(/\\/g, '/');
      const id = norm === 'index.html' ? 'home' : norm.replace(/\/?index\.html$/, '').replace(/\.html$/, '');
      return {
        id,
        path: norm,
        url: norm === 'index.html' ? '' : norm.replace(/index\.html$/, ''),
        label: titleCase(id.replace(/[-_]/g, ' '))
      };
    });
}

/* ── String helpers ──────────────────────────────────────────────── */

function titleCase(s) {
  return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

function normalizeEol(s) {
  return s.replace(/\r\n/g, '\n');
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* ── HTML scanning primitives ────────────────────────────────────── */

/* Index just past the '>' of the tag that opens at `start`. Tracks
   quotes so '>' inside attribute values doesn't terminate early. */
function findTagEnd(html, start) {
  let q = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return i + 1;
  }
  return -1;
}

/* Depth-counting close-tag finder (handles same-tag nesting, the known
   weakness of the MVP's plain regex). Returns { closeStart, closeEnd }. */
function findCloseIndex(html, tag, from) {
  const re = new RegExp('<(/?)' + tag + '(?=[\\s>/])', 'gi');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth--;
      if (depth === 0) return { closeStart: m.index, closeEnd: html.indexOf('>', m.index) + 1 };
    } else {
      const end = findTagEnd(html, m.index);
      if (end === -1) return null;
      if (!/\/>$/.test(html.slice(m.index, end))) depth++;
      re.lastIndex = end;
    }
  }
  return null;
}

/* Find every element carrying attr="value". Returns
   { tag, key, openStart, openEnd, openTag, innerStart, innerEnd }
   (innerStart/innerEnd are null for void/self-closing elements). */
function findAnnotated(html, attr) {
  const results = [];
  const needle = new RegExp('\\s' + attr + '\\s*=\\s*"([^"]*)"', 'g');
  let m;
  while ((m = needle.exec(html))) {
    const openStart = html.lastIndexOf('<', m.index);
    if (openStart === -1) continue;
    const tagM = /^<([a-zA-Z][\w-]*)/.exec(html.slice(openStart, openStart + 60));
    if (!tagM) continue;
    const openEnd = findTagEnd(html, openStart);
    if (openEnd === -1 || openEnd <= m.index) continue; // matched text, not a tag attr
    const tag = tagM[1].toLowerCase();
    const openTag = html.slice(openStart, openEnd);
    const entry = {
      tag, key: m[1], openStart, openEnd, openTag,
      innerStart: null, innerEnd: null
    };
    if (!VOID_TAGS.has(tag) && !/\/>$/.test(openTag)) {
      const close = findCloseIndex(html, tag, openEnd);
      if (close) { entry.innerStart = openEnd; entry.innerEnd = close.closeStart; }
    }
    results.push(entry);
  }
  return results;
}

function getAttr(tagHtml, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"').exec(tagHtml);
  return m ? m[1] : null;
}

/* Set (or add) an attribute on an open-tag string. Value must already
   be attribute-escaped. */
function setAttr(tagHtml, name, value) {
  const re = new RegExp('(\\s' + name + '\\s*=\\s*")[^"]*(")');
  if (re.test(tagHtml)) return tagHtml.replace(re, '$1' + value + '$2');
  return tagHtml.replace(/\s*(\/?)>$/, ' ' + name + '="' + value + '"$1>');
}

/* For each data-cms-list container, locate its <template data-cms-template>
   child. Returns el (from findAnnotated) plus templateOpenTag,
   templateHtml and afterTemplate (absolute index just past </template>). */
function findListBlocks(html) {
  return findAnnotated(html, 'data-cms-list').map(el => {
    const block = { el, key: el.key, templateOpenTag: null, templateHtml: null, afterTemplate: null };
    if (el.innerStart == null) return block;
    const inner = html.slice(el.innerStart, el.innerEnd);
    const tm = /(<template\b[^>]*\bdata-cms-template\b[^>]*>)([\s\S]*?)<\/template>/.exec(inner);
    if (tm) {
      block.templateOpenTag = tm[1];
      block.templateHtml = tm[2];
      block.afterTemplate = el.innerStart + tm.index + tm[0].length;
    }
    return block;
  });
}

/* Ranges of all <template>…</template> elements (annotations inside them
   are placeholders, not fields). */
function templateRanges(html) {
  const ranges = [];
  const re = /<template\b[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const close = html.indexOf('</template>', m.index);
    if (close !== -1) ranges.push([m.index, close + '</template>'.length]);
  }
  return ranges;
}

function inRanges(pos, ranges) {
  return ranges.some(r => pos >= r[0] && pos < r[1]);
}

function headEndIndex(html) {
  const i = html.indexOf('</head>');
  return i === -1 ? 0 : i;
}

module.exports = {
  VOID_TAGS,
  stripJsonComments, loadConfig, resolvePages,
  titleCase, normalizeEol, decodeEntities,
  findTagEnd, findCloseIndex, findAnnotated,
  getAttr, setAttr,
  findListBlocks, templateRanges, inRanges, headEndIndex
};
