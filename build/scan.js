#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────
   scan.js — walks every annotated page, generates cms-schema.json
   (which drives the admin editor UI) and seeds missing keys into
   content.json from the page's current text.

   Usage:  node build/scan.js [--config path/to/cms.config.json]
                              [--include-head]

   The schema file is GENERATED — never edit it by hand; re-run the
   scanner after changing annotations instead.
───────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const argv = process.argv.slice(2);
const includeHead = argv.includes('--include-head');

let warnings = 0, errors = 0;
function warn(msg) { warnings++; console.warn('  ⚠  ' + msg); }
function fail(msg) { errors++; console.error('  ✗  ' + msg); }

function labelFromKey(key, pageId) {
  let k = key;
  if (pageId && k.startsWith(pageId + '_')) k = k.slice(pageId.length + 1);
  return lib.titleCase(k.replace(/[-_]/g, ' '));
}

/* Strip tags + collapse whitespace — seed value for a data-cms field. */
function textSeed(inner) {
  return lib.decodeEntities(inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/* Infer itemFields for a list from its <template> markup. */
function inferItemFields(templateHtml, templateOpenTag, listKey, pageId) {
  const overrides = {};
  const typesAttr = lib.getAttr(templateOpenTag, 'data-cms-types');
  if (typesAttr) {
    typesAttr.split(',').forEach(pair => {
      const [k, t] = pair.split(':').map(s => s.trim());
      if (k && t) overrides[k] = t;
    });
  }

  const fields = [];   // keep first-appearance order
  const seen = {};
  function add(key, type, extra) {
    if (key === '.' || key.startsWith('@')) return;
    if (seen[key]) return;
    seen[key] = true;
    const f = Object.assign({ key, type: overrides[key] || type, label: labelFromKey(key, pageId) }, extra || {});
    fields.push(f);
  }

  // Pure string-list template: only placeholder is {{.}}
  const allTokens = templateHtml.match(/\{\{\{?[#^/]?[\w.@-]+\}?\}\}/g) || [];
  const nonDot = allTokens.filter(t => !/\{\{\.\}\}/.test(t) && !/\{\{@/.test(t));
  if (nonDot.length === 0 && /\{\{\.\}\}/.test(templateHtml)) {
    return { stringList: true, fields: [] };
  }

  // Walk tokens in document order so editor field order matches the markup.
  const tokenRe = /\{\{(\{)?([#^])?([\w-]+)\}?\}\}/g;
  let m;
  while ((m = tokenRe.exec(templateHtml))) {
    const raw = !!m[1], section = m[2], key = m[3];
    if (templateHtml.slice(m.index, m.index + 3) === '{{/') continue; // closing tag
    if (key.startsWith('@')) continue;
    if (section === '#' || section === '^') {
      // find matching body to decide stringlist vs toggle
      const bodyM = new RegExp('\\{\\{[#^]' + key + '\\}\\}([\\s\\S]*?)\\{\\{\\/' + key + '\\}\\}').exec(templateHtml);
      const body = bodyM ? bodyM[1] : '';
      if (/\{\{\.\}\}/.test(body)) add(key, 'stringlist');
      // "{{#k}}…{{k}}…{{/k}}" = optional text wrapped in a conditional,
      // not a boolean — the field itself is still text.
      else if (new RegExp('\\{\\{' + key + '\\}\\}').test(body)) add(key, 'text');
      else add(key, 'toggle');
      continue;
    }
    if (raw) { add(key, 'richtext'); continue; }
    // image? placeholder sits inside a src/srcset attribute
    const srcRe = new RegExp('src(?:set)?\\s*=\\s*"[^"]*\\{\\{' + key + '\\}\\}[^"]*"');
    const srcM = srcRe.exec(templateHtml);
    if (srcM) {
      const tagStart = templateHtml.lastIndexOf('<', srcM.index);
      const tagEnd = lib.findTagEnd(templateHtml, tagStart);
      const maxW = tagStart !== -1 && tagEnd !== -1
        ? lib.getAttr(templateHtml.slice(tagStart, tagEnd), 'data-cms-img-max') : null;
      add(key, 'image', maxW ? { maxWidth: +maxW } : null);
      continue;
    }
    // textarea heuristic: placeholder is direct text of a <p>
    const inP = new RegExp('<p\\b[^>]*>[^<]*\\{\\{' + key + '\\}\\}').test(templateHtml);
    add(key, inP ? 'textarea' : 'text');
  }
  return { stringList: false, fields };
}

function scanPage(page, html, content, globalKeyTypes) {
  const pageId = page.id;
  const headEnd = includeHead ? 0 : lib.headEndIndex(html);
  const tplRanges = lib.templateRanges(html);

  /* sections (scroll-sync anchors → editor cards) */
  const sectionEls = lib.findAnnotated(html, 'data-cms-section')
    .filter(el => el.innerStart != null)
    .map(el => ({
      key: el.key,
      label: lib.getAttr(el.openTag, 'data-cms-label') || lib.titleCase(el.key.replace(/[-_]/g, ' ')),
      start: el.openStart,
      end: el.innerEnd,
      fields: []
    }));
  const implicit = { key: '_page', label: 'Page', start: -1, end: Infinity, fields: [] };

  function sectionFor(pos) {
    // innermost (= last in document order whose range contains pos)
    let best = implicit;
    for (const s of sectionEls) if (pos >= s.start && pos < s.end) best = s;
    return best;
  }

  const seenKeys = {};
  function registerField(pos, field) {
    if (seenKeys[field.key]) return;
    seenKeys[field.key] = true;
    if (globalKeyTypes[field.key] && globalKeyTypes[field.key] !== field.type) {
      warn(page.path + ': key "' + field.key + '" already used elsewhere as type "' +
        globalKeyTypes[field.key] + '" (here: "' + field.type + '")');
    }
    globalKeyTypes[field.key] = field.type;
    sectionFor(pos).fields.push(field);
  }

  function usable(el) {
    return el.openStart >= headEnd && !lib.inRanges(el.openStart, tplRanges);
  }

  /* data-cms (plain text) */
  for (const el of lib.findAnnotated(html, 'data-cms')) {
    if (!usable(el)) continue;
    if (el.innerStart == null) { fail(page.path + ': data-cms="' + el.key + '" on a void/self-closing element'); continue; }
    const inner = html.slice(el.innerStart, el.innerEnd);
    if (/</.test(inner.replace(/<!--[\s\S]*?-->/g, ''))) {
      warn(page.path + ': data-cms="' + el.key + '" element contains child markup — it will be replaced by plain text. Use data-cms-html if the markup should be editable.');
    }
    const seed = textSeed(inner);
    const type = (el.tag === 'p' || el.tag === 'blockquote' || seed.length > 120) ? 'textarea' : 'text';
    registerField(el.openStart, {
      key: el.key, type,
      label: lib.getAttr(el.openTag, 'data-cms-label') || labelFromKey(el.key, pageId)
    });
    if (!(el.key in content)) content[el.key] = seed;
  }

  /* data-cms-html (rich) */
  for (const el of lib.findAnnotated(html, 'data-cms-html')) {
    if (!usable(el)) continue;
    if (el.innerStart == null) { fail(page.path + ': data-cms-html="' + el.key + '" on a void element'); continue; }
    registerField(el.openStart, {
      key: el.key, type: 'richtext',
      label: lib.getAttr(el.openTag, 'data-cms-label') || labelFromKey(el.key, pageId)
    });
    if (!(el.key in content)) content[el.key] = html.slice(el.innerStart, el.innerEnd).trim();
  }

  /* data-cms-attr ("attr:key" pairs, comma-separated) */
  for (const el of lib.findAnnotated(html, 'data-cms-attr')) {
    if (!usable(el)) continue;
    for (const pair of el.key.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (!attr || !key) { fail(page.path + ': malformed data-cms-attr "' + el.key + '" (expected "attr:key")'); continue; }
      registerField(el.openStart, {
        key, type: 'text',
        label: labelFromKey(key, pageId) + ' (' + attr + ')'
      });
      if (!(key in content)) content[key] = lib.decodeEntities(lib.getAttr(el.openTag, attr) || '');
    }
  }

  /* data-cms-img */
  for (const el of lib.findAnnotated(html, 'data-cms-img')) {
    if (!usable(el)) continue;
    const maxW = lib.getAttr(el.openTag, 'data-cms-img-max');
    registerField(el.openStart, Object.assign({
      key: el.key, type: 'image',
      label: lib.getAttr(el.openTag, 'data-cms-label') || labelFromKey(el.key, pageId)
    }, maxW ? { maxWidth: +maxW } : null));
    if (!(el.key in content)) content[el.key] = lib.getAttr(el.openTag, 'src') || '';
  }

  /* data-cms-list */
  for (const block of lib.findListBlocks(html)) {
    const el = block.el;
    if (!usable(el)) continue;
    if (el.tag === 'ul' || el.tag === 'ol' || el.tag === 'tbody' || el.tag === 'table' || el.tag === 'select') {
      warn(page.path + ': data-cms-list="' + el.key + '" sits on <' + el.tag + '> — browsers may relocate the <template> child when parsing. Prefer annotating a wrapper <div>.');
    }
    if (!block.templateHtml) {
      fail(page.path + ': data-cms-list="' + el.key + '" has no <template data-cms-template> child');
      continue;
    }
    const inferred = inferItemFields(block.templateHtml, block.templateOpenTag, el.key, pageId);
    const field = {
      key: el.key,
      type: inferred.stringList ? 'stringlist' : 'list',
      label: lib.getAttr(el.openTag, 'data-cms-label') || labelFromKey(el.key, pageId)
    };
    const min = lib.getAttr(el.openTag, 'data-cms-min');
    const max = lib.getAttr(el.openTag, 'data-cms-max');
    if (min != null) field.min = +min;
    if (max != null) field.max = +max;
    if (!inferred.stringList) field.itemFields = inferred.fields;
    registerField(el.openStart, field);
    if (!(el.key in content)) {
      content[el.key] = [];
      warn(page.path + ': list "' + el.key + '" seeded as EMPTY []. Populate its items in ' +
        'content.json (the existing rendered items are NOT parsed back automatically), ' +
        'then run stamp.js --check.');
    }
  }

  const sections = sectionEls.filter(s => s.fields.length);
  if (implicit.fields.length) sections.push(implicit);
  return {
    id: page.id, path: page.path, url: page.url, label: page.label,
    sections: sections.map(s => ({ key: s.key, label: s.label, fields: s.fields }))
  };
}

/* ── main ────────────────────────────────────────────────────────── */
function main() {
  const { config, rootDir } = lib.loadConfig(argv);
  const pages = lib.resolvePages(config, rootDir);
  if (!pages.length) { console.error('No pages found (config.pages empty and no annotated HTML discovered).'); process.exit(1); }

  const contentPath = path.join(rootDir, config.contentFile);
  const content = fs.existsSync(contentPath)
    ? JSON.parse(fs.readFileSync(contentPath, 'utf8'))
    : {};
  const seededBefore = Object.keys(content).length;

  const globalKeyTypes = {};
  const schemaPages = [];
  for (const page of pages) {
    const file = path.join(rootDir, page.path);
    if (!fs.existsSync(file)) { fail('page not found: ' + page.path); continue; }
    console.log('Scanning ' + page.path + ' …');
    schemaPages.push(scanPage(page, lib.normalizeEol(fs.readFileSync(file, 'utf8')), content, globalKeyTypes));
  }

  const schema = {
    version: 1,
    generated: 'GENERATED by build/scan.js — do not edit; re-run the scanner instead',
    generatedAt: new Date().toISOString(),
    pages: schemaPages
  };
  fs.writeFileSync(path.join(rootDir, config.schemaFile), JSON.stringify(schema, null, 2) + '\n', 'utf8');
  fs.writeFileSync(contentPath, JSON.stringify(content, null, 2) + '\n', 'utf8');

  const fieldCount = schemaPages.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.fields.length, 0), 0);
  console.log('\n' + config.schemaFile + ' written: ' + schemaPages.length + ' page(s), ' + fieldCount + ' field(s).');
  console.log(config.contentFile + ' written: ' + (Object.keys(content).length - seededBefore) + ' key(s) seeded, ' + seededBefore + ' kept.');
  if (warnings) console.log(warnings + ' warning(s).');
  if (errors) { console.error(errors + ' error(s).'); process.exit(1); }
}

main();
