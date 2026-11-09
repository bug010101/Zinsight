/**
 * 安卓端 · 导航、看板与流水渲染
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { scrollChatToBottom } from './chat.js';
import { PAGE_SIZE } from './constants.js';
import { getMonthRecords, getMonthSummary } from './data.js';
import { Core } from './deps.js';
import { state } from './state.js';
import { queryElement, queryElements, escapeHtml } from './ui.js';

/* ============================ 导航 ============================ */

export const VIEW_TITLES = {
  dashboard: '看板',
  records: '流水',
  stats: '统计',
  ai: 'AI 分析',
  settings: '设置'
};

export function setView(view) {
  state.currentView = view;
  queryElements('.view').forEach(viewElement => viewElement.classList.toggle('active', viewElement.dataset.view === view));
  queryElements('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  queryElement('#content').classList.toggle('is-ai', view === 'ai');
  updateAppbar();
  if (view === 'ai') scrollChatToBottom();
  if (view !== 'ai') queryElement('#content').scrollTop = 0;
}

export function updateAppbar() {
  queryElement('#appbarTitle').textContent = VIEW_TITLES[state.currentView] || 'Zinsight';
  const now = new Date();
  const monthText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
  let sub = monthText;

  if (state.currentView === 'records') sub = `共 ${state.appData.records.length} 笔记录`;
  else if (state.currentView === 'stats') sub = '本月统计';
  else if (state.currentView === 'ai') sub = '基于你的本地数据';
  else if (state.currentView === 'settings') sub = '数据只存在本机';

  queryElement('#appbarSub').textContent = sub;
}

/* ============================ 看板 ============================ */

export function renderDashboard() {
  const summary = getMonthSummary();
  const budget = Number(state.appData.budget.monthly) || 0;
  const balance = Core.balanceOf(budget, summary);
  const now = new Date();
  const totalDays = Core.daysInMonth(now);
  const today = now.getDate();
  const daysLeft = totalDays - today + 1;

  queryElement('#balanceAmount').textContent = Core.formatMoney(Math.max(balance, 0));
  queryElement('#budgetTotal').textContent = '¥' + Core.formatMoney(budget);
  queryElement('#spentTotal').textContent = '¥' + Core.formatMoney(summary.lifeExpense);
  queryElement('#dailyAvg').textContent = '¥' + Core.formatMoney(Core.dailyBudget(balance, daysLeft));
  queryElement('#daysLeft').textContent = daysLeft;

  queryElement('#monthExpense').textContent = '¥' + Core.formatMoney(summary.lifeExpense);
  queryElement('#monthReward').textContent = '¥' + Core.formatMoney(summary.rewardExpense);
  queryElement('#monthIncome').textContent = '¥' + Core.formatMoney(summary.income);
  queryElement('#monthCount').textContent = summary.count + ' 笔';

  const card = queryElement('#balanceCard');
  card.classList.remove('warning', 'danger');
  const level = Core.budgetLevel(summary.lifeExpense, budget);
  if (level !== 'normal') card.classList.add(level);

  renderRewardCard(summary, daysLeft);
  renderCatBudgetOverview();
  renderRecentList();
}

/** 奖励额度卡：独立池子，只受奖励消费影响 */
export function renderRewardCard(summary, daysLeft) {
  const cap = Number((state.appData.reward && state.appData.reward.monthly) || 0);
  const spent = summary.rewardExpense;
  const left = cap - spent;
  const card = queryElement('#rewardCard');

  card.classList.remove('over', 'idle');
  queryElement('#rewardTotal').textContent = Core.formatMoney(cap);
  queryElement('#rewardSpent').textContent = Core.formatMoney(spent);
  queryElement('#rewardLeft').textContent = Core.formatMoney(Math.max(left, 0));
  queryElement('#rewardDailyAvg').textContent = Core.formatMoney(left > 0 ? left / Math.max(daysLeft, 1) : 0);
  queryElement('#rewardFill').style.width = cap > 0 ? Core.rewardUsedPct(cap, summary) + '%' : '0%';

  if (!cap) {
    card.classList.add('idle');
    queryElement('#rewardTag').textContent = '未设置';
    queryElement('#rewardHint').textContent = '还没设奖励额度，去「设置 → 预算设置」填一个';
    return;
  }

  queryElement('#rewardTag').textContent = left < 0 ? '已超额' : '奖励自己';
  if (left < 0) card.classList.add('over');
  queryElement('#rewardHint').textContent = left < 0
    ? `奖励额度超了 ¥${Core.formatMoney(Math.abs(left))}，下个月再补回来`
    : '奖励消费只扣这份额度，不影响生活余额';
}

export function renderCatBudgetOverview() {
  const container = queryElement('#catBudgetList');
  const budgets = state.appData.budget.categories || {};
  const rows = Core.categoryBudgetRows(getMonthRecords(), budgets);

  if (!rows.length) {
    container.innerHTML = '<div class="empty" style="padding:14px 0;">还没有分类预算，去设置页加一个</div>';
    return;
  }

  container.innerHTML = rows.map(record => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(record.cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${record.pct}%;background:${record.color};"></div></div>
      <div class="bar-value">¥${Core.formatMoney(record.used)}/${Core.formatMoney(record.budget)}</div>
    </div>
  `).join('');
}

export function renderRecentList() {
  const list = queryElement('#recentList');
  const recent = Core.sortRecords(state.appData.records, '').slice(0, 5);
  if (!recent.length) {
    list.innerHTML = '<div class="empty" style="padding:16px 0;">还没有记录，点右上角 + 记一笔</div>';
    return;
  }
  list.innerHTML = recent.map(record => recordItemHtml(record)).join('');
}

/* ============================ 流水 ============================ */

export function recordItemHtml(record) {
  const direction = record.type === 'expense' ? '支付' : '收入';
  const isReward = Core.isReward(record);
  const selectable = state.selectionMode && state.currentView === 'records';
  const checked = selectable && state.selectedIds.indexOf(record.id) >= 0;
  if (selectable) {
    return `
    <div class="record-item selectable ${checked ? 'selected' : ''}" data-id="${escapeHtml(record.id)}">
      <span class="record-check${checked ? ' on' : ''}"></span>
      <div class="record-icon${isReward ? ' reward' : ''}">${Core.categoryIcon(record.category)}</div>
      <div class="record-info">
        <div class="record-cat">${escapeHtml(record.category)}${isReward ? '<span class="record-badge">奖励</span>' : ''}</div>
        <div class="record-note">${escapeHtml(record.note || '—')}</div>
      </div>
      <div class="record-right">
        <div class="record-amount ${record.type}${isReward ? ' reward' : ''}">${direction} ¥${Core.formatMoney(record.amount)}</div>
        <div class="record-date">${escapeHtml(Core.formatRecordTime(record))}</div>
      </div>
    </div>`;
  }
  return `
    <div class="record-item" data-id="${escapeHtml(record.id)}">
      <div class="record-icon${isReward ? ' reward' : ''}">${Core.categoryIcon(record.category)}</div>
      <div class="record-info">
        <div class="record-cat">${escapeHtml(record.category)}${isReward ? '<span class="record-badge">奖励</span>' : ''}</div>
        <div class="record-note">${escapeHtml(record.note || '—')}</div>
      </div>
      <div class="record-right">
        <div class="record-amount ${record.type}${isReward ? ' reward' : ''}">${direction} ¥${Core.formatMoney(record.amount)}</div>
        <div class="record-date">${escapeHtml(Core.formatRecordTime(record))}</div>
      </div>
    </div>`;
}

/* ============================ 流水多选 ============================ */

export function toggleSelectionMode() {
  state.selectionMode = !state.selectionMode;
  if (!state.selectionMode) state.selectedIds = [];
  updateSelectionBar();
  paintRecords();
}

export function toggleRecordSelection(id) {
  const index = state.selectedIds.indexOf(id);
  if (index >= 0) state.selectedIds.splice(index, 1);
  else state.selectedIds.push(id);
  updateSelectionBar();
  paintRecords();
}

export function selectAllInView() {
  const idSet = new Set(state.selectedIds.map(String));
  state.filteredRecords.forEach(record => idSet.add(String(record.id)));
  state.selectedIds = Array.from(idSet);
  updateSelectionBar();
  paintRecords();
}

export function clearSelection() {
  state.selectedIds = [];
  updateSelectionBar();
  paintRecords();
}

export function updateSelectionBar() {
  const bar = queryElement('#selectionBar');
  const count = queryElement('#selectionCount');
  const toggleButton = queryElement('#btnSelectMode');
  if (!bar) return;
  bar.style.display = state.selectionMode ? 'flex' : 'none';
  if (count) count.textContent = '已选 ' + state.selectedIds.length + ' 条';
  if (toggleButton) toggleButton.textContent = state.selectionMode ? '退出多选' : '多选';
}

export function renderRecords() {
  const bucket = state.recordFilter === 'all' ? null : state.recordFilter;
  state.filteredRecords = Core.sortRecords(state.appData.records, queryElement('#searchInput').value, bucket);
  state.renderPage = 1;
  paintRecords();
}

export function setRecordFilter(filter) {
  state.recordFilter = filter;
  queryElements('#recordFilterChips .filter-chip').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  renderRecords();
}

export function paintRecords() {
  const list = queryElement('#recordList');
  const footer = queryElement('#recordsFooter');

  if (!state.filteredRecords.length) {
    const tip = queryElement('#searchInput').value
      ? '没有匹配的记录'
      : state.recordFilter === 'reward'
        ? '还没有奖励消费记录'
        : state.recordFilter === 'life'
          ? '还没有生活消费记录'
          : '还没有记录，点右上角 + 记一笔';
    list.innerHTML = '<div class="empty">' + tip + '</div>';
    footer.textContent = '';
    return;
  }

  const end = state.renderPage * PAGE_SIZE;
  list.innerHTML = state.filteredRecords.slice(0, end).map(record => recordItemHtml(record)).join('');
  footer.textContent = end < state.filteredRecords.length
    ? `已显示 ${end}/${state.filteredRecords.length} 条，继续下滑加载`
    : '— 已经到底了 —';
}

export function loadMore() {
  const end = state.renderPage * PAGE_SIZE;
  if (end >= state.filteredRecords.length) return;
  state.renderPage++;
  paintRecords();
}
