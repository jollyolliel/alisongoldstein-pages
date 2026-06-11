#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────
   encrypt.js — pagecrypt step. Builds the production admin login page:

   1. Inlines the admin app (CSS + JS) from admin-src/ into one
      self-contained HTML string.
   2. Injects the runtime config and the GitHub PAT (IN MEMORY ONLY —
      the source files always keep their placeholders).
   3. Encrypts the whole page: PBKDF2-SHA256 (200k iterations, key
      material "username:password" — the username is extra key entropy,
      pagecrypt-style) → AES-256-GCM. Blob = salt:iv:cipher+tag, base64.
   4. Splices the blob into login-template/template.html and writes the
      result to <site root>/<config.admin.loginOutput> (default admin/index.html).

   Credentials come ONLY from environment variables (never hardcode
   them anywhere, never read them from a file):
     CMS_ADMIN_USER / CMS_ADMIN_PASS / CMS_GH_TOKEN

   If they are not all set, the build does not fail: an existing login
   page is left untouched; if none exists, an "unconfigured" login page
   is written that displays setup instructions in the browser.

   Usage:  node build/encrypt.js [--config path]
───────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('./lib');

const TOOLKIT_DIR = path.resolve(__dirname, '..'); // the toolkit root (parent of admin-src/, login-template/, shared/)

function loadCredentials() {
  const username = process.env.CMS_ADMIN_USER;
  const password = process.env.CMS_ADMIN_PASS;
  const ghToken = process.env.CMS_GH_TOKEN;
  if (!username || !password || !ghToken) return null;
  return { username, password, ghToken };
}

/* Login template with the site name stamped in (blob placeholder kept). */
function loginTemplate(config) {
  const html = fs.readFileSync(path.join(TOOLKIT_DIR, 'login-template', 'template.html'), 'utf8');
  return html.replace(/\{\{SITE_NAME\}\}/g, config.siteName || 'Site');
}

function writeLoginPage(rootDir, config, html) {
  const outPath = path.join(rootDir, config.admin.loginOutput);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

/* Inline <link rel="stylesheet" href> and <script src> referenced by the
   admin shell. The decrypted page is document.write()n under the login
   URL, so nothing may load relatively. "</script>" sequences inside the
   inlined JS are split so the host page's parser can't end the script
   block early (same hazard the MVP documented for Live Server). */
function inlineAdmin(adminDir) {
  let html = fs.readFileSync(path.join(adminDir, 'index.html'), 'utf8');

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
    const css = fs.readFileSync(path.join(adminDir, href), 'utf8');
    return '<style>\n' + css + '\n</style>';
  });

  html = html.replace(/<script\s+src="([^"]+)"><\/script>/g, (m, src) => {
    let js = fs.readFileSync(path.join(adminDir, src), 'utf8');
    js = js.replace(/<\/script/gi, '<\\/script');
    return '<script>\n' + js + '\n</script>';
  });

  return html;
}

/* The runtime subset of cms.config.json the admin needs. */
function runtimeConfig(config) {
  return {
    siteName: config.siteName,
    repo: config.repo,
    contentFile: config.contentFile,
    schemaFile: config.schemaFile,
    imagesDir: config.imagesDir,
    urlRoot: config.urlRoot,
    devServerUrl: config.devServerUrl,
    preview: config.preview,
    admin: config.admin
  };
}

function main() {
  const { config, rootDir } = lib.loadConfig(process.argv.slice(2));
  const creds = loadCredentials();

  if (!creds) {
    console.log('\nAdmin encryption skipped — CMS_ADMIN_USER / CMS_ADMIN_PASS / CMS_GH_TOKEN');
    console.log('are not all set. Credentials come only from these environment variables.');
    const outPath = path.join(rootDir, config.admin.loginOutput);
    if (fs.existsSync(outPath)) {
      console.log('  Existing ' + config.admin.loginOutput + ' left untouched.');
    } else {
      writeLoginPage(rootDir, config, loginTemplate(config));
      console.log('  Wrote unconfigured ' + config.admin.loginOutput + ' — it shows');
      console.log('  setup instructions in the browser until the env vars are set.');
    }
    process.exit(0);
  }

  /* 1-2: inline + inject (memory only) */
  let adminHtml = inlineAdmin(path.join(TOOLKIT_DIR, 'admin-src'));
  const cfgJson = JSON.stringify(runtimeConfig(config)).replace(/</g, '\\u003c');
  // Target the exact injection points (a comment elsewhere mentioning a
  // placeholder must not swallow the replacement).
  const CFG_TAG = '<script id="cms-config" type="application/json">__CMS_CONFIG__</script>';
  const TOK_STMT = "var CMS_TOKEN = '__GITHUB_TOKEN__';";
  if (!adminHtml.includes(CFG_TAG) || !adminHtml.includes(TOK_STMT)) {
    console.error('admin-src/index.html is missing the config/token injection points.');
    process.exit(1);
  }
  adminHtml = adminHtml.replace(CFG_TAG,
    '<script id="cms-config" type="application/json">' + cfgJson + '</script>');
  adminHtml = adminHtml.replace(TOK_STMT,
    'var CMS_TOKEN = ' + JSON.stringify(creds.ghToken) + ';');

  /* 3: encrypt (mirrors the WebCrypto decrypt in login-template/template.html) */
  const PBKDF2_ITER = 200000;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(creds.username + ':' + creds.password, salt, PBKDF2_ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(adminHtml, 'utf8'), cipher.final()]);
  const blob = [
    salt.toString('base64'),
    iv.toString('base64'),
    Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64')
  ].join(':');

  /* 4: splice into the login template, write to the site */
  let loginHtml = loginTemplate(config);
  const open = '<script id="encrypted-admin" type="text/plain">';
  const openIx = loginHtml.indexOf(open);
  const closeIx = loginHtml.indexOf('</script>', openIx + open.length);
  if (openIx === -1 || closeIx === -1) {
    console.error('login-template/template.html is missing the encrypted-admin script tag.');
    process.exit(1);
  }
  loginHtml = loginHtml.slice(0, openIx + open.length) + blob + loginHtml.slice(closeIx);

  const outPath = writeLoginPage(rootDir, config, loginHtml);

  console.log('Encrypted admin written → ' + path.relative(rootDir, outPath));
  console.log('  Login with the username + password you configured.');
}

main();
