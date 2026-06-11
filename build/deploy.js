#!/usr/bin/env node
/**
 * build/deploy.js — assembles deployable/ with public site files only.
 *
 * Run after `npm run build` (see "build:deploy" in package.json).
 * Source/tooling files never get copied, so they aren't reachable on the
 * deployed site even if the host serves the whole repo:
 *   build.js, build-lucide.js, build/, admin-src/, shared/, templates/,
 *   login-template/, cms.config.json, css/input.css, package.json,
 *   package-lock.json, image.png
 *
 * content.json and cms-schema.json ARE included — the admin editor
 * fetches both live from the deployed site (see admin-src/core.js).
 *
 * Point the host's "build output directory" at deployable/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'deployable');

const FILES = [
  'index.html', '404.html', '_headers', '_redirects', 'robots.txt', 'sitemap.xml',
  'content.json', 'cms-schema.json',
];

const DIRS = [
  'about', 'admin-login', 'article-1', 'article-2', 'article-3', 'article-4',
  'article-5', 'article-6', 'articles', 'business', 'contact', 'fonts',
  'images', 'js', 'packages', 'privacy', 'reading', 'terms', 'video',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of FILES) {
  const src = path.join(ROOT, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, file));
}

for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, dir), { recursive: true });
}

// css/: compiled output only, not the input.css source
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'css', 'output.css'), path.join(OUT, 'css', 'output.css'));

console.log('deployable/ assembled — public site files only.\n');

const entries = fs.readdirSync(OUT, { recursive: true })
  .map(p => p.replace(/\\/g, '/'))
  .sort();
for (const entry of entries) console.log(entry);
