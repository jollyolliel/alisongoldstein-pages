#!/usr/bin/env node
/**
 * build/sitemap.js — generates sitemap.xml for alisongoldstein.com
 *
 * Run: node build/sitemap.js (also runs as part of `npm run build`)
 * Lists every public page. Admin, dev tooling, and template paths are
 * intentionally excluded.
 */

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://www.alisongoldstein.com";

const ROUTES = [
  { url: "/",            file: "index.html" },
  { url: "/packages/",   file: "packages/index.html" },
  { url: "/business/",   file: "business/index.html" },
  { url: "/about/",      file: "about/index.html" },
  { url: "/articles/",   file: "articles/index.html" },
  { url: "/reading/",    file: "reading/index.html" },
  { url: "/contact/",    file: "contact/index.html" },
  { url: "/article-1/",  file: "article-1/index.html" },
  { url: "/article-2/",  file: "article-2/index.html" },
  { url: "/article-3/",  file: "article-3/index.html" },
  { url: "/article-4/",  file: "article-4/index.html" },
  { url: "/article-5/",  file: "article-5/index.html" },
  { url: "/article-6/",  file: "article-6/index.html" },
  { url: "/privacy/",    file: "privacy/index.html" },
  { url: "/terms/",      file: "terms/index.html" },
];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

const urls = ROUTES.map(function(route) {
  const filePath = path.join(ROOT, route.file);
  const lastmod = fs.existsSync(filePath)
    ? isoDate(fs.statSync(filePath).mtime)
    : isoDate(new Date());
  return `  <url>\n    <loc>${SITE}${route.url}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
}).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`sitemap.xml written (${ROUTES.length} urls)`);
