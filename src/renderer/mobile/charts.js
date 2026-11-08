/**
 * 安卓端 · 统计页图表
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { getMonthRecords } from './data.js';
import { Core } from './deps.js';
import { state } from './state.js';
import { queryElement, escapeHtml } from './ui.js';

/* ============================ 统计 ============================ */

export function renderStats() {
  renderCategoryChart();
  renderTrendChart();
  renderMonthCompare();
  renderRewardCategoryChart();
}

export const CHART_COLORS = ['#0b57d0', '#1e8e3e', '#e8710a', '#d93025', '#7b3fe4', '#12a4b8', '#e5257a', '#8a8f98'];

export function renderCategoryChart() {
  const container = queryElement('#categoryChart');
  const { total, items } = Core.categorySummary(getMonthRecords());

  if (!total) {
    container.innerHTML = '<div class="empty">本月还没有支出记录</div>';
    return;
  }

  container.innerHTML = items.map((it, index) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(it.cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${it.pct.toFixed(1)}%;background:${CHART_COLORS[index % CHART_COLORS.length]};"></div></div>
      <div class="bar-value">¥${Core.formatMoney(it.sum)}</div>
    </div>
  `).join('');
}

export function renderTrendChart() {
  const days = Core.daysInMonth();
  const daily = Core.dailyTrend(getMonthRecords(), days);
  const max = Math.max.apply(null, Object.keys(daily).map(dayKey => daily[dayKey]).concat([1]));
  const container = queryElement('#trendChart');

  let html = '';
  for (let day = 1; day <= days; day++) {
    const amount = daily[day];
    const height = amount > 0 ? Math.max((amount / max) * 100, 3) : 2;
    html += `<div class="trend-bar" style="height:${height}%;opacity:${amount > 0 ? .95 : .35};" title="${day} 日 ¥${Core.formatMoney(amount)}"></div>`;
  }
  container.innerHTML = html;
  queryElement('#trendAxisEnd').textContent = days + ' 日';
}

export function renderMonthCompare() {
  const months = Core.lastMonths(6);
  const sums = Core.monthSums(state.appData.records, months);
  const max = Math.max.apply(null, months.map(month => sums[month]).concat([1]));
  const container = queryElement('#monthCompareChart');

  container.innerHTML = months.map(month => {
    const sum = sums[month];
    const pct = (sum / max) * 100;
    const mon = parseInt(month.split('-')[1], 10);
    return `
      <div class="bar-row">
        <div class="bar-label">${mon} 月</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#0b57d0;"></div></div>
        <div class="bar-value">¥${Core.formatMoney(sum)}</div>
      </div>`;
  }).join('');
}

export const REWARD_COLORS = ['#6f3fd4', '#9d72ff', '#c084fc', '#e879f9'];

export function renderRewardCategoryChart() {
  const container = queryElement('#rewardCategoryChart');
  const { total, items } = Core.categorySummary(getMonthRecords(), 'reward');

  if (!total) {
    container.innerHTML = '<div class="empty">本月还没有奖励消费，记一笔选「奖励消费」试试</div>';
    return;
  }

  container.innerHTML = items.map((it, index) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(it.cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${it.pct.toFixed(1)}%;background:${REWARD_COLORS[index % REWARD_COLORS.length]};"></div></div>
      <div class="bar-value">¥${Core.formatMoney(it.sum)}</div>
    </div>
  `).join('');
}
