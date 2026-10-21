'use strict';

/* =========================================================
   肌肤日记 — 个人护肤记录 PWA
   数据全部存在本机浏览器的 IndexedDB 里：
   - days      每天的流程、皮肤状态、影响因素、备注（文字，可备份）
   - products  产品库（文字，可备份）
   - photos    照片（只存本机，不进备份）
   - meta      标签列表、上次备份时间等
   ========================================================= */

const APP_VERSION = '1.1';

// 皮肤状态选项（可在应用里编辑）。goodHigh = 分数越高越好
const DEFAULT_METRICS = [
  { k: 'overall', name: '整体', goodHigh: true },
  { k: 'oil', name: '出油', goodHigh: false },
  { k: 'dry', name: '干燥', goodHigh: false },
  { k: 'acne', name: '痘痘', goodHigh: false },
  { k: 'red', name: '泛红', goodHigh: false },
  { k: 'sens', name: '敏感', goodHigh: false },
];
const metrics = () => state.meta.metrics;
const metricByKey = (k) => state.meta.metrics.find((m) => m.k === k);
const metricHint = (m) => (m.goodHigh ? '1差 · 5好' : '1无 · 5重');

// 每周晚间计划
const PLAN_ICONS = {
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  drops: '<path d="M8 9c-2 2.5-3 4-3 5.5a3 3 0 006 0C11 13 10 11.5 8 9z"/><path d="M16 3c-1.6 2-2.5 3.3-2.5 4.6a2.5 2.5 0 005 0C18.5 6.3 17.6 5 16 3z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l7-7"/>',
  mask: '<rect x="5" y="3" width="14" height="18" rx="7"/><path d="M9.5 10h.01M14.5 10h.01M10 15h4"/>',
  drop: '<path d="M12 3c-3.5 4.5-5.5 7.5-5.5 10.5a5.5 5.5 0 0011 0C17.5 10.5 15.5 7.5 12 3z"/>',
  rest: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/>',
};
const PLAN_COLORS = ['gray', 'sage', 'lilac', 'peach', 'sky', 'sand'];
const DEFAULT_PLANS = [
  { id: 'repair', name: '修护', icon: 'shield', color: 'gray', products: [] },
  { id: 'bha', name: '水杨酸', icon: 'drops', color: 'sage', products: [] },
  { id: 'reti', name: '维A', icon: 'moon', color: 'lilac', products: [] },
];
// 键是 JS 的 getDay()：0 = 周日
const DEFAULT_WEEK = { 1: 'repair', 2: 'bha', 3: 'repair', 4: 'repair', 5: 'reti', 6: 'repair', 0: 'repair' };
const WD_MON = ['一', '二', '三', '四', '五', '六', '日'];
const planIcon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${PLAN_ICONS[name] || PLAN_ICONS.rest}</svg>`;
const planById = (id) => state.meta.plans.find((p) => p.id === id);
const planFor = (date) => planById(state.meta.week[parse(date).getDay()]);

const CATEGORIES = ['卸妆', '洁面', '化妆水', '精华', '眼霜', '乳液/面霜', '防晒', '面膜', '去角质', '其他'];
const CAT_BADGE = { '卸妆': '卸', '洁面': '洁', '化妆水': '水', '精华': '精', '眼霜': '眼', '乳液/面霜': '霜', '防晒': '晒', '面膜': '膜', '去角质': '酸', '其他': '其' };
const SLOT_NAME = { am: '早间', pm: '晚间', both: '早晚都用' };
const DEFAULT_TAGS = ['熬夜', '生理期', '压力大', '换季', '运动出汗', '饮酒', '吃辣/甜', '化妆', '晒太阳'];

/* ---------------- 小工具 ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtCN = (s) => { const d = parse(s); return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`; };
const fmtShort = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------------- IndexedDB（打不开时退回内存，用于预览） ---------------- */
let db = null;
const mem = { days: new Map(), products: new Map(), photos: new Map(), meta: new Map() };
const KP = { days: 'date', products: 'id', photos: 'id', meta: 'key' };
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('skinlog', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('days', { keyPath: 'date' });
      d.createObjectStore('products', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('date', 'date');
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idb(store, mode, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
const dbAll = (s) => (db ? idb(s, 'readonly', (st) => st.getAll()) : Promise.resolve([...mem[s].values()]));
const dbPut = (s, v) => (db ? idb(s, 'readwrite', (st) => st.put(v)) : (mem[s].set(v[KP[s]], v), Promise.resolve()));
const dbDel = (s, k) => (db ? idb(s, 'readwrite', (st) => st.delete(k)) : (mem[s].delete(k), Promise.resolve()));
const dbClear = (s) => (db ? idb(s, 'readwrite', (st) => st.clear()) : (mem[s].clear(), Promise.resolve()));
const photosOn = (date) => (db
  ? idb('photos', 'readonly', (st) => st.index('date').getAll(date))
  : Promise.resolve([...mem.photos.values()].filter((p) => p.date === date)));

/* ---------------- 状态 ---------------- */
const state = {
  tab: 'today',
  date: today(),
  days: new Map(),
  products: [],
  meta: {
    key: 'meta', tags: DEFAULT_TAGS.slice(), lastBackup: 0,
    metrics: DEFAULT_METRICS.map((m) => ({ ...m })),
    plans: DEFAULT_PLANS.map((p) => ({ ...p, products: [] })),
    week: { ...DEFAULT_WEEK },
  },
  trend: { range: 30, metric: 'overall', cmp: '' },
  planDraft: null,
  photoSel: [],
  compare: false,
};
let objectURLs = [];
const keepURL = (blob) => { const u = URL.createObjectURL(blob); objectURLs.push(u); return u; };
const dropURLs = () => { objectURLs.forEach((u) => URL.revokeObjectURL(u)); objectURLs = []; };

function getDay(date) {
  return state.days.get(date) || { date, am: [], pm: [], s: {}, tags: [], note: '' };
}
function dayIsEmpty(d) {
  return !d.am.length && !d.pm.length && !Object.keys(d.s).length && !d.tags.length && !d.note.trim() && !d.sleep;
}
async function saveDay(d) {
  if (dayIsEmpty(d)) { state.days.delete(d.date); await dbDel('days', d.date); }
  else { state.days.set(d.date, d); await dbPut('days', d); askPersist(); }
}
const saveMeta = () => dbPut('meta', state.meta);
const prodById = (id) => state.products.find((p) => p.id === id);

let persistAsked = false;
function askPersist() {
  if (persistAsked) return; persistAsked = true;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function sortProducts(list) {
  return list.slice().sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, 'zh'));
}
function productsFor(slot, date, day) {
  const base = state.products.filter((p) =>
    (p.slot === 'both' || p.slot === slot) &&
    (!p.openedAt || p.openedAt <= date) &&
    (!p.stoppedAt || p.stoppedAt >= date));
  // 当天已勾选但不在列表里的（比如后来停用了）也显示出来
  day[slot].forEach((id) => { const p = prodById(id); if (p && !base.includes(p)) base.push(p); });
  return sortProducts(base);
}

/* ---------------- 渲染入口 ---------------- */
async function render() {
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  dropURLs();
  const v = $('#view');
  if (state.tab === 'today') v.innerHTML = await viewToday();
  else if (state.tab === 'trends') { v.innerHTML = viewTrends(); requestAnimationFrame(drawChart); }
  else if (state.tab === 'photos') v.innerHTML = await viewPhotos();
  else if (state.tab === 'products') v.innerHTML = viewProducts();
  else if (state.tab === 'settings') { v.innerHTML = viewSettings(); fillStorageInfo(); }
}

/* ---------------- 今天 ---------------- */
const ICON_L = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_R = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

async function viewToday() {
  const d = state.date;
  const day = getDay(d);
  const isToday = d === today();
  const photos = await photosOn(d);

  let html = `
  <div class="head">
    <div>
      <h1 class="datelabel">${isToday ? '今天' : esc(fmtCN(d))}
        <input type="date" id="pickdate" value="${d}" max="${today()}">
      </h1>
      <div class="sub">${isToday ? esc(fmtCN(d)) : `<button class="link" data-act="goto-today">回到今天</button>`}</div>
    </div>
    <div class="datenav">
      <button class="iconbtn" data-act="day" data-n="-1" aria-label="前一天">${ICON_L}</button>
      <button class="iconbtn" data-act="day" data-n="1" aria-label="后一天" ${isToday ? 'disabled style="opacity:.35"' : ''}>${ICON_R}</button>
    </div>
  </div>`;


  // 每周晚间计划
  html += weekStrip();

  // 流程
  const plan = planFor(d);
  for (const slot of ['am', 'pm']) {
    const list = productsFor(slot, d, day);
    let title = slot === 'am' ? '☀︎ 早间流程' : '☾ 晚间流程';
    let btns = list.length ? `<button class="minibtn" data-act="copy-last" data-slot="${slot}">同上次</button>` : '';
    if (slot === 'pm' && plan) {
      title += ` <span class="plantag pc-${plan.color}">${planIcon(plan.icon)}${esc(plan.name)}</span>`;
      if (plan.products.some((id) => prodById(id))) {
        btns = `<button class="minibtn" data-act="apply-plan">按计划</button>${btns}`;
      }
    }
    html += `<section class="card"><h2><span class="h2l">${title}</span><span class="btns">${btns}</span></h2>`;
    if (!state.products.length) {
      html += `<div class="empty">还没有产品，先去 <a href="#" data-act="tab" data-tab="products">产品</a> 添加你在用的东西。</div>`;
    } else if (!list.length) {
      html += `<div class="empty">没有标记为${slot === 'am' ? '早间' : '晚间'}使用的产品。</div>`;
    } else {
      html += `<div class="chips">${list.map((p) =>
        `<button class="chip ${day[slot].includes(p.id) ? 'on' : ''}" data-act="toggle-prod" data-slot="${slot}" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
    }
    html += `</section>`;
  }

  // 皮肤状态
  html += `<section class="card"><h2>皮肤状态 <button class="minibtn" data-act="metrics">编辑选项</button></h2>`;
  if (!metrics().length) html += `<div class="empty">还没有选项，点「编辑选项」添加。</div>`;
  for (const m of metrics()) {
    html += `<div class="score"><div class="lbl">${esc(m.name)}<small>${metricHint(m)}</small></div>
      ${dots(day.s[m.k] || 0, m.goodHigh, `data-act="score" data-k="${m.k}"`)}</div>`;
  }
  html += `<div class="faint" style="margin-top:6px">再点一次同一个分数可以清除</div></section>`;

  // 睡眠
  html += sleepCard(d, day);

  // 影响因素
  html += `<section class="card"><h2>影响因素</h2><div class="chips">
    ${state.meta.tags.map((t) => `<button class="chip ${day.tags.includes(t) ? 'on' : ''}" data-act="tag" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
    <button class="chip ghost" data-act="add-tag">＋ 自定义</button></div></section>`;

  // 备注
  html += `<section class="card"><h2>备注</h2>
    <textarea id="note" placeholder="比如：下巴冒了两颗闭口；今天换了新的防晒…">${esc(day.note)}</textarea></section>`;

  // 照片
  html += `<section class="card"><h2>照片 <span class="faint">只存在本机</span></h2><div class="thumbs">
    ${photos.map((p) => `<button class="thumb" data-act="view-photo" data-id="${p.id}"><img src="${keepURL(p.blob)}" alt=""></button>`).join('')}
    <label class="thumb addphoto">＋<input type="file" accept="image/*" id="addphoto"></label>
  </div></section>`;

  return html;
}

async function toggleProd(slot, id) {
  const day = getDay(state.date);
  day[slot] = day[slot].includes(id) ? day[slot].filter((x) => x !== id) : [...day[slot], id];
  await saveDay(day);
  render();
}
async function copyLast(slot) {
  const prev = [...state.days.values()]
    .filter((x) => x.date < state.date && x[slot].length)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!prev) return toast('之前还没有记录');
  const day = getDay(state.date);
  day[slot] = prev[slot].filter((id) => prodById(id));
  await saveDay(day);
  toast(`已套用 ${fmtShort(prev.date)} 的${slot === 'am' ? '早间' : '晚间'}流程`);
  render();
}
async function setScore(k, v) {
  const day = getDay(state.date);
  if (day.s[k] === v) delete day.s[k]; else day.s[k] = v;
  await saveDay(day);
  render();
}
async function toggleTag(t) {
  const day = getDay(state.date);
  day.tags = day.tags.includes(t) ? day.tags.filter((x) => x !== t) : [...day.tags, t];
  await saveDay(day);
  render();
}
async function addTag() {
  const t = (prompt('新的影响因素（比如：咖啡、旅行、新枕套）') || '').trim();
  if (!t) return;
  if (!state.meta.tags.includes(t)) { state.meta.tags.push(t); await saveMeta(); }
  const day = getDay(state.date);
  if (!day.tags.includes(t)) day.tags.push(t);
  await saveDay(day);
  render();
}
let noteTimer;
function onNoteInput(e) {
  const date = state.date, text = e.target.value;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => { const day = getDay(date); day.note = text; await saveDay(day); }, 400);
}

function dots(val, goodHigh, attrs) {
  return `<div class="dots ${goodHigh ? 'reverse' : ''}">${[1, 2, 3, 4, 5].map((v) =>
    `<button class="dot ${val === v ? 'on' : ''}" data-v="${v}" ${attrs}>${v}</button>`).join('')}</div>`;
}

/* ---------------- 每周晚间计划 ---------------- */
function weekStrip() {
  const dow = (parse(state.date).getDay() + 6) % 7; // 周一 = 0
  const mon = addDays(state.date, -dow);
  const t = today();
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const date = addDays(mon, i);
    const p = planFor(date);
    cells += `<button class="wday pc-${p ? p.color : 'gray'} ${date === state.date ? 'sel' : ''} ${date === t ? 'is-today' : ''} ${date > t ? 'future' : ''}"
      data-act="goto-date" data-d="${date}" aria-label="${esc(fmtCN(date))}">
      <span class="wd">周${WD_MON[i]}</span>${planIcon(p ? p.icon : 'rest', 'wicon')}<span class="pl">${p ? esc(p.name) : '—'}</span></button>`;
  }
  return `<section class="week">
    <div class="weekhead"><span>本周晚间计划 <span class="faint">${esc(fmtShort(mon))} – ${esc(fmtShort(addDays(mon, 6)))}</span></span>
      <button class="minibtn" data-act="week-edit">编辑</button></div>
    <div class="weekgrid">${cells}</div></section>`;
}
function gotoDate(date) {
  if (date > today()) { const p = planFor(date); return toast(`${fmtCN(date)}${p ? '：' + p.name : ''}`); }
  state.date = date; render();
}
async function applyPlan() {
  const p = planFor(state.date); if (!p) return;
  const day = getDay(state.date);
  day.pm = p.products.filter((id) => prodById(id));
  await saveDay(day);
  toast(`已按「${p.name}」计划勾选`);
  render();
}

function weekEditor() {
  const w = state.meta.week;
  const rows = WD_MON.map((n, i) => {
    const js = (i + 1) % 7;
    return `<div class="setrow"><span class="t">周${n}</span>
      <select data-wd="${js}">${state.meta.plans.map((p) => `<option value="${p.id}" ${w[js] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      <option value="" ${!w[js] || !planById(w[js]) ? 'selected' : ''}>不安排</option></select></div>`;
  }).join('');
  const plans = state.meta.plans.map((p) => `<button class="planrow" data-act="plan-edit" data-id="${p.id}">
      <span class="planico pc-${p.color}">${planIcon(p.icon)}</span>
      <span class="meta"><div class="name">${esc(p.name)}</div>
      <div class="sub">${p.products.filter((id) => prodById(id)).map((id) => esc(prodById(id).name)).join('、') || '还没关联产品'}</div></span>
      <span class="faint">编辑 ›</span></button>`).join('');
  openSheet(`<div class="panel">
    <h3>每周晚间计划<button class="minibtn" data-act="close-render">完成</button></h3>
    <div class="muted" style="margin-bottom:4px">每天安排</div>
    <div class="card" style="padding:4px 16px">${rows}</div>
    <div class="muted" style="margin:14px 0 4px">护理类型 <span class="faint">关联产品后，今天页可以「按计划」一键勾选</span></div>
    <div class="card" style="padding:4px 16px">${plans}</div>
    <button class="btn secondary" data-act="plan-edit" data-id="">＋ 新增护理类型</button>
  </div>`);
}
function planEditor(id) {
  if (id !== undefined) {
    const p = planById(id);
    state.planDraft = p ? JSON.parse(JSON.stringify(p)) : { id: '', name: '', icon: 'sparkle', color: 'peach', products: [] };
  }
  const d = state.planDraft;
  const prods = sortProducts(state.products.filter((p) => p.slot !== 'am' && (!p.stoppedAt || p.stoppedAt >= today() || d.products.includes(p.id))));
  openSheet(`<div class="panel">
    <h3>${d.id ? '编辑护理类型' : '新增护理类型'}<button class="minibtn" data-act="week-edit">返回</button></h3>
    <div class="field"><label>名称</label><input type="text" id="pl-name" value="${esc(d.name)}" placeholder="比如：果酸、面膜日、空白日"></div>
    <div class="field"><label>图标</label><div class="pickgrid">${Object.keys(PLAN_ICONS).map((k) =>
      `<button class="pick ${d.icon === k ? 'on' : ''}" data-act="pl-icon" data-v="${k}">${planIcon(k)}</button>`).join('')}</div></div>
    <div class="field"><label>颜色</label><div class="pickgrid">${PLAN_COLORS.map((c) =>
      `<button class="pick swatch pc-${c} ${d.color === c ? 'on' : ''}" data-act="pl-color" data-v="${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field"><label>这天晚上用的产品</label>
      ${prods.length ? `<div class="chips">${prods.map((p) => `<button class="chip ${d.products.includes(p.id) ? 'on' : ''}" data-act="pl-prod" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
        : '<div class="empty">先在「产品」里添加晚间使用的产品。</div>'}</div>
    <div class="stack">
      <button class="btn" data-act="pl-save">保存</button>
      ${d.id && state.meta.plans.length > 1 ? `<button class="btn danger" data-act="pl-del">删除这个类型</button>` : ''}
    </div></div>`);
}
async function savePlan() {
  const d = state.planDraft;
  d.name = d.name.trim();
  if (!d.name) return toast('请填写名称');
  if (!d.id) { d.id = uid(); state.meta.plans.push(d); }
  else state.meta.plans = state.meta.plans.map((p) => (p.id === d.id ? d : p));
  await saveMeta();
  state.planDraft = null;
  weekEditor();
  toast('已保存');
}
async function deletePlan() {
  const d = state.planDraft;
  const used = Object.values(state.meta.week).filter((x) => x === d.id).length;
  if (!confirm(`删除「${d.name}」？${used ? `\n有 ${used} 天用的是它，这些天会改成「不安排」。` : ''}`)) return;
  state.meta.plans = state.meta.plans.filter((p) => p.id !== d.id);
  for (const k of Object.keys(state.meta.week)) if (state.meta.week[k] === d.id) state.meta.week[k] = '';
  await saveMeta();
  state.planDraft = null;
  weekEditor();
}

/* ---------------- 睡眠 ---------------- */
const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(Math.round(m % 60))}`;
function sleepMinutes(s) {
  if (!s || !s.bed || !s.wake) return null;
  const m = (toMin(s.wake) - toMin(s.bed) + 1440) % 1440;
  return m || null;
}
const fmtDur = (m) => (m == null ? '–' : `${Math.floor(m / 60)}小时${m % 60 ? `${m % 60}分` : ''}`);
const fmtDurShort = (m) => (m == null ? '–' : `${Math.floor(m / 60)}h${m % 60 ? pad2(m % 60) : ''}`);

function sleepCard(d, day) {
  const s = day.sleep || {};
  const mins = sleepMinutes(s);
  return `<section class="card"><h2><span class="h2l">睡眠 <span class="muted">${d === today() ? '昨晚' : '前一晚'}</span></span>
    <span class="btns">${day.sleep ? `<button class="minibtn" data-act="sleep-clear" style="color:var(--ink-3)">清除</button>` : ''}
    <button class="minibtn" data-act="sleep-copy">同上次</button></span></h2>
    <div class="sleeprow">
      <label class="tfield"><span>入睡</span><input type="time" id="sl-bed" value="${esc(s.bed || '')}"></label>
      <label class="tfield"><span>起床</span><input type="time" id="sl-wake" value="${esc(s.wake || '')}"></label>
      <div class="dur"><b>${mins == null ? '–' : esc(fmtDur(mins))}</b><span>时长</span></div>
    </div>
    <div class="score"><div class="lbl">睡眠质量<small>1差 · 5好</small></div>${dots(s.q || 0, true, 'data-act="sleep-q"')}</div>
  </section>`;
}
async function setSleep(field, value) {
  const day = getDay(state.date);
  const s = { ...(day.sleep || {}) };
  if (value === '' || value == null) delete s[field]; else s[field] = value;
  day.sleep = Object.keys(s).length ? s : undefined;
  if (!day.sleep) delete day.sleep;
  await saveDay(day);
  render();
}
async function copySleep() {
  const prev = [...state.days.values()]
    .filter((x) => x.date < state.date && x.sleep && x.sleep.bed)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!prev) return toast('之前还没有睡眠记录');
  const day = getDay(state.date);
  day.sleep = { ...(day.sleep || {}), bed: prev.sleep.bed, wake: prev.sleep.wake };
  await saveDay(day);
  toast(`已套用 ${fmtShort(prev.date)} 的作息`);
  render();
}
async function clearSleep() {
  const day = getDay(state.date);
  delete day.sleep;
  await saveDay(day);
  render();
}

/* ---------------- 皮肤状态选项编辑 ---------------- */
function metricsEditor() {
  const list = metrics();
  openSheet(`<div class="panel">
    <h3>皮肤状态选项<button class="minibtn" data-act="close-render">完成</button></h3>
    <div class="card" style="padding:4px 16px">${list.length ? list.map((m, i) => `<div class="setrow">
      <button class="mrow" data-act="metric-edit" data-k="${m.k}"><span class="t">${esc(m.name)}</span>
        <span class="faint">${m.goodHigh ? '越高越好' : '越低越好'}</span></button>
      <span class="btns">
        <button class="iconbtn sm" data-act="metric-move" data-k="${m.k}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="上移"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="iconbtn sm" data-act="metric-move" data-k="${m.k}" data-n="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="下移"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
      </span></div>`).join('') : '<div class="empty" style="padding:12px 0">还没有选项</div>'}</div>
    <button class="btn secondary" data-act="metric-edit" data-k="">＋ 添加选项</button>
    <div class="faint" style="margin-top:10px">删除选项不会删除历史分数；改名会沿用原来的记录。</div>
  </div>`);
}
function metricEditor(k) {
  const m = metricByKey(k) || { k: '', name: '', goodHigh: false };
  openSheet(`<div class="panel">
    <h3>${m.k ? '编辑选项' : '添加选项'}<button class="minibtn" data-act="metrics">返回</button></h3>
    <div class="field"><label>名称</label><input type="text" id="mt-name" value="${esc(m.name)}" placeholder="比如：毛孔、闭口、水润度、暗沉"></div>
    <div class="field"><label>打分方向</label><select id="mt-dir">
      <option value="low" ${!m.goodHigh ? 'selected' : ''}>越低越好（1 无 · 5 严重），比如痘痘、出油</option>
      <option value="high" ${m.goodHigh ? 'selected' : ''}>越高越好（1 差 · 5 好），比如水润度、整体</option></select></div>
    <div class="stack">
      <button class="btn" data-act="metric-save" data-k="${m.k}">保存</button>
      ${m.k ? `<button class="btn danger" data-act="metric-del" data-k="${m.k}">删除这个选项</button>` : ''}
    </div></div>`);
  if (!m.k) setTimeout(() => $('#mt-name')?.focus(), 250);
}
async function saveMetric(k) {
  const name = $('#mt-name').value.trim();
  if (!name) return toast('请填写名称');
  const goodHigh = $('#mt-dir').value === 'high';
  const m = metricByKey(k);
  if (m) Object.assign(m, { name, goodHigh });
  else state.meta.metrics.push({ k: 'm_' + uid(), name, goodHigh });
  await saveMeta();
  metricsEditor();
}
async function deleteMetric(k) {
  const m = metricByKey(k);
  if (!m || !confirm(`删除「${m.name}」？以后不再显示，历史分数仍然保留在备份里。`)) return;
  state.meta.metrics = state.meta.metrics.filter((x) => x.k !== k);
  await saveMeta();
  metricsEditor();
}
async function moveMetric(k, n) {
  const a = state.meta.metrics, i = a.findIndex((m) => m.k === k), j = i + n;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  await saveMeta();
  metricsEditor();
}

/* ---------------- 照片 ---------------- */
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const max = 1400;
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return { blob: blob || file, w, h };
  } finally { URL.revokeObjectURL(url); }
}
async function addPhoto(file, date) {
  if (!file) return;
  toast('正在保存…');
  try {
    const { blob, w, h } = await compress(file);
    await dbPut('photos', { id: uid(), date, blob, w, h, created: Date.now() });
    askPersist();
    toast('照片已保存');
  } catch (e) { toast('照片保存失败'); }
  render();
}

async function allPhotos() {
  const list = await dbAll('photos');
  return list.sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1));
}

