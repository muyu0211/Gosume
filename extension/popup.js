// popup：连接本地桥 → 取简历 → 检测本页表单 → 编辑映射 → 写入并回显结果。
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SVG = {
    ok: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    skip: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/></svg>',
    err: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    spin: '<svg class="spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>',
  };

  const state = {
    creds: null,
    payload: null,
    fields: [],
    plan: [],
  };

  const ui = {};
  ['statusPill', 'statusText', 'connectView', 'mainView',
    'portInput', 'tokenInput', 'connectMsg', 'connectBtn', 'pastePairBtn',
    'resumeName', 'resumeSub', 'scanBtn', 'scanMsg', 'scanHint',
    'mapList', 'fillArea', 'fillBtn', 'fillMsg', 'resultSummary', 'resultList',
  ].forEach((id) => { ui[id] = $(id); });

  const isFilled = (s) => String(s || '').trim() !== '';

  function setPill(stateName, text) {
    ui.statusPill.dataset.state = stateName;
    ui.statusText.textContent = text;
  }

  // 按钮忙碌态：切换 loading 文案与禁用，避免重复点击。
  function busy(btn, on, busyText, normalText) {
    if (on) {
      btn.dataset.normal = btn.textContent;
      btn.innerHTML = SVG.spin + '<span>' + busyText + '</span>';
      btn.disabled = true;
    } else {
      btn.disabled = false;
      const label = typeof normalText === 'string' ? normalText : btn.dataset.normal;
      btn.textContent = label;
    }
  }

  function showMsg(el, kind, text) {
    el.className = 'msg' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    el.innerHTML = kind === 'ok'
      ? SVG.ok + '<span>' + escapeHtml(text) + '</span>'
      : kind === 'err'
        ? SVG.err + '<span>' + escapeHtml(text) + '</span>'
        : '<span>' + escapeHtml(text) + '</span>';
  }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && tab.id;
  }

  function bridgeUrl(path) {
    return `http://127.0.0.1:${state.creds.port}${path}`;
  }

  async function bridgeFetch(path) {
    const res = await fetch(bridgeUrl(path), {
      headers: { Authorization: 'Bearer ' + state.creds.token },
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('鉴权失败，请重新配对');
      throw new Error('连接失败 (' + res.status + ')');
    }
    return res.json();
  }

  // ---- 连接 ----
  async function saveCreds(port, token) {
    state.creds = { port: Number(port) || 47621, token: token.trim() };
    await chrome.storage.local.set({ creds: state.creds });
  }

  async function connect(port, token, { fromPaste } = {}) {
    const tokenVal = (token || '').trim();
    if (!tokenVal) {
      showMsg(ui.connectMsg, 'err', '请输入配对 token');
      return;
    }
    const btn = fromPaste ? ui.pastePairBtn : ui.connectBtn;
    busy(btn, true, '连接中…');
    showMsg(ui.connectMsg, 'info', '');
    try {
      await saveCreds(port, tokenVal);
      const res = await fetch(bridgeUrl('/api/status'), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await res.json();
    } catch (e) {
      showMsg(ui.connectMsg, 'err', `无法连接 Gosume: ${e.message}`);
      busy(btn, false);
      setPill('idle', '未连接');
      return;
    }
    busy(btn, false);
    setPill('online', '已连接');
    enterMain();
  }

  // 切到主面板并加载简历。
  async function enterMain() {
    ui.connectView.hidden = true;
    ui.mainView.hidden = false;
    ui.resumeName.textContent = '加载中…';
    ui.resumeSub.textContent = '';
    try {
      state.payload = await bridgeFetch('/api/resume');
      const name = state.payload.resume_name || '未命名简历';
      ui.resumeName.textContent = name;
      const n = Object.keys(state.payload.fields || {}).length;
      ui.resumeSub.textContent = n > 0 ? `已从本地读取 ${n} 个可填入字段` : '当前简历没有可填入的字段';
    } catch (e) {
      ui.resumeName.textContent = '读取失败';
      ui.resumeSub.textContent = e.message;
    }
  }

  ui.pastePairBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const m = text.match(/gosume:\/\/autofill[?&#]*port=(\d+)&token=([0-9a-f]+)/i);
      if (!m) { showMsg(ui.connectMsg, 'err', '剪贴板里没有有效的配对码'); return; }
      ui.portInput.value = m[1];
      ui.tokenInput.value = m[2];
      connect(m[1], m[2], { fromPaste: true });
    } catch (e) {
      showMsg(ui.connectMsg, 'err', '无法读取剪贴板，请手动填写');
    }
  });

  ui.connectBtn.addEventListener('click', () => {
    connect(ui.portInput.value, ui.tokenInput.value);
  });

  // ---- 检测本页表单 ----
  ui.scanBtn.addEventListener('click', async () => {
    busy(ui.scanBtn, true, '检测中…');
    ui.scanHint.hidden = true;
    ui.mapList.innerHTML = '';
    ui.fillArea.hidden = true;
    showMsg(ui.scanMsg, 'info', '');
    if (!state.payload) {
      try { await enterMain(); } catch { /* 载入失败时下方统一提示 */ }
    }
    const tabId = await getActiveTabId();
    if (tabId == null) {
      busy(ui.scanBtn, false);
      showMsg(ui.scanMsg, 'err', '无法访问当前标签页');
      return;
    }
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tabId, { type: 'GOSUME_COLLECT_FIELDS' });
    } catch {
      resp = null;
    }
    busy(ui.scanBtn, false);
    if (!resp || !resp.fields) {
      showMsg(ui.scanMsg, 'err', '当前页面不是可填写的表单，请切换到求职表单页再试');
      ui.scanHint.hidden = false;
      return;
    }
    state.fields = resp.fields;
    if (!state.fields.length) {
      showMsg(ui.scanMsg, 'ok', '未发现可填写的字段');
      const empty = document.createElement('div');
      empty.className = 'map-empty';
      empty.textContent = '此页面没有可填写的输入框。';
      ui.mapList.appendChild(empty);
      return;
    }
    showMsg(ui.scanMsg, 'ok', `检测到 ${state.fields.length} 个字段，已自动匹配`);
    buildMapping();
  });

  function buildMapping() {
    const resumeFields = window.GosumeMap.listResumeFields(state.payload);
    ui.mapList.innerHTML = '';
    state.plan = [];

    state.fields.forEach((field, i) => {
      const suggested = window.GosumeMap.suggestField(field, state.payload);
      const row = document.createElement('div');
      row.className = 'rowmap select-empty';

      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      const req = field.required ? '<span class="req">*</span>' : '';
      const labelText = field.label || field.key || `字段 ${i + 1}`;
      const hint = window.GosumeMap.FIELD_LABELS[suggested];
      lbl.innerHTML = escapeHtml(labelText) + (hint ? `<span class="req" title="已匹配：${escapeHtml(hint)}"> ⤷${escapeHtml(hint)}</span>` : '') + req;

      const sel = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— 不填写 —';
      sel.appendChild(noneOpt);
      if (!resumeFields.length) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '__none__';
        emptyOpt.textContent = '（简历无可用字段）';
        sel.appendChild(emptyOpt);
        sel.disabled = true;
      } else {
        resumeFields.forEach((rf) => {
          const opt = document.createElement('option');
          opt.value = rf.key;
          opt.textContent = `${rf.label}：${rf.value}`;
          if (rf.key === suggested) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      row.appendChild(lbl);
      row.appendChild(sel);
      ui.mapList.appendChild(row);

      // 用闭包保存索引，避免 dataset 字符串索引的脆弱性。
      const planRow = { field, value: suggested ? (state.payload.fields[suggested] || '') : '' };
      state.plan.push(planRow);
      const syncSelectStyle = () => {
        row.classList.toggle('select-empty', !planRow.value);
      };
      sel.addEventListener('change', () => {
        const key = sel.value;
        planRow.value = key ? (state.payload.fields[key] || '') : '';
        syncSelectStyle();
      });
      syncSelectStyle();
    });

    ui.fillArea.hidden = false;
    ui.resultSummary.hidden = true;
    ui.resultList.innerHTML = '';
  }

  // ---- 写入 ----
  ui.fillBtn.addEventListener('click', async () => {
    const plan = state.plan.filter((p) => isFilled(p.value));
    if (!plan.length) {
      showMsg(ui.fillMsg, 'err', '尚未选择要填入的字段');
      return;
    }
    busy(ui.fillBtn, true, '填入中…');
    ui.resultList.innerHTML = '';
    ui.resultSummary.hidden = true;
    showMsg(ui.fillMsg, 'info', '正在写入页面…');

    const tabId = await getActiveTabId();
    if (tabId == null) {
      busy(ui.fillBtn, false);
      showMsg(ui.fillMsg, 'err', '无法访问当前标签页');
      return;
    }

    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tabId, { type: 'GOSUME_FILL', plan });
    } catch (e) {
      resp = { error: '无法与本页通信：' + (e.message || e) };
    }
    busy(ui.fillBtn, false);

    if (resp.error) {
      showMsg(ui.fillMsg, 'err', resp.error);
      return;
    }

    renderResults(plan, resp.results || []);
  });

  function renderResults(plan, results) {
    const counts = { ok: 0, skip: 0, err: 0 };
    const list = document.createElement('ul');
    list.className = 'bag';

    plan.forEach((p, i) => {
      const r = results[i] || {};
      const status = r.status === 'filled' ? 'ok' : r.status === 'error' ? 'err' : 'skip';
      counts[status]++;

      const li = document.createElement('li');
      const icon = document.createElement('span');
      icon.className = 'icon icon-' + status;
      icon.innerHTML = status === 'ok' ? SVG.ok : status === 'err' ? SVG.err : SVG.skip;
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = p.field.label || p.field.key || '字段';
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = status === 'ok' ? String(p.value) : (r.status === 'skipped' ? '未找到控件' : '写入失败');
      li.appendChild(icon);
      li.appendChild(k);
      li.appendChild(v);
      list.appendChild(li);
    });

    ui.resultList.innerHTML = '';
    ui.resultList.appendChild(list);

    const total = plan.length;
    let cls, text;
    if (counts.err > 0) {
      cls = 'fail';
      text = `${counts.err} 项写入失败，其余 ${counts.ok} 项已写入`;
    } else if (counts.skip > 0) {
      cls = 'part';
      text = `已写入 ${counts.ok}/${total} 项，${counts.skip} 项未找到对应控件`;
    } else {
      cls = 'ok';
      text = `全部写入成功：${total} 项`;
    }

    ui.resultSummary.className = 'result-summary ' + cls;
    ui.resultSummary.innerHTML =
      (cls === 'ok' ? SVG.ok : cls === 'part' ? SVG.skip : SVG.err) +
      '<span>' + text + '（已写入的输入框在页面高亮）</span>';
    ui.resultSummary.hidden = false;
    showMsg(ui.fillMsg, 'info', '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- 启动：恢复上次配对并自动连接 ----
  (async function init() {
    const stored = await chrome.storage.local.get('creds');
    if (stored.creds) {
      ui.portInput.value = stored.creds.port;
      ui.tokenInput.value = stored.creds.token;
      await connect(stored.creds.port, stored.creds.token);
    }
  })();
})();