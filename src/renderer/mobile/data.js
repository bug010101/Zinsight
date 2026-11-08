/**
 * 安卓端 · 数据聚合与刷新调度
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { renderStats } from './charts.js';
import { Core } from './deps.js';
import { writeJSON } from './platform.js';
import { renderCatBudgetSettings } from './settings.js';
import { state } from './state.js';
import { renderDashboard, renderRecords } from './views.js';

/* ============================ 数据 ============================ */

export const getMonthRecords = () => Core.filterByMonth(state.appData.records, Core.monthKey());
export const getMonthSummary = () => Core.summarize(getMonthRecords());

export async function persist() {
  await writeJSON('data', state.appData);
}

export function refreshAll() {
  renderDashboard();
  renderRecords();
  renderStats();
  renderCatBudgetSettings();
}
