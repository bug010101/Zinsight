/**
 * Zinsight 安卓端应用逻辑
 *
 * 功能与桌面端（src/renderer/index.html）完全一致：
 *   看板 / 流水 / 统计 / AI 分析 / 设置
 * 计算部分统一走 src/renderer/shared/ledger-core.js，保证两端结果一致。
 *
 * 平台差异只体现在「存取」上，由下面的 bridge 收口：
 *   - 原生（Capacitor）：JSON 存 App 私有目录，导出走系统分享面板，AI 请求走原生 HTTP
 *   - 浏览器（本地预览）：降级用 localStorage + 浏览器下载
 */

import LedgerCore from '../shared/ledger-core.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const Core = LedgerCore;
const NATIVE = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

const APP_DIR = 'zinsight';
const LS_KEY = { data: 'zinsight:data', config: 'zinsight:config' };
const PAGE_SIZE = 20;

/* ============================ 全局状态 ============================ */

let appData = null;
let appConfig = null;

let currentView = 'dashboard';
let currentType = 'expense';
let selectedCategory = '';
let editingId = null;
let filteredRecords = [];
let renderPage = 1;
let chatBusy = false;

/* ============================ 小工具 ============================ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

/** HTML 转义，防止备注里的特殊字符打乱结构 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================ 确认框 ============================ */

let dialogResolve = null;

function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { text: opts } : (opts || {});
  return new Promise(resolve => {
    dialogResolve = resolve;
    $('#dialogTitle').textContent = o.title || '确认';
    $('#dialogText').textContent = o.text || '';
    $('#dialogOk').textContent = o.okText || '确定';
    $('#dialogOk').className = o.danger === false ? '' : 'danger';
    $('#dialogMask').classList.add('show');
  });
}

function settleDialog(value) {
  $('#dialogMask').classList.remove('show');
  if (dialogResolve) {
    const fn = dialogResolve;
    dialogResolve = null;
    fn(value);
  }
}

/** 需要用户输入多行文本时用的弹窗（CSV 粘贴） */
function askText(title, placeholder) {
  return new Promise(resolve => {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask show';
    mask.innerHTML = `
      <div class="dialog">
        <h3>${esc(title)}</h3>
        <div class="field" style="margin:12px 0 0;">
          <textarea id="askTextArea" placeholder="${esc(placeholder || '')}"></textarea>
        </div>
        <div class="dialog-actions">
          <button data-act="cancel">取消</button>
          <button data-act="ok">确定</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = v => { mask.remove(); resolve(v); };
    mask.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    mask.querySelector('[data-act="ok"]').addEventListener('click', () => close(mask.querySelector('#askTextArea').value));
  });
}

/* ============================ 存储桥接 ============================ */

/** 浏览器预览模式下 localStorage 可能不可用（隐私模式 / file://），退化成内存存储 */
const memoryStore = {};

function lsGet(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) { /* 继续走内存 */ }
  return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return;
  } catch (e) { /* 继续走内存 */ }
  memoryStore[key] = value;
}

async function readJSON(kind) {
  const isData = kind === 'data';
  const fallback = () => (isData ? Core.defaultData() : Core.defaultConfig());

  if (NATIVE) {
    try {
      const res = await Filesystem.readFile({
        path: `${APP_DIR}/${kind}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      return JSON.parse(res.data);
    } catch (e) {
      const def = fallback();
      await writeJSON(kind, def);
      return def;
    }
  }

  const raw = lsGet(LS_KEY[kind]);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* 落到默认值 */ }
  }
  const def = fallback();
  lsSet(LS_KEY[kind], JSON.stringify(def));
  return def;
}

async function writeJSON(kind, obj) {
  if (NATIVE) {
    try {
      await Filesystem.mkdir({ path: APP_DIR, directory: Directory.Data, recursive: true });
    } catch (e) { /* 目录已存在 */ }
    await Filesystem.writeFile({
      path: `${APP_DIR}/${kind}.json`,
      directory: Directory.Data,
      data: JSON.stringify(obj, null, 2),
      encoding: Encoding.UTF8
    });
    return;
  }
  lsSet(LS_KEY[kind], JSON.stringify(obj));
}

