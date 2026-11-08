/**
 * 桌面端 · 设置页与 AI 配置
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
// ========== 设置页 ==========
function renderSettings() {
  document.getElementById('setMonthlyBudget').value = appData.budget.monthly;
  document.getElementById('setRewardBudget').value = (appData.reward && appData.reward.monthly) || 0;
  document.getElementById('setAiBaseUrl').value = appConfig.ai.baseUrl || '';
  document.getElementById('setAiKey').value = appConfig.ai.apiKey || '';
  document.getElementById('setAiModel').value = appConfig.ai.model || '';
}

async function saveBudget() {
  appData.budget.monthly = parseFloat(document.getElementById('setMonthlyBudget').value) || 0;
  if (!appData.reward) appData.reward = { monthly: 0 };
  appData.reward.monthly = parseFloat(document.getElementById('setRewardBudget').value) || 0;

  // 读取分类预算
  const catInputs = document.querySelectorAll('.cat-budget-row input');
  appData.budget.categories = {};
  catInputs.forEach(input => {
    const category = input.dataset.cat;
    const val = parseFloat(input.value) || 0;
    if (val > 0) appData.budget.categories[category] = val;
  });

  await window.ledgerAPI.saveData(appData);
  renderDashboard();
  renderSettings();
  alert('预算已保存');
}

function renderCatBudgetSettings() {
  const container = document.getElementById('catBudgetSettings');
  container.innerHTML = '';

  const records = getCurrentMonthRecords().filter(record => record.type === 'expense' && !isReward(record));
  const catSpent = {};
  records.forEach(record => catSpent[record.category] = (catSpent[record.category] || 0) + record.amount);

  appData.categories.forEach(category => {
    const row = document.createElement('div');
    row.className = 'cat-budget-row';
    const budget = (appData.budget.categories || {})[category] || 0;
    const spent = catSpent[category] || 0;
    const over = spent > budget && budget > 0;
    row.innerHTML = `
      <label>${category}</label>
      <input type="number" data-cat="${category}" value="${budget}" placeholder="0" step="0.01" min="0">
      <span class="used ${over ? 'over' : ''}">已花 ¥${formatMoney(spent)}${over ? ' ⚠️ 超支' : ''}</span>
    `;
    container.appendChild(row);
  });
}

function renderCatList() {
  const container = document.getElementById('catList');
  container.innerHTML = '';
  appData.categories.forEach(category => {
    const tag = document.createElement('span');
    tag.className = 'cat-tag';
    tag.innerHTML = `${category} <button onclick="removeCategory('${category}')">×</button>`;
    container.appendChild(tag);
  });
}

function addCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  if (appData.categories.includes(name)) {
    alert('分类已存在');
    return;
  }
  appData.categories.push(name);
  document.getElementById('newCatName').value = '';
  window.ledgerAPI.saveData(appData);
  renderCategorySelect();
  renderCatList();
  renderCatBudgetSettings();
}

function removeCategory(category) {
  if (!confirm(`删除分类"${category}"？已有记录不受影响`)) return;
  appData.categories = appData.categories.filter(category => category !== category);
  window.ledgerAPI.saveData(appData);
  renderCategorySelect();
  renderCatList();
  renderCatBudgetSettings();
}

async function saveAiConfig() {
  appConfig.ai.baseUrl = document.getElementById('setAiBaseUrl').value.trim();
  appConfig.ai.apiKey = document.getElementById('setAiKey').value.trim();
  appConfig.ai.model = document.getElementById('setAiModel').value.trim();
  await window.ledgerAPI.saveConfig(appConfig);
  alert('AI 配置已保存');
}

async function testAiConfig() {
  const box = document.getElementById('aiTestResult');
  const button = document.getElementById('btnTestAi');
  box.hidden = false;
  box.className = 'ai-test-result';
  box.textContent = '正在连接…';
  button.disabled = true;
  try {
    // 先落盘，确保测的就是刚填进去的配置
    await saveAiConfigSilently();
    const result = await window.ledgerAPI.aiChat('连接测试，请只回复"连接成功"', {});
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

async function saveAiConfigSilently() {
  appConfig.ai.baseUrl = document.getElementById('setAiBaseUrl').value.trim();
  appConfig.ai.apiKey = document.getElementById('setAiKey').value.trim();
  appConfig.ai.model = document.getElementById('setAiModel').value.trim();
  await window.ledgerAPI.saveConfig(appConfig);
}
