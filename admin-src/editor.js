/* ─────────────────────────────────────────────────────────────────────
   editor.js — schema-driven editor pane. One widget set, generalized
   over { get, set } bindings, replaces the MVP's per-page renderers
   and its inp/inpArr/strInpArr near-duplicates.

   Keystrokes mutate CMS.C directly and debounce a preview patch;
   structural changes (add/remove/move item) re-render only the
   affected list widget, so input focus is never lost while typing.
───────────────────────────────────────────────────────────────────── */
'use strict';

var CMSEditor = (function () {

  var esc = CMSTpl.esc;

  function bind(model, key) {
    return {
      get: function () { return model[key]; },
      set: function (v) { model[key] = v; }
    };
  }

  /* ── widgets ───────────────────────────────────────────────────── */

  function rowEl(label, hint) {
    var row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = '<label>' + esc(label) + (hint ? ' <span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
    return row;
  }

  function textWidget(binding, label) {
    var row = rowEl(label);
    var input = document.createElement('input');
    input.type = 'text';
    input.value = binding.get() != null ? binding.get() : '';
    input.addEventListener('input', function () {
      binding.set(input.value);
      CMSPreview.schedulePreviewUpdate();
    });
    row.appendChild(input);
    return row;
  }

  function textareaWidget(binding, label, tall, hint) {
    var row = rowEl(label, hint);
    var ta = document.createElement('textarea');
    if (tall) ta.className = 'tall';
    ta.value = binding.get() != null ? binding.get() : '';
    ta.addEventListener('input', function () {
      binding.set(ta.value);
      CMSPreview.schedulePreviewUpdate();
    });
    row.appendChild(ta);
    return row;
  }

  var uid = 0;
  function toggleWidget(binding, label) {
    var row = document.createElement('div');
    row.className = 'field-checkbox';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'cms-chk-' + (++uid);
    cb.checked = !!binding.get();
    var lbl = document.createElement('label');
    lbl.htmlFor = cb.id;
    lbl.textContent = label;
    cb.addEventListener('change', function () {
      binding.set(cb.checked);
      CMSPreview.schedulePreviewUpdate();
    });
    row.appendChild(cb);
    row.appendChild(lbl);
    return row;
  }

  /* ctx = null for flat fields, { listKey, index } for list items —
     lets the preview measure the rendered element for upload sizing. */
  function imageWidget(binding, field, label, ctx) {
    var row = rowEl(label);
    var imgRow = document.createElement('div');
    imgRow.className = 'img-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = binding.get() != null ? binding.get() : '';
    input.addEventListener('input', function () {
      binding.set(input.value);
      CMSPreview.schedulePreviewUpdate();
    });
    var btn = document.createElement('button');
    btn.className = 'img-upload-btn';
    btn.type = 'button';
    btn.textContent = '↑ Upload';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'hidden-file';
    btn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      btn.textContent = 'Compressing…';
      btn.disabled = true;
      CMSPreview.uploadImage(file, field, ctx, function (err, value) {
        if (err) alert('Upload failed: ' + err);
        else {
          input.value = value;
          binding.set(value);
          CMSPreview.schedulePreviewUpdate();
        }
        btn.textContent = '↑ Upload';
        btn.disabled = false;
        fileInput.value = '';
      });
    });
    imgRow.appendChild(input);
    imgRow.appendChild(btn);
    imgRow.appendChild(fileInput);
    row.appendChild(imgRow);
    return row;
  }

  /* String-list: rows of text inputs with remove buttons + Add. */
  function stringlistWidget(model, key, field, label) {
    var wrap = document.createElement('div');
    wrap.className = 'field-row';
    if (!Array.isArray(model[key])) model[key] = [];
    var arr = model[key];
    var min = field.min != null ? field.min : 0;
    var max = field.max != null ? field.max : Infinity;

    function render() {
      wrap.innerHTML = '<label>' + esc(label) + '</label>';
      arr.forEach(function (_, i) {
        var line = document.createElement('div');
        line.className = 'str-row';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = arr[i] != null ? arr[i] : '';
        input.addEventListener('input', function () {
          arr[i] = input.value;
          CMSPreview.schedulePreviewUpdate();
        });
        line.appendChild(input);
        if (arr.length > min) {
          var del = document.createElement('button');
          del.className = 'arr-btn arr-btn-del';
          del.type = 'button';
          del.textContent = '✕';
          del.title = 'Remove';
          del.addEventListener('click', function () {
            arr.splice(i, 1);
            CMSPreview.schedulePreviewUpdate();
            render();
          });
          line.appendChild(del);
        }
        wrap.appendChild(line);
      });
      if (arr.length < max) {
        var add = document.createElement('button');
        add.className = 'arr-add-btn';
        add.type = 'button';
        add.textContent = '+ Add';
        add.addEventListener('click', function () {
          arr.push('');
          CMSPreview.schedulePreviewUpdate();
          render();
        });
        wrap.appendChild(add);
      }
    }
    render();
    return wrap;
  }

  /* List of objects: item cards with per-item fields + toolbar. */
  function listWidget(field) {
    var wrap = document.createElement('div');
    if (!Array.isArray(CMS.C[field.key])) CMS.C[field.key] = [];
    var arr = CMS.C[field.key];
    var min = field.min != null ? field.min : 0;
    var max = field.max != null ? field.max : Infinity;
    var itemFields = field.itemFields || [];

    function newItem() {
      var it = {};
      itemFields.forEach(function (f) {
        it[f.key] = f.type === 'stringlist' ? [] : (f.type === 'toggle' ? false : '');
      });
      return it;
    }

    function itemTitle(item, i) {
      for (var k = 0; k < itemFields.length; k++) {
        var f = itemFields[k];
        if ((f.type === 'text' || f.type === 'textarea') && item[f.key]) {
          var t = String(item[f.key]);
          return t.length > 34 ? t.slice(0, 34) + '…' : t;
        }
      }
      return 'Item ' + (i + 1);
    }

    function toolbar(i) {
      var bar = document.createElement('div');
      bar.className = 'arr-item-toolbar';
      function moveBtn(txt, delta, title) {
        var b = document.createElement('button');
        b.className = 'arr-btn arr-btn-move';
        b.type = 'button';
        b.textContent = txt;
        b.title = title;
        b.addEventListener('click', function () {
          var tmp = arr[i + delta]; arr[i + delta] = arr[i]; arr[i] = tmp;
          CMSPreview.schedulePreviewUpdate();
          render();
        });
        return b;
      }
      if (i > 0) bar.appendChild(moveBtn('↑', -1, 'Move up'));
      if (i < arr.length - 1) bar.appendChild(moveBtn('↓', 1, 'Move down'));
      if (arr.length > min) {
        var del = document.createElement('button');
        del.className = 'arr-btn arr-btn-del';
        del.type = 'button';
        del.textContent = 'Remove';
        del.addEventListener('click', function () {
          arr.splice(i, 1);
          CMSPreview.schedulePreviewUpdate();
          render();
        });
        bar.appendChild(del);
      }
      return bar;
    }

    function render() {
      wrap.innerHTML = '';
      arr.forEach(function (item, i) {
        if (item == null || typeof item !== 'object') { item = arr[i] = {}; }
        var card = document.createElement('div');
        card.className = 'arr-item';
        var title = document.createElement('div');
        title.className = 'arr-item-title';
        title.textContent = itemTitle(item, i);
        card.appendChild(title);
        itemFields.forEach(function (f) {
          card.appendChild(renderField(f, item, { listKey: field.key, index: i }));
        });
        card.appendChild(toolbar(i));
        wrap.appendChild(card);
      });
      if (arr.length < max) {
        var add = document.createElement('button');
        add.className = 'arr-add-btn';
        add.type = 'button';
        add.textContent = '+ Add item';
        add.addEventListener('click', function () {
          arr.push(newItem());
          CMSPreview.schedulePreviewUpdate();
          render();
        });
        wrap.appendChild(add);
      }
    }
    render();
    return wrap;
  }

  /* ── dispatch ──────────────────────────────────────────────────── */

  function renderField(field, model, ctx) {
    var label = field.label || field.key;
    switch (field.type) {
      case 'textarea':
        return textareaWidget(bind(model, field.key), label, false);
      case 'richtext':
        return textareaWidget(bind(model, field.key), label, true, 'HTML allowed');
      case 'image':
        return imageWidget(bind(model, field.key), field, label, ctx || null);
      case 'toggle':
        return toggleWidget(bind(model, field.key), label);
      case 'stringlist':
        return stringlistWidget(model, field.key, field, label);
      case 'list':
        return listWidget(field);
      default: // 'text', 'icon', anything unknown
        return textWidget(bind(model, field.key), label);
    }
  }

  /* ── section cards ─────────────────────────────────────────────── */

  function secCard(key, label, fill) {
    var card = document.createElement('div');
    card.className = 'sec-card';
    card.setAttribute('data-section', key);
    var header = document.createElement('div');
    header.className = 'sec-card-header';
    header.innerHTML =
      '<svg class="sec-card-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,4 10,8 6,12"/></svg>' +
      '<span class="sec-card-label">' + esc(label) + '</span>';
    header.addEventListener('click', function () { card.classList.toggle('open'); });
    var body = document.createElement('div');
    body.className = 'sec-card-body';
    fill(body);
    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function renderEditor() {
    var inner = document.getElementById('editor-inner');
    inner.innerHTML = '';
    if (!CMS.activePage) return;
    CMS.activePage.sections.forEach(function (section, i) {
      var card = secCard(section.key, section.label, function (body) {
        section.fields.forEach(function (field) {
          body.appendChild(renderField(field, CMS.C, null));
        });
      });
      if (i === 0) card.classList.add('open');
      inner.appendChild(card);
    });
  }

  return { renderEditor: renderEditor };
})();
