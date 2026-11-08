/**
 * 桌面端 · 启动入口（最后加载，调用 init）
 * 依赖：state.js / views.js / charts.js / actions.js / settings.js / chat.js（按顺序加载）
 */
// ========== 初始化 ==========
async function init() {
  appData = normalizeData(await window.ledgerAPI.readData());
  appConfig = normalizeConfig(await window.ledgerAPI.readConfig());

  // 默认日期为今天（本地时区，不能用 toISOString，否则早上 8 点前会变成昨天）
  document.getElementById('inputDate').value = todayStr();

  // 导出日期默认：本月1号 到 今天
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  document.getElementById('exportStartDate').value = monthStart;
  document.getElementById('exportEndDate').value = todayStr();

  renderCategorySelect();
  renderDashboard();
  renderRecords();
  renderStats();
  renderSettings();
  renderCatBudgetSettings();
  renderCatList();
  // 日期输入兜底：万一某些环境点选后不回写，至少把用户选的值记下来
  document.getElementById('inputDate').addEventListener('change', event => { event.target.dataset.picked = event.target.value; });

  // 监听菜单快捷键
  window.ledgerAPI.on('shortcut:quickAdd', () => {
    document.querySelector('.nav-tab[data-page="dashboard"]').click();
    document.getElementById('inputAmount').focus();
  });
  window.ledgerAPI.on('shortcut:openSettings', () => {
    document.querySelector('.nav-tab[data-page="settings"]').click();
  });
  window.ledgerAPI.on('shortcut:import', () => importCsv());
  window.ledgerAPI.on('shortcut:export', () => exportCsv());
  window.ledgerAPI.on('shortcut:navigate', (page) => {
    document.querySelector(`.nav-tab[data-page="${page}"]`).click();
  });
}

// ========== 启动 ==========
init();
