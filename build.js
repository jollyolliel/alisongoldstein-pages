#!/usr/bin/env node
/**
 * build.js — template injection + lucide bundling for alisongoldstein.com
 *
 * Run: node build.js
 * Adds to package.json scripts: "build:html": "node build.js"
 *
 * What it does:
 *  1. Reads templates/header.html and templates/footer.html snippets
 *  2. Replaces <header id="main-header">...</header> in every HTML page
 *  3. Replaces <footer id="main-footer">...</footer> in every HTML page
 *  4. Updates lucide script tag to use local /js/lucide.min.js
 *  5. Copies node_modules/lucide/dist/umd/lucide.min.js → js/lucide.min.js
 */

const fs   = require("fs");
const path = require("path");

const ROOT = __dirname;

/* CMS: footer values come from content.json so every page stays in sync,
   but the data-cms annotations are kept only on index.html — the footer
   is edited once, from the Home tab. */
const { stampPage } = require("./build/stamp.js");
const CONTENT_FILE = path.join(ROOT, "content.json");
const CMS_CONTENT = fs.existsSync(CONTENT_FILE)
  ? JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"))
  : null;

function stripCmsAttrs(html) {
  return html.replace(/\s+data-cms(?:-[\w-]+)?="[^"]*"/g, "");
}

const NAV = [
  { val: "home",     label: "Home",     href: "/" },
  { val: "packages", label: "Packages", href: "/packages/" },
  { val: "business", label: "Business", href: "/business/" },
  { val: "about",    label: "About",    href: "/about/" },
  { val: "articles", label: "Articles", href: "/articles/" },
  { val: "reading",  label: "Reading",  href: "/reading/" },
];

const PAGES = [
  { file: "index.html",           active: "home",     transparent: true  },
  { file: "packages/index.html",  active: "packages", transparent: false },
  { file: "business/index.html",  active: "business", transparent: false },
  { file: "about/index.html",     active: "about",    transparent: false },
  { file: "articles/index.html",  active: "articles", transparent: false },
  { file: "reading/index.html",   active: "reading",  transparent: false },
  { file: "contact/index.html",   active: "",         transparent: false },
  { file: "article-1/index.html", active: "articles", transparent: false },
  { file: "article-2/index.html", active: "articles", transparent: false },
  { file: "article-3/index.html", active: "articles", transparent: false },
  { file: "article-4/index.html", active: "articles", transparent: false },
  { file: "article-5/index.html", active: "articles", transparent: false },
  { file: "article-6/index.html", active: "articles", transparent: false },
  { file: "privacy/index.html",   active: "",         transparent: false },
  { file: "terms/index.html",     active: "",         transparent: false },
  { file: "404.html",             active: "",         transparent: false },
];

/* ── Helpers ───────────────────────────────────────────────────── */

function extractSnippet(templateFile) {
  const raw   = fs.readFileSync(path.join(ROOT, templateFile), "utf8");
  const start = raw.indexOf("<!-- SNIPPET_START -->") + "<!-- SNIPPET_START -->".length;
  const end   = raw.indexOf("<!-- SNIPPET_END -->");
  if (start < 0 || end < 0) throw new Error(`Missing SNIPPET markers in ${templateFile}`);
  return raw.slice(start, end).trim();
}

function replaceBlock(html, openId, closeTag, replacement) {
  // Extract id value to handle multi-line tags (e.g. <header\n  id="...">)
  const idMatch = openId.match(/id="([^"]+)"/);
  if (!idMatch) return html;
  const idPos = html.indexOf(`id="${idMatch[1]}"`);
  if (idPos === -1) return html;
  const start = html.lastIndexOf("<", idPos);
  if (start === -1) return html;
  const end = html.indexOf(closeTag, start);
  if (end === -1) return html;
  return html.slice(0, start) + replacement + html.slice(end + closeTag.length);
}

/* ── Header generator ──────────────────────────────────────────── */

function buildHeader(headerSnippet, active, transparent) {
  const headerClass = transparent ? "py-6 bg-transparent" : "py-4 header-scrolled";
  let h = headerSnippet.replace("{{HEADER_CLASS}}", headerClass);

  NAV.forEach(function(link) {
    const isActive   = link.val === active;
    const textClass  = isActive ? "text-brand-accent" : "text-slate-600";
    const underline  = isActive ? "w-full" : "w-0";
    const mobileText = isActive ? "text-brand-accent" : "text-brand-dark hover:text-brand-accent";
    const KEY = link.val.toUpperCase();
    h = h
      .replace(`{{ACTIVE_${KEY}}}`,   textClass)
      .replace(`{{UNDERLINE_${KEY}}}`, underline)
      .replace(`{{MOBILE_${KEY}}}`,    mobileText);
  });

  return h;
}

/* ── Footer ────────────────────────────────────────────────────── */

function buildFooter(footerSnippet) {
  return footerSnippet;
}

/* ── Lucide bundle ─────────────────────────────────────────────── */

function buildLucide() {
  const bundleScript = path.join(ROOT, "build-lucide.js");
  if (!fs.existsSync(bundleScript)) {
    console.warn("  ⚠  build-lucide.js not found");
    return;
  }
  require(bundleScript);
}

/* ── Lucide tag update ─────────────────────────────────────────── */

function updateLucideTag(html) {
  return html.replace(
    /<script[^>]*src="https:\/\/unpkg\.com\/lucide[^"]*"[^>]*><\/script>/g,
    '<script defer src="/js/lucide.min.js"></script>'
  );
}

/* ── Main ──────────────────────────────────────────────────────── */

const headerSnippet = extractSnippet("templates/header.html");
const footerSnippet = extractSnippet("templates/footer.html");

console.log("build.js — stamping headers, footers, lucide tag...\n");

let updated = 0;
let skipped = 0;

PAGES.forEach(function(page) {
  const filePath = path.join(ROOT, page.file);
  if (!fs.existsSync(filePath)) {
    console.log(`  skip  ${page.file} (not found)`);
    skipped++;
    return;
  }

  let html = fs.readFileSync(filePath, "utf8");
  const original = html;

  const header = buildHeader(headerSnippet, page.active, page.transparent);
  let footer = buildFooter(footerSnippet);
  if (CMS_CONTENT) footer = stampPage(footer, CMS_CONTENT);
  if (page.file !== "index.html") footer = stripCmsAttrs(footer);

  html = replaceBlock(html, '<header id="main-header"', "</header>", header);
  html = replaceBlock(html, '<footer id="main-footer"', "</footer>", footer);
  html = updateLucideTag(html);

  if (html !== original) {
    fs.writeFileSync(filePath, html, "utf8");
    console.log(`  ✓  ${page.file}`);
    updated++;
  } else {
    console.log(`  –  ${page.file} (unchanged)`);
  }
});

console.log(`\n${updated} files updated, ${skipped} skipped`);

buildLucide();
console.log("\nDone. Run npm run build:css to rebuild styles if Tailwind classes changed.");
