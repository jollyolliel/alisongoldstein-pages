/* ─────────────────────────────────────────────────────────────────────
   CMS micro-template engine — shared between Node (build/stamp.js)
   and the browser (admin/preview.js).

   THE INVARIANT: this is the only place list-item HTML is ever rendered.
   Build-time stamping and the admin live preview both call renderList()
   on the exact same <template data-cms-template> markup, so they can
   never drift apart.

   Placeholder syntax (micro-mustache subset):
     {{field}}             escaped substitution (& < > ")
     {{{field}}}           raw HTML substitution
     {{#field}}…{{/field}} field is array  → repeat body per element,
                                             {{.}} = current string element
                           field is scalar → render body only when truthy
     {{^field}}…{{/field}} render body only when falsy / empty array
     {{@i}} {{@n}} {{@nn}} 0-based index, 1-based, 1-based zero-padded
     {{.}}                 whole item, when the list items are plain strings

   Limitation: same-key nested sections are not supported (different keys
   nest fine — they resolve on successive passes).
───────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CMSTpl = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Resolve {{#key}} / {{^key}} sections against one item object.
     Loops until no section tokens remain so different-key nesting works. */
  function renderSections(tpl, item) {
    var re = /\{\{([#^])([\w-]+)\}\}([\s\S]*?)\{\{\/\2\}\}/;
    var m, guard = 0;
    while ((m = re.exec(tpl)) && guard++ < 200) {
      var kind = m[1], key = m[2], body = m[3];
      var v = item[key];
      var truthy = Array.isArray(v) ? v.length > 0 : !!v;
      var out;
      if (kind === '^') {
        out = truthy ? '' : body;
      } else if (Array.isArray(v)) {
        out = v.map(function (el) {
          return body.replace(/\{\{\.\}\}/g, esc(el));
        }).join('');
      } else {
        out = truthy ? body : '';
      }
      tpl = tpl.slice(0, m.index) + out + tpl.slice(m.index + m[0].length);
    }
    return tpl;
  }

  /* Render one list item. `item` is an object (or a plain string for
     string-lists, in which case the template should use {{.}}). */
  function renderItem(tpl, item, index) {
    var out;
    if (typeof item === 'string' || typeof item === 'number') {
      out = tpl.replace(/\{\{\.\}\}/g, esc(item));
      item = {};
    } else {
      item = item || {};
      out = renderSections(tpl, item);
    }
    out = out.replace(/\{\{\{([\w-]+)\}\}\}/g, function (_, k) {
      return item[k] == null ? '' : String(item[k]);
    });
    out = out
      .replace(/\{\{@i\}\}/g, String(index))
      .replace(/\{\{@n\}\}/g, String(index + 1))
      .replace(/\{\{@nn\}\}/g, (index + 1 < 10 ? '0' : '') + (index + 1));
    out = out.replace(/\{\{([\w-]+)\}\}/g, function (_, k) {
      return item[k] == null ? '' : esc(item[k]);
    });
    return out;
  }

  /* Render a whole list. Injects data-cms-item="<index>" into the first
     opening tag of each item so the admin can target items (image size
     measurement, etc.). */
  function renderList(tpl, items) {
    if (!Array.isArray(items)) items = [];
    return items.map(function (item, i) {
      var html = renderItem(tpl, item, i);
      return html.replace(/<([a-zA-Z][\w-]*)(\s|>|\/>)/, function (_, tag, end) {
        return '<' + tag + ' data-cms-item="' + i + '"' + (end === '>' || end === '/>' ? end : ' ');
      });
    }).join('\n');
  }

  /* data-cms-count-class support: pattern like "md:grid-cols-*" rewrites
     the matching class in a class attribute value to the item count. */
  function applyCountClass(classValue, pattern, count) {
    var reSrc = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '\\d+');
    return String(classValue).replace(new RegExp(reSrc), pattern.replace('*', count));
  }

  return {
    esc: esc,
    renderSections: renderSections,
    renderItem: renderItem,
    renderList: renderList,
    applyCountClass: applyCountClass
  };
}));
