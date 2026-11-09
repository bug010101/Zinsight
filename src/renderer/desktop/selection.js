/**
 * 桌面端 · 记录详情弹层、多选与 PDF 账单导出入口
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 * 之所以单独成文件：actions.js 已接近 300 行上限，把「详情 + 多选 + 导出」
 * 这一类与流水列表交互相关的逻辑挪到这里，既守住单文件行数红线，
 * 也避免把详情弹层塞进「记账动作」模块里。
 */
// ========== 记录详情 ==========
function viewRecord(id) {
  const currentRecord = appData.records.find(record => String(record.id) === String(id));
  if (!currentRecord) return;
  const rows = [
    ['记账日期', currentRecord.date],
    ['类型', currentRecord.type === 'income' ? '收入' : '支出'],
    ['分类', currentRecord.category],
    ['金额', (currentRecord.type === 'income' ? '收入' : '支付') + ' ¥' + formatMoney(currentRecord.amount)],
    ['备注', currentRecord.note || '—'],
    ['归属', Core.bucketLabel(currentRecord)],
    ['完整记录时间', Core.formatFullDateTime(currentRecord)],
    ['记录 ID', currentRecord.id]
  ];
  const container = document.getElementById('detailRows');
  container.innerHTML = '';
  rows.forEach(function (entry) {
    const rowElement = document.createElement('div');
    rowElement.className = 'detail-row';
    const labelElement = document.createElement('span');
    labelElement.className = 'detail-label';
    labelElement.textContent = entry[0];
    const valueElement = document.createElement('span');
    valueElement.className = 'detail-value';
    valueElement.textContent = String(entry[1]);
    rowElement.appendChild(labelElement);
    rowElement.appendChild(valueElement);
    container.appendChild(rowElement);
  });
  document.getElementById('detailModal').classList.add('show');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('show');
}

// ========== 多选 ==========
function toggleSelectionMode() {
  selectionMode = !selectionMode;
  if (!selectionMode) selectedRecordIds = [];
  renderRecordPage();
}

function toggleRecordSelection(id) {
  const index = selectedRecordIds.indexOf(id);
  if (index >= 0) selectedRecordIds.splice(index, 1);
  else selectedRecordIds.push(id);
  renderRecordPage();
}

function selectAllInView() {
  const idSet = new Set(selectedRecordIds.map(String));
  currentFilteredRecords.forEach(record => idSet.add(String(record.id)));
  selectedRecordIds = Array.from(idSet);
  renderRecordPage();
}

function clearSelection() {
  selectedRecordIds = [];
  renderRecordPage();
}

function updateSelectionUi() {
  const bar = document.getElementById('selectionBar');
  const count = document.getElementById('selectionCount');
  const toggleButton = document.getElementById('btnSelectMode');
  if (!bar) return;
  bar.style.display = selectionMode ? 'flex' : 'none';
  if (count) count.textContent = '已选 ' + selectedRecordIds.length + ' 条';
  if (toggleButton) toggleButton.textContent = selectionMode ? '退出多选' : '多选';
}

// ========== 导出 PDF 账单 ==========
async function doExportPdf(records, scope) {
  if (!records.length) {
    alert('当前没有可导出的记录');
    return;
  }
  try {
    const result = await window.ledgerAPI.exportPdf({ records: records, scope: scope });
    if (result.success) alert('已导出 PDF：' + result.path);
    else if (!result.canceled) alert('导出失败：' + result.error);
  } catch (caughtError) {
    alert('导出失败：' + ((caughtError && caughtError.message) || '未知错误'));
  }
}

async function exportSelectedPdf() {
  let records;
  let scope;
  if (selectedRecordIds.length) {
    const idSet = new Set(selectedRecordIds.map(String));
    records = currentFilteredRecords.filter(record => idSet.has(String(record.id)));
    scope = '选中记录';
  } else {
    records = currentFilteredRecords.slice();
    scope = '当前筛选';
  }
  await doExportPdf(records, scope);
}

async function exportAllPdf() {
  await doExportPdf(appData.records.slice(), '全部记录');
}
