#!/usr/bin/env node
/**
 * build-lucide.js
 * Generates js/lucide.min.js — a minimal lucide bundle containing only
 * the icons actually used on alisongoldstein.com (~3 KB vs 393 KB full bundle).
 *
 * Includes backward-compat aliases for icons renamed in lucide v1.x:
 *   alert-circle  → circle-alert
 *   help-circle   → circle-question-mark
 *   fingerprint   → fingerprint-pattern
 *   home          → house
 *   layout        → layout-dashboard
 */

const fs   = require("fs");
const path = require("path");

const ROOT      = __dirname;
const ICONS_DIR = path.join(ROOT, "node_modules", "lucide", "dist", "esm", "icons");
const OUT       = path.join(ROOT, "js", "lucide.min.js");

/* Icons referenced in HTML/JS across the site */
const USED_ICONS = [
  "alert-circle",      // terms page       → alias circle-alert
  "arrow-left",
  "arrow-right",
  "award",
  "book-open",
  "briefcase",
  "building-2",
  "calendar",
  "check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "circle-alert",
  "circle-question-mark",
  "clock",
  "fingerprint",       // privacy page      → alias fingerprint-pattern
  "fingerprint-pattern",
  "globe",
  "graduation-cap",
  "help-circle",       // privacy page      → alias circle-question-mark
  "home",              // 404 page          → alias house
  "house",
  "info",
  "layout",            // article-1 page    → alias layout-dashboard
  "layout-dashboard",
  "lightbulb",
  "lock",
  "mail",
  "menu",
  "quote",
  "shield",
  "shield-check",
  "user",
  "user-check",
  "users",
  "x",
];

/* Aliases: old name → new canonical name */
const ALIASES = {
  "alert-circle": "circle-alert",
  "help-circle":  "circle-question-mark",
  "fingerprint":  "fingerprint-pattern",
  "home":         "house",
  "layout":       "layout-dashboard",
};

/* ── Parse an ESM icon file ─────────────────────────────────────── */
function parseIcon(name) {
  const file = path.join(ICONS_DIR, name + ".mjs");
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  const match = src.match(/const \w+ = (\[[\s\S]+?\]);/);
  if (!match) return null;
  /* eslint-disable no-eval */
  try { return eval(match[1]); } catch (e) { return null; }
}

/* ── Build icon map ─────────────────────────────────────────────── */
const iconMap = {};

USED_ICONS.forEach(function(name) {
  const canonical = ALIASES[name] || name;
  if (iconMap[canonical]) {
    iconMap[name] = iconMap[canonical]; // add alias entry
    return;
  }
  const data = parseIcon(canonical);
  if (data) {
    iconMap[canonical] = data;
    if (name !== canonical) iconMap[name] = data; // alias
  } else {
    console.warn("  ⚠  icon not found:", canonical, "(requested as", name + ")");
  }
});

/* ── Generate bundle ────────────────────────────────────────────── */
const iconJson = JSON.stringify(iconMap);

const bundle = `/* lucide custom bundle v1.17.0 — alisongoldstein.com icons only */
(function(g){"use strict";
var DA={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};
var ICONS=${iconJson};
function ci(name,el){
  var d=ICONS[name];if(!d)return;
  var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  Object.keys(DA).forEach(function(k){svg.setAttribute(k,DA[k]);});
  var cls=el.getAttribute("class");if(cls)svg.setAttribute("class",cls);
  var style=el.getAttribute("style");if(style)svg.setAttribute("style",style);
  d.forEach(function(c){
    var node=document.createElementNS("http://www.w3.org/2000/svg",c[0]);
    Object.keys(c[1]).forEach(function(k){node.setAttribute(k,c[1][k]);});
    svg.appendChild(node);
  });
  el.parentNode&&el.parentNode.replaceChild(svg,el);
}
g.lucide={
  createIcons:function(opts){
    var attr=(opts&&opts.nameAttr)||"data-lucide";
    document.querySelectorAll("["+attr+"]").forEach(function(el){
      ci(el.getAttribute(attr),el);
    });
  }
};
})(typeof window!=="undefined"?window:this);`;

fs.writeFileSync(OUT, bundle, "utf8");

const iconCount = Object.keys(iconMap).length;
const sizeKB    = (Buffer.byteLength(bundle) / 1024).toFixed(1);
console.log(`js/lucide.min.js — ${iconCount} icons, ${sizeKB} KB`);
