/**
 * 安卓端 · 事件绑定
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { deleteCurrent, hideSheet, openSheet, renderCategoryChips, saveSheet, syncBucketUI, syncTypeUI } from './actions.js';
import { sendChat } from './chat.js';
import { Core } from './deps.js';
import { deleteAll, deleteByRange, exportAllCsv, exportByRange, importCsvText, importFromFile } from './io.js';
import { addCategory, removeCategory, saveAiConfig, saveBudget, testAiConnection } from './settings.js';
import { state } from './state.js';
import { queryElement, queryElements, askText, settleDialog } from './ui.js';
import { loadMore, renderRecords, setRecordFilter, setView } from './views.js';

/* ============================ 事件绑定 ============================ */

export function bindEvents() {
  // 底部导航
  queryElements('.nav-btn').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  // 卡片上的「去设置 / 全部」跳转
  queryElements('[data-goto]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.goto));
  });

  // 记账弹层
  queryElement('#btnAdd').addEventListener('click', () => openSheet(null));
  queryElement('#sheetMask').addEventListener('click', hideSheet);
  queryElement('#btnSheetCancel').addEventListener('click', hideSheet);
  queryElement('#btnSheetSave').addEventListener('click', saveSheet);
  queryElement('#btnSheetDelete').addEventListener('click', deleteCurrent);

  queryElements('#typeSwitch .seg-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.currentType = button.dataset.type;
      syncTypeUI();
    });
  });

  queryElements('#bucketSwitch .seg-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.currentBucket = button.dataset.bucket;
      syncBucketUI();
    });
  });

  // 日期：快捷按钮 + 记录用户选中的值（个别 WebView 回写不及时）
  queryElement('#inputDate').addEventListener('change', event => { event.target.dataset.picked = event.target.value; });
  queryElement('#inputDate').addEventListener('input', event => { event.target.dataset.picked = event.target.value; });
  queryElement('#dateQuick').addEventListener('click', event => {
    const button = event.target.closest('[data-quick]');
    if (!button) return;
    const date = new Date();
    date.setDate(date.getDate() - Number(button.dataset.quick || 0));
    const value = Core.todayStr(date);
    queryElement('#inputDate').value = value;
    queryElement('#inputDate').dataset.picked = value;
  });

  queryElement('#categoryChips').addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.selectedCategory = chip.dataset.cat;
    renderCategoryChips();
  });

  queryElement('#inputAmount').addEventListener('keydown', event => {
    if (event.key === 'Enter') saveSheet();
  });

  // 流水
  queryElement('#searchInput').addEventListener('input', renderRecords);
  queryElement('#recordFilterChips').addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]');
    if (chip) setRecordFilter(chip.dataset.filter);
  });
  queryElement('#content').addEventListener('scroll', () => {
    if (state.currentView !== 'records') return;
    const element = queryElement('#content');
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 80) loadMore();
  });

  const handleRecordTap = event => {
    const item = event.target.closest('.record-item');
    if (!item) return;
    const currentRecord = state.appData.records.find(record => String(record.id) === String(item.dataset.id));
    if (currentRecord) openSheet(currentRecord);
  };
  queryElement('#recordList').addEventListener('click', handleRecordTap);
  queryElement('#recentList').addEventListener('click', handleRecordTap);

  // 设置
  queryElement('#btnSaveBudget').addEventListener('click', saveBudget);
  queryElement('#btnAddCategory').addEventListener('click', addCategory);
  queryElement('#catList').addEventListener('click', event => {
    const button = event.target.closest('[data-remove]');
    if (button) removeCategory(button.dataset.remove);
  });
  queryElement('#btnSaveAi').addEventListener('click', saveAiConfig);
  queryElement('#btnTestAi').addEventListener('click', testAiConnection);

  queryElement('#btnExportAll').addEventListener('click', exportAllCsv);
  queryElement('#btnExportRangeCsv').addEventListener('click', () => exportByRange('csv'));
  queryElement('#btnExportRangeJson').addEventListener('click', () => exportByRange('json'));
  queryElement('#btnImportFile').addEventListener('click', () => queryElement('#fileInput').click());
  queryElement('#fileInput').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    importFromFile(file);
  });
  queryElement('#btnImportPaste').addEventListener('click', async () => {
    const text = await askText('粘贴 CSV 内容', 'date,type,category,amount,note\n2026-11-01,expense,餐饮,25.5,午餐');
    if (text && text.trim()) importCsvText(text);
  });
  queryElement('#btnDeleteRange').addEventListener('click', deleteByRange);
  queryElement('#btnDeleteAll').addEventListener('click', deleteAll);

  // 对话框
  queryElement('#dialogCancel').addEventListener('click', () => settleDialog(false));
  queryElement('#dialogOk').addEventListener('click', () => settleDialog(true));
  queryElement('#dialogMask').addEventListener('click', event => {
    if (event.target === queryElement('#dialogMask')) settleDialog(false);
  });

  // AI
  queryElement('#btnSend').addEventListener('click', sendChat);
  queryElement('#chatInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); sendChat(); }
  });
}