async function viewPhotos() {
  const list = await allPhotos();
  let html = `<div class="head"><div><h1>照片</h1><div class="sub">${list.length} 张 · 只存在这台手机上</div></div>
    ${list.length >= 2 ? `<button class="btn small ${state.compare ? '' : 'secondary'}" data-act="compare">${state.compare ? '取消' : '对比'}</button>` : ''}</div>`;
  if (state.compare) {
    html += `<div class="banner"><span>选两张照片（已选 ${state.photoSel.length}/2）</span>
      ${state.photoSel.length === 2 ? `<button class="btn small" data-act="show-compare">查看对比</button>` : ''}</div>`;
  }
  if (!list.length) {
    html += `<div class="card empty">还没有照片。建议固定在同一个位置、同样的光线下自拍，对比时才看得出变化。</div>`;
  }
  html += `<div class="thumbs" style="margin-bottom:8px">
    <label class="thumb addphoto">＋<input type="file" accept="image/*" id="addphoto"></label></div>`;
  let month = '';
  let open = false;
  for (const p of list) {
    const m = p.date.slice(0, 7);
    if (m !== month) {
      if (open) html += `</div>`;
      month = m;
      html += `<div class="month">${Number(m.slice(0, 4))}年${Number(m.slice(5))}月</div><div class="thumbs">`;
      open = true;
    }
    const n = state.photoSel.indexOf(p.id);
    html += `<button class="thumb ${n >= 0 ? 'sel' : ''}" data-n="${n + 1}" data-act="${state.compare ? 'pick-photo' : 'view-photo'}" data-id="${p.id}">
      <img src="${keepURL(p.blob)}" alt="" loading="lazy"><span class="date">${fmtShort(p.date)}</span></button>`;
  }
  if (open) html += `</div>`;
  return html;
}

