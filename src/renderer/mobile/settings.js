/**
 * 安卓端 · 设置页与 AI 配置
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { renderCategoryChips } from './actions.js';
import { getMonthRecords, persist } from './data.js';
import { Core, NATIVE } from './deps.js';
import { aiChat, writeJSON } from './platform.js';
import { state } from './state.js';
import { queryElement, queryElements, confirmDialog, escapeHtml, showToast } from './ui.js';
import { renderDashboard } from './views.js';

/* ============================ 设置 ============================ */

export function renderSettings() {
  queryElement('#setMonthlyBudget').value = state.appData.budget.monthly || '';
  queryElement('#setRewardBudget').value = (state.appData.reward && state.appData.reward.monthly) || '';
  queryElement('#setAiBaseUrl').value = (state.appConfig.ai && state.appConfig.ai.baseUrl) || '';
  queryElement('#setAiKey').value = (state.appConfig.ai && state.appConfig.ai.apiKey) || '';
  queryElement('#setAiModel').value = (state.appConfig.ai && state.appConfig.ai.model) || '';
  queryElement('#exportStartDate').value = Core.monthStartStr();
  queryElement('#exportEndDate').value = Core.todayStr();
  queryElement('#versionHint').textContent = `Zinsight · 数据全部保存在本机${NATIVE ? '' : '（浏览器预览模式）'}`;
}

export function renderCatBudgetSettings() {
  const container = queryElement('#catBudgetSettings');
  const spent = Core.summarize(getMonthRecords()).catSpent;

  container.innerHTML = state.appData.categories.map(category => {
    const budget = Number((state.appData.budget.categories || {})[category]) || 0;
    const used = spent[category] || 0;
    const over = budget > 0 && used > budget;
    return `
      <div class="cat-budget-row">
        <span>${escapeHtml(category)}</span>
        <input type="number" data-cat="${escapeHtml(category)}" value="${budget || ''}" placeholder="0" inputmode="decimal" step="0.01" min="0">
        <span class="used ${over ? 'over' : ''}">已花 ¥${Core.formatMoney(used)}${over ? ' 超支' : ''}</span>
      </div>`;
  }).join('');
}

export function renderCatList() {
  queryElement('#catList').innerHTML = state.appData.categories.map(category => `
    <span class="cat-tag">${escapeHtml(category)}<button data-remove="${escapeHtml(category)}" aria-label="删除分类">×</button></span>
  `).join('');
}

export async function saveBudget() {
  state.appData.budget.monthly = parseFloat(queryElement('#setMonthlyBudget').value) || 0;
  if (!state.appData.reward) state.appData.reward = { monthly: 0 };
  state.appData.reward.monthly = parseFloat(queryElement('#setRewardBudget').value) || 0;
  const categories = {};
  queryElements('#catBudgetSettings .cat-budget-row input').forEach(input => {
    const val = parseFloat(input.value) || 0;
    if (val > 0) categories[input.dataset.cat] = val;
  });
  state.appData.budget.categories = categories;

  await persist();
  renderDashboard();
  renderCatBudgetSettings();
  renderSettings();
  showToast('预算已保存');
}

export async function addCategory() {
  const input = queryElement('#newCatName');
  const name = input.value.trim();
  if (!name) { showToast('请输入分类名称'); return; }
  if (state.appData.categories.indexOf(name) >= 0) { showToast('分类已存在'); return; }

  state.appData.categories.push(name);
  input.value = '';
  await persist();
  renderCatList();
  renderCatBudgetSettings();
  renderCategoryChips();
  showToast('已添加');
}

export async function removeCategory(category) {
  const ok = await confirmDialog({
    title: `删除分类「${category}」？`,
    text: '已有记录不受影响，只是以后不再选它。',
    okText: '删除'
  });
  if (!ok) return;

  state.appData.categories = state.appData.categories.filter(category => category !== category);
  await persist();
  renderCatList();
  renderCatBudgetSettings();
  renderCategoryChips();
  showToast('已删除分类');
}

export async function applyAiConfig() {
  state.appConfig.ai = state.appConfig.ai || {};
  // 归一化后回填输入框，让用户看到实际会请求的完整地址
  state.appConfig.ai.baseUrl = Core.normalizeAiEndpoint(queryElement('#setAiBaseUrl').value);
  state.appConfig.ai.apiKey = queryElement('#setAiKey').value.trim();
  state.appConfig.ai.model = queryElement('#setAiModel').value.trim();
  queryElement('#setAiBaseUrl').value = state.appConfig.ai.baseUrl;
  await writeJSON('config', state.appConfig);
}

export async function saveAiConfig() {
  await applyAiConfig();
  showToast('AI 配置已保存');
}

export async function testAiConnection() {
  const box = queryElement('#aiTestResult');
  const button = queryElement('#btnTestAi');
  if (!box || !button) return;
  box.hidden = false;
  box.className = 'ai-test-result';
  box.textContent = '正在连接…';
  button.disabled = true;
  try {
    await applyAiConfig();
    const result = await aiChat('连接测试，请只回复"连接成功"', {});
    if (result.success) {
      box.className = 'ai-test-result ok';
      box.textContent = '连接成功：' + (result.reply || '接口已返回');
    } else {
      box.className = 'ai-test-result bad';
      box.textContent = '连接失败：' + (result.error || '未知错误');
    }
  } catch (caughtError) {
    box.className = 'ai-test-result bad';
    box.textContent = '连接失败：' + ((caughtError && caughtError.message) || '未知错误');
  } finally {
    button.disabled = false;
  }
}
