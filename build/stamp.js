#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────
   stamp.js — generic build-time content stamping. Reads content.json
   and writes its values into every annotated page. No site-specific
   code: everything is driven by the data-cms* annotations in the HTML
   itself. List items are rendered by shared/microtpl.js — the exact
   same renderer the admin live preview uses.

   Stamping is idempotent: annotations and <template> elements are kept
   in the output, so re-stamping produces identical files.

   Usage:  node build/stamp.js [--config path] [--check] [page.html …]

   --check  stamps in-memory and diffs against the file instead of
            writing. Non-zero exit on any mismatch. Use this after
            annotating a page to prove the template + content faithfully
            reproduce the existing markup BEFORE letting stamp overwrite.

   A host site's own build script can also `require()` this file and
   call stampPage(html, content) directly.
───────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const tpl = require('../shared/microtpl');

/* Stamp one page. Pure string → string. */
function stampPage(html, content) {
  const tplRanges = lib.templateRanges(html);
  const edits = [];           // { start, end, text }
  const tagEdits = new Map(); // openStart → mutated open-tag string

  function queueTagEdit(el, mutate) {
    const current = tagEdits.get(el.openStart) || el.openTag;
    tagEdits.set(el.openStart, mutate(current));
  }

  /* lists first — their regions exclude nested flat annotations */
  const listRegions = [];
  for (const block of lib.findListBlocks(html)) {
    const el = block.el;
    if (lib.inRanges(el.openStart, tplRanges)) continue;
    if (!block.templateHtml || !Array.isArray(content[el.key])) continue;
    const items = content[el.key];
    const indent = '\n';
    edits.push({
      start: block.afterTemplate,
      end: el.innerEnd,
      text: indent + tpl.renderList(block.templateHtml, items) + indent
    });
    listRegions.push([block.afterTemplate, el.innerEnd]);
    const countPattern = lib.getAttr(el.openTag, 'data-cms-count-class');
    if (countPattern) {
      queueTagEdit(el, t => {
        const cls = lib.getAttr(t, 'class');
        if (cls == null) return t;
        return lib.setAttr(t, 'class', tpl.applyCountClass(cls, countPattern, items.length));
      });
    }
  }

  const skip = pos => lib.inRanges(pos, tplRanges) || lib.inRanges(pos, listRegions);

  /* flat inner-content annotations */
  for (const el of lib.findAnnotated(html, 'data-cms')) {
    if (skip(el.openStart) || el.innerStart == null) continue;
    if (!(el.key in content)) continue;
    edits.push({ start: el.innerStart, end: el.innerEnd, text: tpl.esc(content[el.key]) });
  }
  for (const el of lib.findAnnotated(html, 'data-cms-html')) {
    if (skip(el.openStart) || el.innerStart == null) continue;
    if (!(el.key in content)) continue;
    edits.push({ start: el.innerStart, end: el.innerEnd, text: String(content[el.key]) });
  }

  /* open-tag attribute annotations */
  for (const el of lib.findAnnotated(html, 'data-cms-attr')) {
    if (skip(el.openStart)) continue;
    for (const pair of el.key.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (!attr || !key || !(key in content)) continue;
      queueTagEdit(el, t => lib.setAttr(t, attr, tpl.esc(content[key])));
    }
  }
  for (const el of lib.findAnnotated(html, 'data-cms-img')) {
    if (skip(el.openStart)) continue;
    if (!(el.key in content)) continue;
    queueTagEdit(el, t => lib.setAttr(t, 'src', tpl.esc(content[el.key])));
  }

  /* materialize open-tag edits */
  for (const [openStart, newTag] of tagEdits) {
    const end = lib.findTagEnd(html, openStart);
    if (end !== -1) edits.push({ start: openStart, end, text: newTag });
  }

  /* apply: drop edits nested inside another edit, then splice end → start */
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const applied = [];
  let coveredUntil = -1;
  for (const e of edits) {
    if (e.start < coveredUntil) continue; // contained in a previous (outer) edit
    applied.push(e);
    coveredUntil = Math.max(coveredUntil, e.end);
  }
  applied.sort((a, b) => b.start - a.start);
  for (const e of applied) {
    html = html.slice(0, e.start) + e.text + html.slice(e.end);
  }
  return html;
}

/* Show the first mismatching region of a --check failure. */
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = 90;
  const from = Math.max(0, i - ctx);
  return {
    at: i,
    expected: a.slice(from, i + ctx).replace(/\n/g, '\\n'),
    actual: b.slice(from, i + ctx).replace(/\n/g, '\\n')
  };
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const { config, rootDir } = lib.loadConfig(argv);

  const contentPath = path.join(rootDir, config.contentFile);
  if (!fs.existsSync(contentPath)) {
    console.error(config.contentFile + ' not found at site root. Run scan.js first.');
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  // optional positional page filters (paths relative to site root)
  const cfgIx = argv.indexOf('--config');
  const positional = argv.filter((a, i) => !a.startsWith('--') && (cfgIx === -1 || i !== cfgIx + 1));
  let pages = lib.resolvePages(config, rootDir);
  if (positional.length) {
    pages = pages.filter(p => positional.some(q => p.path.replace(/\\/g, '/').includes(q.replace(/\\/g, '/'))));
  }

  let mismatches = 0, written = 0;
  for (const page of pages) {
    const file = path.join(rootDir, page.path);
    if (!fs.existsSync(file)) { console.warn('  ⚠  missing page: ' + page.path); continue; }
    const original = lib.normalizeEol(fs.readFileSync(file, 'utf8'));
    const stamped = stampPage(original, content);
    if (check) {
      if (stamped !== original) {
        mismatches++;
        const d = firstDiff(original, stamped);
        console.error('✗ ' + page.path + ' — differs at offset ' + d.at);
        console.error('    file:    …' + d.expected + '…');
        console.error('    stamped: …' + d.actual + '…');
      } else {
        console.log('✓ ' + page.path);
      }
    } else if (stamped !== original) {
      fs.writeFileSync(file, stamped, 'utf8');
      written++;
      console.log('stamped ' + page.path);
    } else {
      console.log('unchanged ' + page.path);
    }
  }

  if (check) {
    if (mismatches) {
      console.error('\n--check failed: ' + mismatches + ' page(s) differ. Fix annotations/content until the stamp reproduces the file exactly.');
      process.exit(1);
    }
    console.log('\n--check passed: stamping reproduces every page exactly.');
  } else {
    console.log('\nDone. ' + written + ' page(s) written.');
  }
}

if (require.main === module) main();
module.exports = { stampPage };