let viewerURLs = [];
function closeSheet() {
  const s = $('#sheet');
  s.hidden = true; s.innerHTML = ''; s.className = 'sheet';
  viewerURLs.forEach((u) => URL.revokeObjectURL(u)); viewerURLs = [];
}
function openSheet(html, cls = '') {
  const s = $('#sheet');
  s.className = 'sheet ' + cls; s.innerHTML = html; s.hidden = false;
}

async function viewPhoto(id) {
  const list = state.tab === 'photos' ? await allPhotos() : await photosOn(state.date);
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = list[i];
  viewerURLs.forEach((u) => URL.revokeObjectURL(u));
  const u = URL.createObjectURL(p.blob); viewerURLs = [u];
  openSheet(`<div class="vwrap">
    <div class="vtop"><button data-act="close">关闭</button><span>${esc(fmtCN(p.date))}</span><button data-act="del-photo" data-id="${p.id}" style="color:#F2A497">删除</button></div>
    <div class="vimg"><figure><img src="${u}" alt=""></figure></div>
    <div class="vbot">
      <button data-act="view-photo" data-id="${list[i - 1] ? list[i - 1].id : ''}" ${list[i - 1] ? '' : 'disabled style="opacity:.3"'}>‹ ${state.tab === 'photos' ? '较新' : '上一张'}</button>
      <span style="color:#aaa;font-size:13px">${i + 1} / ${list.length}</span>
      <button data-act="view-photo" data-id="${list[i + 1] ? list[i + 1].id : ''}" ${list[i + 1] ? '' : 'disabled style="opacity:.3"'}>${state.tab === 'photos' ? '较早' : '下一张'} ›</button>
    </div></div>`, 'viewer');
}
async function delPhoto(id) {
  if (!confirm('删除这张照片？删除后无法恢复。')) return;
  await dbDel('photos', id);
  state.photoSel = state.photoSel.filter((x) => x !== id);
  closeSheet(); render(); toast('已删除');
}
function pickPhoto(id) {
  const s = state.photoSel;
  if (s.includes(id)) state.photoSel = s.filter((x) => x !== id);
  else if (s.length < 2) s.push(id);
  else { s.shift(); s.push(id); }
  render();
}
async function showCompare() {
  const list = await dbAll('photos');
  const ps = state.photoSel.map((id) => list.find((p) => p.id === id)).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (ps.length < 2) return;
  viewerURLs = ps.map((p) => URL.createObjectURL(p.blob));
  const gap = diffDays(ps[0].date, ps[1].date);
  openSheet(`<div class="vwrap">
    <div class="vtop"><button data-act="close">关闭</button><span>相隔 ${gap} 天</span><span style="width:40px"></span></div>
    <div class="vimg">
      <figure><img src="${viewerURLs[0]}" alt=""><figcaption>${esc(fmtCN(ps[0].date))}</figcaption></figure>
      <figure><img src="${viewerURLs[1]}" alt=""><figcaption>${esc(fmtCN(ps[1].date))}</figcaption></figure>
    </div><div class="vbot"></div></div>`, 'viewer');
}