/** 把文本文件交给系统：原生走「分享/保存到」面板，浏览器走下载 */
async function saveAndShare(filename, content, mime) {
  if (!NATIVE) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return { success: true, path: filename };
  }

  const res = await Filesystem.writeFile({
    path: `exports/${filename}`,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  });

  try {
    await Share.share({
      title: filename,
      text: filename,
      files: [res.uri],
      dialogTitle: '导出 ' + filename
    });
  } catch (e) {
    // 用户关掉分享面板也算成功，文件已经落在应用缓存里
    if (!/cancel/i.test(e && e.message ? e.message : '')) throw e;
  }

  return { success: true, path: filename };
}

/* ============================ AI ============================ */

async function aiChat(message, contextData) {
  const ai = (appConfig && appConfig.ai) || {};
  if (!ai.apiKey || !ai.baseUrl) {
    return { success: false, error: '请先在设置中配置 AI API Key 和 Base URL' };
  }

  const systemPrompt = `你是一个个人记账分析助手。以下是用户的记账数据：\n${JSON.stringify(contextData, null, 2)}\n\n请根据这些数据回答用户的问题，给出简洁有用的分析。用中文回答。`;
  const payload = {
    model: ai.model || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    temperature: 0.7
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ai.apiKey}`
  };

  try {
    let data;
    if (NATIVE) {
      // 原生 HTTP，绕过 WebView 的跨域限制
      const res = await CapacitorHttp.post({
        url: ai.baseUrl,
        headers,
        data: payload,
        connectTimeout: 20000,
        readTimeout: 90000
      });
      if (res.status >= 400) {
        return { success: false, error: `接口返回 ${res.status}，请检查地址、Key 和模型名` };
      }
      data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } else {
      const res = await fetch(ai.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      data = await res.json();
    }

    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    return { success: true, reply: reply || '抱歉，没有获取到回复' };
  } catch (err) {
    return { success: false, error: (err && err.message) || '请求失败' };
  }
}

/* ============================ 数据 ============================ */

const getMonthRecords = () => Core.filterByMonth(appData.records, Core.monthKey());
const getMonthSummary = () => Core.summarize(getMonthRecords());

async function persist() {
  await writeJSON('data', appData);
}

function refreshAll() {
  renderDashboard();
  renderRecords();
  renderStats();
  renderCatBudgetSettings();
}

/* ============================ 导航 ============================ */

const VIEW_TITLES = {
  dashboard: '看板',
  records: '流水',
  stats: '统计',
  ai: 'AI 分析',
  settings: '设置'
};

function setView(view) {
  currentView = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#content').classList.toggle('is-ai', view === 'ai');
  updateAppbar();
  if (view === 'ai') scrollChatToBottom();
  if (view !== 'ai') $('#content').scrollTop = 0;
}

function updateAppbar() {
  $('#appbarTitle').textContent = VIEW_TITLES[currentView] || 'Zinsight';
  const now = new Date();
  const monthText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
  let sub = monthText;

  if (currentView === 'records') sub = `共 ${appData.records.length} 笔记录`;
  else if (currentView === 'stats') sub = '本月统计';
  else if (currentView === 'ai') sub = '基于你的本地数据';
  else if (currentView === 'settings') sub = '数据只存在本机';

  $('#appbarSub').textContent = sub;
}

/* ============================ 看板 ============================ */

function renderDashboard() {
  const summary = getMonthSummary();
  const budget = Number(appData.budget.monthly) || 0;
  const balance = Core.balanceOf(budget, summary);
  const now = new Date();
  const totalDays = Core.daysInMonth(now);
  const today = now.getDate();
  const daysLeft = totalDays - today + 1;

  $('#balanceAmount').textContent = Core.formatMoney(Math.max(balance, 0));
  $('#budgetTotal').textContent = '¥' + Core.formatMoney(budget);
  $('#spentTotal').textContent = '¥' + Core.formatMoney(summary.expense);
  $('#dailyAvg').textContent = '¥' + Core.formatMoney(Core.dailyBudget(balance, daysLeft));
  $('#daysLeft').textContent = daysLeft;

  $('#monthExpense').textContent = '¥' + Core.formatMoney(summary.expense);
  $('#monthIncome').textContent = '¥' + Core.formatMoney(summary.income);
  $('#monthCount').textContent = summary.count + ' 笔';

  const card = $('#balanceCard');
  card.classList.remove('warning', 'danger');
  const level = Core.budgetLevel(summary.expense, budget);
  if (level !== 'normal') card.classList.add(level);

  renderCatBudgetOverview();
  renderRecentList();
}

function renderCatBudgetOverview() {
  const container = $('#catBudgetList');
  const budgets = appData.budget.categories || {};
  const rows = Core.categoryBudgetRows(getMonthRecords(), budgets);

  if (!rows.length) {
    container.innerHTML = '<div class="empty" style="padding:14px 0;">还没有分类预算，去设置页加一个</div>';
    return;
  }

  container.innerHTML = rows.map(r => `
    <div class="bar-row">
      <div class="bar-label">${esc(r.cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:${r.color};"></div></div>
      <div class="bar-value">¥${Core.formatMoney(r.used)}/${Core.formatMoney(r.budget)}</div>
    </div>
  `).join('');
}

function renderRecentList() {
  const list = $('#recentList');
  const recent = Core.sortRecords(appData.records, '').slice(0, 5);
  if (!recent.length) {
    list.innerHTML = '<div class="empty" style="padding:16px 0;">还没有记录，点右上角 + 记一笔</div>';
    return;
  }
  list.innerHTML = recent.map(r => recordItemHtml(r)).join('');
}

/* ============================ 流水 ============================ */

function recordItemHtml(r) {
  const sign = r.type === 'expense' ? '-' : '+';
  return `
    <div class="record-item" data-id="${esc(r.id)}">
      <div class="record-icon">${Core.catIcon(r.category)}</div>
      <div class="record-info">
        <div class="record-cat">${esc(r.category)}</div>
        <div class="record-note">${esc(r.note || '—')}</div>
      </div>
      <div class="record-right">
        <div class="record-amount ${r.type}">${sign}¥${Core.formatMoney(r.amount)}</div>
        <div class="record-date">${esc(Core.formatRecordTime(r))}</div>
      </div>
    </div>`;
}

function renderRecords() {
  filteredRecords = Core.sortRecords(appData.records, $('#searchInput').value);
  renderPage = 1;
  paintRecords();
}

function paintRecords() {
  const list = $('#recordList');
  const footer = $('#recordsFooter');

  if (!filteredRecords.length) {
    list.innerHTML = '<div class="empty">' +
      ($('#searchInput').value ? '没有匹配的记录' : '还没有记录，点右上角 + 记一笔') +
      '</div>';
    footer.textContent = '';
    return;
  }

  const end = renderPage * PAGE_SIZE;
  list.innerHTML = filteredRecords.slice(0, end).map(r => recordItemHtml(r)).join('');
  footer.textContent = end < filteredRecords.length
    ? `已显示 ${end}/${filteredRecords.length} 条，继续下滑加载`
    : '— 已经到底了 —';
}

function loadMore() {
  const end = renderPage * PAGE_SIZE;
  if (end >= filteredRecords.length) return;
  renderPage++;
  paintRecords();
}

/* ============================ 统计 ============================ */

function renderStats() {
  renderCategoryChart();
  renderTrendChart();
  renderMonthCompare();
}

const CHART_COLORS = ['#0b57d0', '#1e8e3e', '#e8710a', '#d93025', '#7b3fe4', '#12a4b8', '#e5257a', '#8a8f98'];

function renderCategoryChart() {
  const container = $('#categoryChart');
  const { total, items } = Core.categorySummary(getMonthRecords());

  if (!total) {
    container.innerHTML = '<div class="empty">本月还没有支出记录</div>';
    return;
  }

  container.innerHTML = items.map((it, i) => `
    <div class="bar-row">
      <div class="bar-label">${esc(it.cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${it.pct.toFixed(1)}%;background:${CHART_COLORS[i % CHART_COLORS.length]};"></div></div>
      <div class="bar-value">¥${Core.formatMoney(it.sum)}</div>
    </div>
  `).join('');
}

function renderTrendChart() {
  const days = Core.daysInMonth();
  const daily = Core.dailyTrend(getMonthRecords(), days);
  const max = Math.max.apply(null, Object.keys(daily).map(d => daily[d]).concat([1]));
  const container = $('#trendChart');

  let html = '';
  for (let day = 1; day <= days; day++) {
    const amount = daily[day];
    const height = amount > 0 ? Math.max((amount / max) * 100, 3) : 2;
    html += `<div class="trend-bar" style="height:${height}%;opacity:${amount > 0 ? .95 : .35};" title="${day} 日 ¥${Core.formatMoney(amount)}"></div>`;
  }
  container.innerHTML = html;
  $('#trendAxisEnd').textContent = days + ' 日';
}

function renderMonthCompare() {
  const months = Core.lastMonths(6);
  const sums = Core.monthSums(appData.records, months);
  const max = Math.max.apply(null, months.map(m => sums[m]).concat([1]));
  const container = $('#monthCompareChart');

  container.innerHTML = months.map(m => {
    const sum = sums[m];
    const pct = (sum / max) * 100;
    const mon = parseInt(m.split('-')[1], 10);
    return `
      <div class="bar-row">
        <div class="bar-label">${mon} 月</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#0b57d0;"></div></div>
        <div class="bar-value">¥${Core.formatMoney(sum)}</div>
      </div>`;
  }).join('');
}

/* ============================ 记账弹层 ============================ */

function showSheet() {
  $('#sheetMask').classList.add('show');
  $('#sheet').classList.add('show');
}

function hideSheet() {
  $('#sheetMask').classList.remove('show');
  $('#sheet').classList.remove('show');
  editingId = null;
}

function openSheet(record) {
  editingId = record ? record.id : null;
  currentType = record ? record.type : 'expense';
  selectedCategory = record && record.category
    ? record.category
    : (appData.categories[0] || '其他');

  $('#sheetTitle').textContent = record ? '编辑记录' : '记一笔';
  $('#inputAmount').value = record ? record.amount : '';
  $('#inputNote').value = record ? (record.note || '') : '';
  $('#inputDate').value = record ? record.date : Core.todayStr();
  $('#inputIncludeBalance').checked = record ? record.includeInBalance !== false : true;
  $('#btnSheetDelete').style.display = record ? 'inline-flex' : 'none';
  $('#btnSheetSave').textContent = record ? '保存' : '记一笔';

  syncTypeUI();
  renderCategoryChips();
  showSheet();
  if (!record) setTimeout(() => $('#inputAmount').focus(), 280);
}

function syncTypeUI() {
  $$('#typeSwitch .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
  $('#includeBalanceRow').classList.toggle('hidden', currentType !== 'income');
}

function renderCategoryChips() {
  const box = $('#categoryChips');
  if (!selectedCategory || appData.categories.indexOf(selectedCategory) < 0) {
    selectedCategory = appData.categories[0] || '其他';
  }
  box.innerHTML = appData.categories.map(cat => `
    <button class="chip ${cat === selectedCategory ? 'active' : ''}" data-cat="${esc(cat)}">${esc(cat)}</button>
  `).join('');
}

async function saveSheet() {
  const amount = parseFloat($('#inputAmount').value);
  const note = $('#inputNote').value.trim();
  const date = $('#inputDate').value;

  if (!amount || amount <= 0) { toast('请输入有效金额'); return; }
  if (!date) { toast('请选择日期'); return; }

  const includeInBalance = currentType === 'income'
    ? $('#inputIncludeBalance').checked
    : true; // 支出本来就是减余额

  if (editingId) {
    const rec = appData.records.find(r => String(r.id) === String(editingId));
    if (rec) {
      rec.amount = amount;
      rec.category = selectedCategory;
      rec.note = note;
      rec.date = date;
      rec.type = currentType;
      rec.includeInBalance = includeInBalance;
    }
    toast('已更新');
  } else {
    appData.records.push({
      id: Core.uid('rec'),
      type: currentType,
      amount: amount,
      category: selectedCategory,
      note: note,
      date: date,
      includeInBalance: includeInBalance,
      createdAt: new Date().toISOString()
    });
    toast('已记一笔');
  }

  await persist();
  hideSheet();
  refreshAll();
  updateAppbar();
}

async function deleteCurrent() {
  if (!editingId) return;
  const ok = await confirmDialog({
    title: '删除这条记录？',
    text: '删除后无法恢复。',
    okText: '删除'
  });
  if (!ok) return;

  appData.records = appData.records.filter(r => String(r.id) !== String(editingId));
  await persist();
  hideSheet();
  refreshAll();
  updateAppbar();
  toast('已删除');
}

/* ============================ 设置 ============================ */

function renderSettings() {
  $('#setMonthlyBudget').value = appData.budget.monthly || '';
  $('#setAiBaseUrl').value = (appConfig.ai && appConfig.ai.baseUrl) || '';
  $('#setAiKey').value = (appConfig.ai && appConfig.ai.apiKey) || '';
  $('#setAiModel').value = (appConfig.ai && appConfig.ai.model) || '';
  $('#exportStartDate').value = Core.monthStartStr();
  $('#exportEndDate').value = Core.todayStr();
  $('#versionHint').textContent = `Zinsight · 数据全部保存在本机${NATIVE ? '' : '（浏览器预览模式）'}`;
}

function renderCatBudgetSettings() {
  const container = $('#catBudgetSettings');
  const spent = Core.summarize(getMonthRecords()).catSpent;

  container.innerHTML = appData.categories.map(cat => {
    const budget = Number((appData.budget.categories || {})[cat]) || 0;
    const used = spent[cat] || 0;
    const over = budget > 0 && used > budget;
    return `
      <div class="cat-budget-row">
        <span>${esc(cat)}</span>
        <input type="number" data-cat="${esc(cat)}" value="${budget || ''}" placeholder="0" inputmode="decimal" step="0.01" min="0">
        <span class="used ${over ? 'over' : ''}">已花 ¥${Core.formatMoney(used)}${over ? ' 超支' : ''}</span>
      </div>`;
  }).join('');
}

function renderCatList() {
  $('#catList').innerHTML = appData.categories.map(cat => `
    <span class="cat-tag">${esc(cat)}<button data-remove="${esc(cat)}" aria-label="删除分类">×</button></span>
  `).join('');
}

async function saveBudget() {
  appData.budget.monthly = parseFloat($('#setMonthlyBudget').value) || 0;
  const categories = {};
  $$('#catBudgetSettings .cat-budget-row input').forEach(input => {
    const val = parseFloat(input.value) || 0;
    if (val > 0) categories[input.dataset.cat] = val;
  });
  appData.budget.categories = categories;

  await persist();
  renderDashboard();
  renderCatBudgetSettings();
  toast('预算已保存');
}

async function addCategory() {
  const input = $('#newCatName');
  const name = input.value.trim();
  if (!name) { toast('请输入分类名称'); return; }
  if (appData.categories.indexOf(name) >= 0) { toast('分类已存在'); return; }

  appData.categories.push(name);
  input.value = '';
  await persist();
  renderCatList();
  renderCatBudgetSettings();
  renderCategoryChips();
  toast('已添加');
}

async function removeCategory(cat) {
  const ok = await confirmDialog({
    title: `删除分类「${cat}」？`,
    text: '已有记录不受影响，只是以后不再选它。',
    okText: '删除'
  });
  if (!ok) return;

  appData.categories = appData.categories.filter(c => c !== cat);
  await persist();
  renderCatList();
  renderCatBudgetSettings();
  renderCategoryChips();
  toast('已删除分类');
}

async function saveAiConfig() {
  appConfig.ai = appConfig.ai || {};
  appConfig.ai.baseUrl = $('#setAiBaseUrl').value.trim();
  appConfig.ai.apiKey = $('#setAiKey').value.trim();
  appConfig.ai.model = $('#setAiModel').value.trim();
  await writeJSON('config', appConfig);
  toast('AI 配置已保存');
}

/* ============================ 导入导出 ============================ */

async function exportAllCsv() {
  try {
    const content = Core.buildFullCsv(appData.records);
    const name = `账单导出_${Core.todayStr()}.csv`;
    await saveAndShare(name, content, 'text/csv;charset=utf-8');
    toast('导出成功：' + name);
  } catch (err) {
    toast('导出失败：' + ((err && err.message) || '未知错误'));
  }
}

async function exportByRange(format) {
  const start = $('#exportStartDate').value;
  const end = $('#exportEndDate').value;

  if (!start || !end) { toast('请选择开始和结束日期'); return; }
  if (start > end) { toast('开始日期不能晚于结束日期'); return; }

  const records = Core.filterByRange(appData.records, start, end);
  if (!records.length) { toast('所选时间范围内没有记录'); return; }

  const ext = format === 'json' ? 'json' : 'csv';
  const name = `ledger_${start}_${end}.${ext}`;
  const content = format === 'json'
    ? Core.buildRangeJson(records, { startDate: start, endDate: end, budget: appData.budget, categories: appData.categories })
    : Core.buildRangeCsv(records);

  try {
    await saveAndShare(name, content, format === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    toast(`已导出 ${records.length} 条记录`);
  } catch (err) {
    toast('导出失败：' + ((err && err.message) || '未知错误'));
  }
}

async function importCsvText(text) {
  const parsed = Core.parseCsv(text);
  if (!parsed.success) { toast(parsed.error || '解析失败'); return; }

  const ok = await confirmDialog({
    title: `导入 ${parsed.records.length} 条记录？`,
    text: '将追加到现有数据，不会覆盖。',
    okText: '导入'
  });
  if (!ok) return;

  appData.records.push.apply(appData.records, parsed.records);
  await persist();
  refreshAll();
  updateAppbar();
  toast(`已导入 ${parsed.records.length} 条记录`);
}

async function importFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    await importCsvText(text);
  } catch (err) {
    toast('读取文件失败：' + ((err && err.message) || '未知错误'));
  }
}

async function deleteByRange() {
  const start = $('#exportStartDate').value;
  const end = $('#exportEndDate').value;
  if (!start || !end) { toast('请先选择开始和结束日期'); return; }
  if (start > end) { toast('开始日期不能晚于结束日期'); return; }

  const ok = await confirmDialog({
    title: '删除这段时间的数据？',
    text: `${start} 至 ${end} 之间的所有记录都会被删除，不可恢复。建议先导出备份。`,
    okText: '删除'
  });
  if (!ok) return;

  const before = appData.records.length;
  appData.records = appData.records.filter(r => !r.date || r.date < start || r.date > end);
  const deleted = before - appData.records.length;
  await persist();
  refreshAll();
  updateAppbar();
  toast(`已删除 ${deleted} 条记录`);
}

async function deleteAll() {
  const ok = await confirmDialog({
    title: '删除全部记录？',
    text: '所有记账记录都会被清空（预算和分类保留），不可恢复。建议先导出备份。',
    okText: '全部删除'
  });
  if (!ok) return;

  const deleted = appData.records.length;
  appData.records = [];
  await persist();
  refreshAll();
  updateAppbar();
  toast(`已删除全部 ${deleted} 条记录`);
}

/* ============================ AI 聊天 ============================ */

function appendChat(role, text, extraClass) {
  const el = document.createElement('div');
  el.className = 'chat-msg ' + role + (extraClass ? ' ' + extraClass : '');
  el.textContent = text;
  $('#chatMessages').appendChild(el);
  scrollChatToBottom();
  return el;
}

function scrollChatToBottom() {
  const box = $('#chatMessages');
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  const input = $('#chatInput');
  const msg = input.value.trim();
  if (!msg || chatBusy) return;

  chatBusy = true;
  input.value = '';
  appendChat('user', msg);
  const loading = appendChat('ai', '分析中…', 'loading');

  const contextData = {
    本月记录: getMonthRecords(),
    预算设置: appData.budget,
    所有记录数: appData.records.length
  };

  const result = await aiChat(msg, contextData);
  loading.remove();
  chatBusy = false;

  if (result.success) {
    appendChat('ai', result.reply);
  } else {
    appendChat('system', result.error || '请求失败');
  }
}

/* ============================ 事件绑定 ============================ */

function bindEvents() {
  // 底部导航
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // 卡片上的「去设置 / 全部」跳转
  $$('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.goto));
  });

  // 记账弹层
  $('#btnAdd').addEventListener('click', () => openSheet(null));
  $('#sheetMask').addEventListener('click', hideSheet);
  $('#btnSheetCancel').addEventListener('click', hideSheet);
  $('#btnSheetSave').addEventListener('click', saveSheet);
  $('#btnSheetDelete').addEventListener('click', deleteCurrent);

  $$('#typeSwitch .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      syncTypeUI();
    });
  });

  $('#categoryChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectedCategory = chip.dataset.cat;
    renderCategoryChips();
  });

  $('#inputAmount').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveSheet();
  });

  // 流水
  $('#searchInput').addEventListener('input', renderRecords);
  $('#content').addEventListener('scroll', () => {
    if (currentView !== 'records') return;
    const el = $('#content');
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) loadMore();
  });

  const handleRecordTap = e => {
    const item = e.target.closest('.record-item');
    if (!item) return;
    const rec = appData.records.find(r => String(r.id) === String(item.dataset.id));
    if (rec) openSheet(rec);
  };
  $('#recordList').addEventListener('click', handleRecordTap);
  $('#recentList').addEventListener('click', handleRecordTap);

  // 设置
  $('#btnSaveBudget').addEventListener('click', saveBudget);
  $('#btnAddCategory').addEventListener('click', addCategory);
  $('#catList').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeCategory(btn.dataset.remove);
  });
  $('#btnSaveAi').addEventListener('click', saveAiConfig);

  $('#btnExportAll').addEventListener('click', exportAllCsv);
  $('#btnExportRangeCsv').addEventListener('click', () => exportByRange('csv'));
  $('#btnExportRangeJson').addEventListener('click', () => exportByRange('json'));
  $('#btnImportFile').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    importFromFile(file);
  });
  $('#btnImportPaste').addEventListener('click', async () => {
    const text = await askText('粘贴 CSV 内容', 'date,type,category,amount,note\n2026-11-01,expense,餐饮,25.5,午餐');
    if (text && text.trim()) importCsvText(text);
  });
  $('#btnDeleteRange').addEventListener('click', deleteByRange);
  $('#btnDeleteAll').addEventListener('click', deleteAll);

  // 对话框
  $('#dialogCancel').addEventListener('click', () => settleDialog(false));
  $('#dialogOk').addEventListener('click', () => settleDialog(true));
  $('#dialogMask').addEventListener('click', e => {
    if (e.target === $('#dialogMask')) settleDialog(false);
  });

  // AI
  $('#btnSend').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });
}

/* ============================ 启动 ============================ */

async function init() {
  appData = Core.normalize(await readJSON('data'));
  const rawConfig = await readJSON('config');
  appConfig = Object.assign(Core.defaultConfig(), rawConfig || {});
  appConfig.ai = Object.assign({ apiKey: '', baseUrl: '', model: '' }, (rawConfig && rawConfig.ai) || {});

  $('#inputDate').value = Core.todayStr();
  $('#chatInput').placeholder = '例如：我这个月餐饮花了多少？';

  bindEvents();
  renderSettings();
  renderCatList();
  renderCategoryChips();
  refreshAll();
  setView('dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:16px;background:#fce8e6;color:#a50e0e;font-size:13px;">初始化失败：${esc(err && err.message)}</div>`);
  });
});
