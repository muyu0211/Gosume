// content script：在页面内收集可填写的表单控件，并按 popup 的填充计划写入。
// 仅在收到消息时动作，不主动改动页面。
(function () {
  'use strict';

  const SKIP_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image']);

  function isEditable(el) {
    if (!(el instanceof Element)) return false;
    if (el.disabled || el.readOnly) return false;
    if (SKIP_TYPES.has((el.type || '').toLowerCase())) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  // 清洗标签文本：合并空白、去掉常见标点与必填星号。
  function cleanLabel(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .replace(/[＊*：:?？（）()【】\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 去掉 placeholder 中的"请输入/请填写/请选择…"这类无字段语义的前缀。
  function cleanPlaceholder(s) {
    return cleanLabel(s).replace(/^(请输入|请填写|请选择|请输入您的|请填写您的|输入|填写|选择|例如|例|演示)/i, '').trim();
  }

  // 判断一段文本是否像"有意义的标签"，而不是纯占位文案。
  function hasMeaning(text) {
    const t = cleanLabel(text);
    return t.length > 0 && !/^(请输入|请填写|请选择|输入|填写|选择|示例|例如|demo|placeholder|type\s*here|enter)/i.test(t);
  }

  // 优先使用直接关联的精确标签（label[for]/aria/label 包裹）。
  function findDirectLabel(el) {
    if (el.id) {
      try {
        const forLabel = document.querySelector('label[for="' + window.CSS.escape(el.id) + '"]');
        const t = cleanLabel(forLabel && forLabel.textContent);
        if (hasMeaning(t)) return t;
      } catch (e) { /* 忽略选择器错误 */ }
    }
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = cleanLabel(labelledby.split(' ')
        .map((id) => { const n = document.getElementById(id); return n && n.textContent; })
        .filter(Boolean).join(' '));
      if (hasMeaning(t)) return t;
    }
    const aria = el.getAttribute('aria-label');
    if (hasMeaning(aria)) return cleanLabel(aria);
    const wrapped = el.closest('label');
    if (wrapped) {
      const t = cleanLabel(wrapped.textContent.replace(String(el.value || ''), ''));
      if (hasMeaning(t)) return t;
    }
    return '';
  }

  // 在表单容器的祖先链里寻找真实标签：优先同容器内的 <label>，再找
  // 具 label/field/title 语义的相邻节点。覆盖常见的
  // `<div class="form-item"><label>姓名</label><input/></div>` 结构。
  function findAncestorLabel(el) {
    let parent = el;
    for (let depth = 0; depth < 4; depth++) {
      parent = parent && parent.parentElement;
      if (!parent || parent.tagName === 'BODY' || parent.tagName === 'FORM') break;

      const labels = Array.from(parent.querySelectorAll('label'))
        .filter((l) => l !== el.closest('label') && !l.contains(el) && l.textContent.trim());
      for (const l of labels) {
        const t = cleanLabel(l.textContent);
        if (hasMeaning(t)) return t;
      }

      // 相邻的具"标签/字段"语义节点（label/name/title 类 class）
      const siblings = Array.from(parent.children).filter((c) => {
        const cls = typeof c.className === 'string' ? c.className : '';
        return c !== el && c.tagName !== 'INPUT' && /(^|[\s_-])(label|field|title|name|txt|text)([\s_-]|$)|form-item-label|form-label/.test(cls) && c.textContent.trim();
      });
      for (const s of siblings) {
        const t = cleanLabel(s.textContent);
        if (hasMeaning(t)) return t;
      }
    }
    return '';
  }

  // 兜底：name 属性（往往有语义，如 email/phone/school），最后才是 placeholder。
  function findFallbackLabel(el) {
    if (el.name && hasMeaning(el.name)) return cleanLabel(el.name);
    const ph = el.getAttribute('placeholder');
    if (ph && hasMeaning(cleanPlaceholder(ph))) return cleanPlaceholder(ph);
    return '';
  }

  function findLabel(el) {
    return findDirectLabel(el) || findAncestorLabel(el) || findFallbackLabel(el) || '';
  }

  function makeKey(el, pos) {
    if (el.id) return '#' + window.CSS.escape(el.id);
    if (el.name) return '[name=' + JSON.stringify(el.name) + ']';
    return 'pos:' + pos;
  }

  // 以与收集时间相同的顺序取当前页面可编辑控件，用于按位置兜底定位。
  function editableControls() {
    const out = [];
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (isEditable(el)) out.push(el);
    });
    return out;
  }

  function collect() {
    const result = [];
    const seen = new Set();
    let pos = 0;
    editableControls().forEach((el) => {
      const key = makeKey(el, pos);
      if (seen.has(key)) return;
      seen.add(key);
      result.push({
        key,
        positional: pos,
        tag: el.tagName.toLowerCase(),
        type: (el.type || '').toLowerCase(),
        label: findLabel(el),
        value: el.value || '',
        required: el.required || el.hasAttribute('required'),
      });
      pos++;
    });
    return result;
  }

  function locate(field) {
    if (field.key && !field.key.startsWith('pos:')) {
      try {
        const el = document.querySelector(field.key);
        if (el && isEditable(el)) return el;
      } catch (e) {
        /* ignore selector errors */
      }
    }
    const all = editableControls();
    const idx = typeof field.positional === 'number' ? field.positional : -1;
    return idx >= 0 && idx < all.length ? all[idx] : null;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillOne(field, value) {
    const el = locate(field);
    if (!el) return { key: field.key, status: 'skipped' };
    try {
      if (el.tagName === 'SELECT') {
        const ok = fillSelect(el, value);
        return { key: field.key, status: ok ? 'filled' : 'skipped' };
      }
      setNativeValue(el, String(value));
    } catch (e) {
      return { key: field.key, status: 'error' };
    }
    highlight(el);
    return { key: field.key, status: 'filled' };
  }

  function fillSelect(el, value) {
    const options = Array.from(el.options);
    // 优先值相等
    let opt = options.find((o) => o.value === String(value));
    if (!opt) {
      // text 相等（去掉序号前缀）
      opt = options.find((o) => o.text.trim() === String(value));
      if (!opt) {
        const v = String(value).split(/[.、\s]/)[0];
        const prefix = options.find((o) => o.text.replace(/^(\d+[.)、\s])/, '').trim() === String(value).trim());
        if (prefix) opt = prefix;
      }
    }
    if (!opt && options.length && el.required) return false;
    if (opt) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function highlight(el) {
    const old = el.style.outline;
    el.style.outline = '2px solid #4b3fe3';
    el.style.transition = 'outline-color .3s';
    setTimeout(() => {
      el.style.outline = old;
    }, 1500);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'GOSUME_COLLECT_FIELDS':
        sendResponse({ fields: collect() });
        return false; // sync response
      case 'GOSUME_FILL':
        const results = (msg.plan || []).map((row) => fillOne(row.field, row.value));
        sendResponse({ results });
        return false;
      default:
        return false;
    }
  });

  // 让脚本在每次消息时都处于就绪状态（配合非持久化注入）。
  console.debug('[gosume-autofill] content script ready');
})();