/* ---------------- 产品 ---------------- */
function viewProducts() {
  const active = sortProducts(state.products.filter((p) => !p.stoppedAt || p.stoppedAt >= today()));
  const stopped = state.products.filter((p) => p.stoppedAt && p.stoppedAt < today()).sort((a, b) => (a.stoppedAt < b.stoppedAt ? 1 : -1));
  const row = (p) => {
    const used = p.openedAt ? diffDays(p.openedAt, p.stoppedAt && p.stoppedAt < today() ? p.stoppedAt : today()) + 1 : null;
    const sub = [p.brand, SLOT_NAME[p.slot], p.actives].filter(Boolean).join(' · ');
    return `<button class="prod ${stopped.includes(p) ? 'stopped' : ''}" data-act="edit-prod" data-id="${p.id}">
      <span class="badge">${CAT_BADGE[p.category] || '其'}</span>
      <span class="meta"><div class="name">${esc(p.name)}</div><div class="sub">${esc(sub)}</div></span>
      <span class="days">${used != null && used > 0 ? `${stopped.includes(p) ? '用了' : '第'} ${used} 天` : ''}</span></button>`;
  };
  let html = `<div class="head"><div><h1>产品</h1><div class="sub">${active.length} 个在用</div></div>
    <button class="btn small" data-act="edit-prod" data-id="">＋ 添加</button></div>`;
  html += `<section class="card">${active.length ? active.map(row).join('') : '<div class="empty">把你现在在用的产品都加进来，打卡时一点就行。</div>'}</section>`;
  if (stopped.length) html += `<div class="month">已停用</div><section class="card">${stopped.map(row).join('')}</section>`;
  return html;
}

function editProduct(id) {
  const p = prodById(id) || { id: '', name: '', brand: '', category: '精华', slot: 'both', actives: '', openedAt: today(), stoppedAt: '', note: '' };
  openSheet(`<div class="panel">
    <h3>${p.id ? '编辑产品' : '添加产品'}<button class="minibtn" data-act="close">取消</button></h3>
    <div class="field"><label>名称 *</label><input type="text" id="f-name" value="${esc(p.name)}" placeholder="比如：B5 修复精华"></div>
    <div class="field"><label>品牌</label><input type="text" id="f-brand" value="${esc(p.brand)}"></div>
    <div class="row">
      <div class="field"><label>类别</label><select id="f-cat">${CATEGORIES.map((c) => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>使用时段</label><select id="f-slot">${Object.entries(SLOT_NAME).map(([k, v]) => `<option value="${k}" ${k === p.slot ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>主要成分</label><input type="text" id="f-act" value="${esc(p.actives)}" placeholder="比如：烟酰胺 5%、视黄醇"></div>
    <div class="row">
      <div class="field"><label>开始使用</label><input type="date" id="f-open" value="${esc(p.openedAt)}"></div>
      <div class="field"><label>停用日期</label><input type="date" id="f-stop" value="${esc(p.stoppedAt)}"></div>
    </div>
    <div class="field"><label>备注</label><textarea id="f-note" placeholder="用后感受、过敏反应…">${esc(p.note)}</textarea></div>
    <div class="stack">
      <button class="btn" data-act="save-prod" data-id="${p.id}">保存</button>
      ${p.id && !p.stoppedAt ? `<button class="btn secondary" data-act="stop-prod" data-id="${p.id}">今天起停用</button>` : ''}
      ${p.id ? `<button class="btn danger" data-act="del-prod" data-id="${p.id}">删除产品</button>` : ''}
    </div></div>`);
  if (!p.id) setTimeout(() => $('#f-name')?.focus(), 250);
}
async function saveProduct(id) {
  const name = $('#f-name').value.trim();
  if (!name) { toast('请填写名称'); return; }
  const p = prodById(id) || { id: uid(), created: Date.now() };
  Object.assign(p, {
    name, brand: $('#f-brand').value.trim(), category: $('#f-cat').value, slot: $('#f-slot').value,
    actives: $('#f-act').value.trim(), openedAt: $('#f-open').value, stoppedAt: $('#f-stop').value, note: $('#f-note').value.trim(),
  });
  if (!prodById(p.id)) state.products.push(p);
  await dbPut('products', p);
  askPersist();
  closeSheet(); render(); toast('已保存');
}
async function stopProduct(id) {
  const p = prodById(id); if (!p) return;
  p.stoppedAt = today();
  await dbPut('products', p);
  closeSheet(); render(); toast('已标记停用，历史记录保留');
}
async function deleteProduct(id) {
  if (!confirm('删除后，历史打卡里也会去掉这个产品。\n只是不用了的话，建议用「停用」。\n\n确定删除？')) return;
  state.products = state.products.filter((p) => p.id !== id);
  await dbDel('products', id);
  state.meta.plans.forEach((pl) => { pl.products = pl.products.filter((x) => x !== id); });
  await saveMeta();
  for (const d of [...state.days.values()]) {
    if (d.am.includes(id) || d.pm.includes(id)) {
      d.am = d.am.filter((x) => x !== id); d.pm = d.pm.filter((x) => x !== id);
      await saveDay(d);
    }
  }
  closeSheet(); render(); toast('已删除');
}

/* ---------------- 趋势 ---------------- */
function trendRange() {
  const end = today();
  let start;
  if (state.trend.range === 0) {
    const first = [...state.days.keys()].sort()[0];
    start = first && first < addDays(end, -29) ? first : addDays(end, -29);
  } else start = addDays(end, -(state.trend.range - 1));
  return { start, end, n: diffDays(start, end) + 1 };
}
function trendMarkers(start, end) {
  return state.products
    .filter((p) => p.openedAt && p.openedAt >= start && p.openedAt <= end)
    .sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))
    .map((p, i) => ({ n: i + 1, date: p.openedAt, name: p.name }));
}
function streak() {
  let d = today();
  if (!state.days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (state.days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function currentMetric() {
  let m = metricByKey(state.trend.metric);
  if (!m && metrics().length) { m = metrics()[0]; state.trend.metric = m.k; }
  return m || { k: '_none', name: '状态', goodHigh: false };
}

function viewTrends() {
  const { start, end } = trendRange();
  const m = currentMetric();
  const inRange = [...state.days.values()].filter((d) => d.date >= start && d.date <= end);
  const vals = inRange.map((d) => d.s[m.k]).filter(Boolean);
  const mk = trendMarkers(start, end);

  let html = `<div class="head"><div><h1>趋势</h1><div class="sub">${esc(fmtShort(start))} – ${esc(fmtShort(end))}</div></div></div>`;
  html += `<div class="seg" style="margin-bottom:12px">${[[30, '30天'], [90, '90天'], [365, '一年'], [0, '全部']].map(([v, l]) =>
    `<button class="${state.trend.range === v ? 'on' : ''}" data-act="range" data-v="${v}">${l}</button>`).join('')}</div>`;

  html += `<div class="stats" style="margin-bottom:12px">
    <div class="stat"><b>${inRange.length}</b><span>记录天数</span></div>
    <div class="stat"><b>${streak()}</b><span>连续打卡</span></div>
    <div class="stat"><b>${vals.length ? avg(vals).toFixed(1) : '–'}</b><span>${esc(m.name)}均值</span></div></div>`;

  html += `<section class="card"><h2>皮肤状态</h2><div class="chips" style="margin-bottom:12px">${metrics().map((x) =>
    `<button class="chip ${x.k === m.k ? 'on' : ''}" data-act="metric" data-k="${x.k}">${esc(x.name)}</button>`).join('')}</div>
    <canvas class="chart" id="chart"></canvas>
    <div class="faint" style="margin-top:6px">${m.goodHigh ? '越高越好' : '越低越好'} · 点是每天的分数，线是 7 天平均${mk.length ? ' · 竖线是开始用新产品的日子' : ''}</div>
    ${mk.length ? `<ul class="markers">${mk.map((x) => `<li><span class="n">${x.n}</span><span>${esc(fmtShort(x.date))} 开始用 ${esc(x.name)}</span></li>`).join('')}</ul>` : ''}
  </section>`;

  html += sleepTrendCard(inRange);

  // 新产品前后对比
  const withDate = state.products.filter((p) => p.openedAt).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  html += `<section class="card"><h2>新产品前后对比</h2>`;
  if (!withDate.length) {
    html += `<div class="empty">给产品填上「开始使用」日期后，这里会对比开始前后的皮肤状态。</div>`;
  } else {
    const sel = prodById(state.trend.cmp) && prodById(state.trend.cmp).openedAt ? state.trend.cmp : withDate[0].id;
    state.trend.cmp = sel;
    const p = prodById(sel);
    html += `<select id="cmp-prod" style="margin-bottom:12px">${withDate.map((x) =>
      `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}（${esc(fmtShort(x.openedAt))}）</option>`).join('')}</select>`;
    html += compareTable(p);
  }
  html += `</section>`;
  return html;
}

function compareTable(p) {
  const o = p.openedAt;
  const before = [...state.days.values()].filter((d) => d.date >= addDays(o, -14) && d.date < o);
  const after = [...state.days.values()].filter((d) => d.date >= o && d.date <= addDays(o, 27));
  let html = `<table class="cmp"><tr><th></th><th>开始前 2 周</th><th>开始后 4 周</th><th>变化</th></tr>`;
  for (const m of metrics()) {
    const a = avg(before.map((d) => d.s[m.k]).filter(Boolean));
    const b = avg(after.map((d) => d.s[m.k]).filter(Boolean));
    let ch = '–', cls = '';
    if (a != null && b != null) {
      const delta = b - a;
      if (Math.abs(delta) < 0.25) ch = '持平';
      else {
        const good = m.goodHigh ? delta > 0 : delta < 0;
        cls = good ? 'better' : 'worse';
        ch = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
      }
    }
    html += `<tr><td>${esc(m.name)}</td><td>${a != null ? a.toFixed(1) : '–'}</td><td>${b != null ? b.toFixed(1) : '–'}</td><td class="${cls}">${ch}</td></tr>`;
  }
  html += `</table><div class="faint" style="margin-top:8px">记录了 ${before.length} 天 vs ${after.length} 天。绿色是变好，红色是变差。</div>`;
  const overlap = state.products.filter((x) => x.id !== p.id && x.openedAt && Math.abs(diffDays(x.openedAt, o)) <= 14);
  if (overlap.length) {
    html += `<div class="banner" style="margin:10px 0 0">前后两周内还开始用了 ${overlap.map((x) => esc(x.name)).join('、')}，变化可能来自它们。</div>`;
  }
  return html;
}

function sleepTrendCard(inRange) {
  const rec = inRange.filter((d) => d.sleep);
  const durs = rec.map((d) => sleepMinutes(d.sleep)).filter((x) => x != null);
  const qs = rec.map((d) => d.sleep.q).filter(Boolean);
  // 入睡时间按「中午 12 点起算」求平均，跨零点也能算对
  const beds = rec.map((d) => toMin(d.sleep.bed)).filter((x) => x != null).map((x) => (x - 720 + 1440) % 1440);
  const bedAvg = beds.length ? fromMin((avg(beds) + 720) % 1440) : '–';
  const short = durs.filter((x) => x < 420).length;
  let html = `<section class="card"><h2>睡眠</h2>
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><b>${esc(fmtDurShort(durs.length ? Math.round(avg(durs)) : null))}</b><span>平均时长</span></div>
      <div class="stat"><b>${qs.length ? avg(qs).toFixed(1) : '–'}</b><span>平均质量</span></div>
      <div class="stat"><b>${esc(bedAvg)}</b><span>平均入睡</span></div></div>`;
  if (!rec.length) {
    html += `<div class="empty">这段时间还没有睡眠记录。在「今天」页填一下入睡和起床时间就行。</div></section>`;
    return html;
  }
  html += `<canvas class="chart" id="sleepchart" style="height:160px"></canvas>
    <div class="legend"><span><i class="q-good"></i>质量 4–5</span><span><i class="q-mid"></i>3</span><span><i class="q-bad"></i>1–2</span><span><i class="q-none"></i>未评分</span></div>
    <div class="faint" style="margin-top:6px">记录 ${rec.length} 晚${short ? `，其中 ${short} 晚不到 7 小时` : ''}。虚线是 7 小时。</div>`;
  // 睡得好 vs 睡得差 时的皮肤
  const good = rec.filter((d) => (d.sleep.q || 0) >= 4 || (sleepMinutes(d.sleep) || 0) >= 450);
  const bad = rec.filter((d) => (d.sleep.q && d.sleep.q <= 2) || (sleepMinutes(d.sleep) != null && sleepMinutes(d.sleep) < 360));
  const om = metricByKey('overall') || metrics()[0];
  if (om && good.length >= 3 && bad.length >= 3) {
    const a = avg(good.map((d) => d.s[om.k]).filter(Boolean)), b = avg(bad.map((d) => d.s[om.k]).filter(Boolean));
    if (a != null && b != null) {
      html += `<div class="banner" style="margin:10px 0 0">睡得好的日子「${esc(om.name)}」平均 ${a.toFixed(1)}，睡得差的日子 ${b.toFixed(1)}。</div>`;
    }
  }
  return html + `</section>`;
}

function drawSleep() {
  const cv = $('#sleepchart'); if (!cv) return;
  const { start, n } = trendRange();
  const css = getComputedStyle(document.documentElement);
  const c = (v) => css.getPropertyValue(v).trim();
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const L = 22, R = 8, T = 8, B = 22, MAX = 12;
  const y = (h) => T + ((MAX - h) * (H - T - B)) / MAX;
  const slot = (W - L - R) / n;
  g.font = '11px -apple-system, "PingFang SC", sans-serif';
  g.strokeStyle = c('--line'); g.fillStyle = c('--ink-3'); g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const h of [0, 4, 8, 12]) {
    g.beginPath(); g.moveTo(L, y(h)); g.lineTo(W - R, y(h)); g.stroke();
    g.fillText(h, L - 7, y(h));
  }
  g.strokeStyle = c('--ink-3'); g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(L, y(7)); g.lineTo(W - R, y(7)); g.stroke(); g.setLineDash([]);
  g.textBaseline = 'top';
  [0, Math.floor((n - 1) / 2), n - 1].forEach((i, k) => {
    g.textAlign = k === 0 ? 'left' : k === 2 ? 'right' : 'center';
    g.fillText(fmtShort(addDays(start, i)), L + slot * i + (k === 0 ? 0 : k === 2 ? slot : slot / 2), H - B + 6);
  });
  const col = { good: c('--good'), mid: c('--q-mid'), bad: c('--bad'), none: c('--ink-3') };
  const bw = Math.max(1.5, Math.min(14, slot * 0.7));
  for (let i = 0; i < n; i++) {
    const d = state.days.get(addDays(start, i));
    const m = d && sleepMinutes(d.sleep);
    if (m == null) continue;
    const q = d.sleep.q;
    g.fillStyle = !q ? col.none : q >= 4 ? col.good : q === 3 ? col.mid : col.bad;
    g.globalAlpha = q ? 0.85 : 0.45;
    const x = L + slot * i + (slot - bw) / 2, top = y(Math.min(MAX, m / 60));
    const r = Math.min(3, bw / 2);
    g.beginPath();
    g.moveTo(x, y(0)); g.lineTo(x, top + r); g.quadraticCurveTo(x, top, x + r, top);
    g.lineTo(x + bw - r, top); g.quadraticCurveTo(x + bw, top, x + bw, top + r); g.lineTo(x + bw, y(0));
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawChart() {
  drawSleep();
  const cv = $('#chart'); if (!cv) return;
  const { start, n } = trendRange();
  const m = currentMetric();
  const css = getComputedStyle(document.documentElement);
  const c = (v) => css.getPropertyValue(v).trim();
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const L = 22, R = 8, T = 22, B = 22;
  const x = (i) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((5 - v) * (H - T - B)) / 4;
  g.font = '11px -apple-system, "PingFang SC", sans-serif';

  // 网格
  g.strokeStyle = c('--line'); g.fillStyle = c('--ink-3'); g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let v = 1; v <= 5; v++) {
    g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke();
    g.fillText(v, L - 7, y(v));
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  [0, Math.floor((n - 1) / 2), n - 1].forEach((i, k, arr) => {
    if (k > 0 && i === arr[k - 1]) return;
    g.textAlign = k === 0 ? 'left' : k === 2 ? 'right' : 'center';
    g.fillText(fmtShort(addDays(start, i)), x(i), H - B + 6);
  });

  // 新产品标记
  const mk = trendMarkers(start, addDays(start, n - 1));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  mk.forEach((k) => {
    const xi = x(diffDays(start, k.date));
    g.strokeStyle = c('--accent'); g.globalAlpha = 0.5; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(xi, T - 4); g.lineTo(xi, H - B); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = c('--accent-soft'); g.beginPath(); g.arc(xi, T - 12, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = c('--accent'); g.font = 'bold 10px -apple-system, sans-serif'; g.fillText(k.n, xi, T - 12);
  });

  // 数据
  const pts = [];
  for (let i = 0; i < n; i++) {
    const d = state.days.get(addDays(start, i));
    if (d && d.s[m.k]) pts.push({ i, v: d.s[m.k] });
  }
  if (!pts.length) {
    g.fillStyle = c('--ink-3'); g.font = '13px -apple-system, "PingFang SC", sans-serif';
    g.fillText('这段时间还没有「' + m.name + '」的记录', (L + W - R) / 2, (T + H - B) / 2);
    return;
  }
  // 7 天平均线
  const ma = [];
  for (let i = 0; i < n; i++) {
    const win = pts.filter((p) => p.i <= i && p.i > i - 7);
    if (win.length && pts.some((p) => p.i <= i) ) ma.push({ i, v: avg(win.map((p) => p.v)) });
    else ma.push(null);
  }
  g.strokeStyle = c('--accent'); g.lineWidth = 2.5; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  let pen = false;
  ma.forEach((p) => {
    if (!p) { pen = false; return; }
    if (!pen) { g.moveTo(x(p.i), y(p.v)); pen = true; } else g.lineTo(x(p.i), y(p.v));
  });
  g.stroke();
  // 点
  g.fillStyle = c('--ink-2'); g.globalAlpha = 0.55;
  const r = n > 120 ? 1.6 : n > 60 ? 2.2 : 3;
  pts.forEach((p) => { g.beginPath(); g.arc(x(p.i), y(p.v), r, 0, Math.PI * 2); g.fill(); });
  g.globalAlpha = 1;
}

/* ---------------- 设置 / 备份 ---------------- */
function viewSettings() {
  const lb = state.meta.lastBackup;
  const lbText = lb ? `${new Date(lb).toLocaleDateString('zh-CN')}（${Math.floor((Date.now() - lb) / 86400000)} 天前）` : '从未备份';
  return `<div class="head"><div><h1>设置</h1><div class="sub">肌肤日记 v${APP_VERSION}</div></div></div>
  <section class="card"><h2>备份 <span class="faint">只含文字，不含照片</span></h2>
    <div class="setrow"><span class="t">上次备份</span><span class="muted">${lbText}</span></div>
    <div class="stack" style="margin-top:8px">
      <button class="btn" data-act="export">导出备份文件</button>
      <div class="row">
        <button class="btn secondary" data-act="copy-backup">复制为文本</button>
        <label class="btn secondary" style="position:relative;overflow:hidden">从备份恢复<input type="file" id="importfile" accept=".json,application/json,text/plain" style="position:absolute;inset:0;opacity:0"></label>
      </div>
    </div>
    <div class="faint" style="margin-top:10px">导出时选「存储到文件」或发给自己（微信文件传输助手、邮件都行）。恢复会覆盖现有的文字记录，照片不受影响。</div>
  </section>
  <section class="card"><h2>自定义</h2>
    <button class="setrow mrow" data-act="metrics"><span class="t">皮肤状态选项</span><span class="muted">${metrics().length} 项 ›</span></button>
    <button class="setrow mrow" data-act="week-edit"><span class="t">每周晚间计划</span><span class="muted">${state.meta.plans.length} 种护理 ›</span></button>
  </section>
  <section class="card"><h2>影响因素标签 <span class="faint">点一下删除</span></h2>
    <div class="chips">${state.meta.tags.map((t) => `<button class="chip" data-act="del-tag" data-t="${esc(t)}">${esc(t)} <small>×</small></button>`).join('')}
    <button class="chip ghost" data-act="new-tag">＋ 添加</button></div></section>
  <section class="card"><h2>存储</h2>
    <div class="setrow"><span class="t">文字记录</span><span class="muted">${state.days.size} 天 · ${state.products.length} 个产品</span></div>
    <div class="setrow"><span class="t">占用空间</span><span class="muted" id="usage">…</span></div>
    <div class="setrow"><span class="t">防清理保护</span><span class="muted" id="persist">…</span></div>
  </section>
  <section class="card"><h2>危险操作</h2>
    <button class="btn danger" data-act="wipe">清除全部数据</button></section>`;
}
async function fillStorageInfo() {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      const mb = (e.usage || 0) / 1048576;
      $('#usage') && ($('#usage').textContent = mb < 1 ? `${Math.round((e.usage || 0) / 1024)} KB` : `${mb.toFixed(1)} MB`);
    } else $('#usage') && ($('#usage').textContent = '未知');
    const p = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    $('#persist') && ($('#persist').textContent = p ? '已开启' : '未开启（添加到主屏幕后更安全）');
  } catch { /* ignore */ }
}

function backupJSON() {
  return JSON.stringify({
    app: 'skinlog', version: 1, exportedAt: new Date().toISOString(),
    products: state.products,
    days: [...state.days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    tags: state.meta.tags,
    metrics: state.meta.metrics,
    plans: state.meta.plans,
    week: state.meta.week,
  }, null, 1);
}
async function markBackedUp() {
  state.meta.lastBackup = Date.now();
  await saveMeta();
  render();
}
async function exportBackup() {
  const name = `skinlog-backup-${today()}.json`;
  const file = new File([backupJSON()], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    await markBackedUp();
    toast('已导出备份');
  } catch (e) {
    if (e.name !== 'AbortError') toast('导出没有成功，可以试试「复制为文本」');
  }
}
async function copyBackup() {
  try {
    await navigator.clipboard.writeText(backupJSON());
    await markBackedUp();
    toast('已复制，粘贴到备忘录或发给自己保存');
  } catch { toast('复制失败'); }
}
async function importBackup(file) {
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('文件格式不对'); }
  if (data.app !== 'skinlog' || !Array.isArray(data.days) || !Array.isArray(data.products)) return toast('这不是肌肤日记的备份文件');
  if (!confirm(`备份时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n包含 ${data.days.length} 天记录、${data.products.length} 个产品。\n\n恢复会覆盖现在的文字记录（照片保留），继续？`)) return;
  await dbClear('days'); await dbClear('products');
  state.days = new Map(); state.products = [];
  for (const p of data.products) { await dbPut('products', p); state.products.push(p); }
  for (const d of data.days) {
    const day = { date: d.date, am: d.am || [], pm: d.pm || [], s: d.s || {}, tags: d.tags || [], note: d.note || '' };
    if (d.sleep) day.sleep = d.sleep;
    await dbPut('days', day); state.days.set(day.date, day);
  }
  if (Array.isArray(data.tags)) state.meta.tags = data.tags;
  if (Array.isArray(data.metrics)) state.meta.metrics = data.metrics;
  if (Array.isArray(data.plans) && data.plans.length) state.meta.plans = data.plans;
  if (data.week && typeof data.week === 'object') state.meta.week = data.week;
  await saveMeta();
  render(); toast('已恢复');
}
async function wipe() {
  if (!confirm('清除所有文字记录、产品和照片？')) return;
  if (!confirm('真的确定吗？这一步无法撤销。没备份的话数据就没了。')) return;
  await Promise.all(['days', 'products', 'photos'].map(dbClear));
  state.days = new Map(); state.products = [];
  render(); toast('已清除');
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const sheet = $('#sheet');
  if (e.target === sheet && !sheet.classList.contains('viewer')) return closeSheet();
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, id, slot, k, v, t, n } = el.dataset;
  switch (act) {
    case 'tab': e.preventDefault(); state.tab = el.dataset.tab; scrollTo(0, 0); return render();
    case 'day': state.date = addDays(state.date, Number(n)); if (state.date > today()) state.date = today(); return render();
    case 'goto-today': state.date = today(); return render();
    case 'toggle-prod': return toggleProd(slot, id);
    case 'copy-last': return copyLast(slot);
    case 'score': return setScore(k, Number(v));
    case 'tag': return toggleTag(t);
    case 'add-tag': return addTag();
    case 'view-photo': return id && viewPhoto(id);
    case 'del-photo': return delPhoto(id);
    case 'pick-photo': return pickPhoto(id);
    case 'compare': state.compare = !state.compare; state.photoSel = []; return render();
    case 'show-compare': return showCompare();
    case 'close': return closeSheet();
    case 'close-render': closeSheet(); return render();
    case 'goto-date': return gotoDate(el.dataset.d);
    case 'apply-plan': return applyPlan();
    case 'week-edit': state.planDraft = null; return weekEditor();
    case 'plan-edit': return planEditor(id);
    case 'pl-icon': state.planDraft.icon = v; return planEditor();
    case 'pl-color': state.planDraft.color = v; return planEditor();
    case 'pl-prod': {
      const pr = state.planDraft.products;
      state.planDraft.products = pr.includes(id) ? pr.filter((x) => x !== id) : [...pr, id];
      return planEditor();
    }
    case 'pl-save': return savePlan();
    case 'pl-del': return deletePlan();
    case 'sleep-q': return setSleep('q', getDay(state.date).sleep?.q === Number(v) ? '' : Number(v));
    case 'sleep-copy': return copySleep();
    case 'sleep-clear': return clearSleep();
    case 'metrics': return metricsEditor();
    case 'metric-edit': return metricEditor(k);
    case 'metric-save': return saveMetric(k);
    case 'metric-del': return deleteMetric(k);
    case 'metric-move': return moveMetric(k, Number(n));
    case 'edit-prod': return editProduct(id);
    case 'save-prod': return saveProduct(id);
    case 'stop-prod': return stopProduct(id);
    case 'del-prod': return deleteProduct(id);
    case 'range': state.trend.range = Number(v); return render();
    case 'metric': state.trend.metric = k; return render();
    case 'export': return exportBackup();
    case 'copy-backup': return copyBackup();
    case 'wipe': return wipe();
    case 'del-tag':
      if (!confirm(`删除标签「${t}」？已有记录里的不受影响。`)) return;
      state.meta.tags = state.meta.tags.filter((x) => x !== t); await saveMeta(); return render();
    case 'new-tag': {
      const nt = (prompt('新的影响因素') || '').trim();
      if (nt && !state.meta.tags.includes(nt)) { state.meta.tags.push(nt); await saveMeta(); render(); }
      return;
    }
  }
});

document.querySelectorAll('#tabbar button').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.tab !== b.dataset.tab) { state.tab = b.dataset.tab; state.compare = false; state.photoSel = []; }
    scrollTo(0, 0); render();
  }));

document.addEventListener('input', (e) => {
  if (e.target.id === 'note') onNoteInput(e);
  if (e.target.id === 'pl-name' && state.planDraft) state.planDraft.name = e.target.value;
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'pickdate' && el.value) { state.date = el.value > today() ? today() : el.value; render(); }
  else if (el.id === 'addphoto') { const date = state.tab === 'today' ? state.date : today(); await addPhoto(el.files[0], date); }
  else if (el.id === 'cmp-prod') { state.trend.cmp = el.value; render(); }
  else if (el.id === 'sl-bed') await setSleep('bed', el.value);
  else if (el.id === 'sl-wake') await setSleep('wake', el.value);
  else if (el.dataset.wd !== undefined) { state.meta.week[el.dataset.wd] = el.value; await saveMeta(); }
  else if (el.id === 'importfile') { await importBackup(el.files[0]); el.value = ''; }
});

// 回到前台时如果过了零点，自动切到新的一天
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastToday) {
    if (state.date === lastToday) state.date = today();
    lastToday = today();
    render();
  }
});
window.addEventListener('resize', () => state.tab === 'trends' && drawChart());

/* ---------------- 启动 ---------------- */
// 预览版：页面里设了 window.SKINLOG_DEMO 时，数据只放内存并填入示例
async function seedDemo() {
  const P = (name, category, slot, openedAt) => ({ id: uid(), name, brand: '', category, slot, actives: '', openedAt, stoppedAt: '', note: '', created: Date.now() });
  const ps = [P('氨基酸洁面', '洁面', 'both', addDays(today(), -80)), P('B5修复精华', '精华', 'both', addDays(today(), -80)),
    P('水杨酸精华', '精华', 'pm', addDays(today(), -80)), P('A醇精华', '精华', 'pm', addDays(today(), -19)),
    P('清爽面霜', '乳液/面霜', 'both', addDays(today(), -80)), P('物理防晒', '防晒', 'am', addDays(today(), -80))];
  for (const p of ps) { await dbPut('products', p); state.products.push(p); }
  const [cl, b5, bha, reti, cream, sun] = ps.map((p) => p.id);
  state.meta.plans[0].products = [cl, b5, cream];
  state.meta.plans[1].products = [cl, bha, cream];
  state.meta.plans[2].products = [cl, reti, cream];
  const r = () => Math.random(), clamp = (x) => Math.max(1, Math.min(5, Math.round(x)));
  for (let i = 60; i >= 1; i--) {
    if (i % 6 === 0) continue;
    const date = addDays(today(), -i), late = r() > 0.75;
    const bed = late ? 60 + Math.round(r() * 60) : 1380 + Math.round(r() * 70) - 30;
    const wake = 420 + Math.round(r() * 60);
    const q = clamp(late ? 2 + r() : 3.4 + r() * 1.4);
    const plan = planFor(date);
    const d = {
      date, am: [cl, b5, cream, sun], pm: plan.products.filter((x) => date >= state.products.find((p) => p.id === x).openedAt),
      s: { overall: clamp(3.6 - (late ? 0.9 : 0) + r() - 0.5), oil: clamp(2 + r() * 2), dry: clamp(2 + r() * 1.5),
        acne: clamp(2.2 + (late ? 0.8 : 0) + r() - 0.5), red: clamp(1.5 + r()), sens: clamp(1 + r() * 2) },
      tags: late ? ['熬夜'] : [], note: '', sleep: { bed: fromMin((bed + 1440) % 1440), wake: fromMin(wake), q },
    };
    await saveDay(d);
  }
}

(async function init() {
  const demo = !!window.SKINLOG_DEMO;
  try {
    if (!demo) db = await openDB();
  } catch (e) {
    db = null; // 比如在某些预览环境里 IndexedDB 不可用：退回内存
  }
  try {
    const [days, products, metas] = await Promise.all([dbAll('days'), dbAll('products'), dbAll('meta')]);
    days.forEach((d) => state.days.set(d.date, d));
    state.products = products;
    const meta = metas.find((m) => m.key === 'meta');
    if (meta) state.meta = Object.assign(state.meta, meta);
    if (demo && !products.length) await seedDemo();
  } catch (e) {
    $('#view').innerHTML = `<div class="card">打不开本地数据：${esc(e.message)}</div>`;
    return;
  }
  if (!db) {
    const b = document.createElement('div');
    b.className = 'demobar';
    b.textContent = demo ? '预览版 · 已填入示例数据，刷新后会重置' : '当前环境无法保存数据，刷新后会丢失';
    document.body.prepend(b);
  }
  render();
  if (db && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
