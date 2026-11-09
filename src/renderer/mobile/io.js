/**
 * 安卓端 · CSV / JSON 导入导出与批量删除
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { jsPDF } from 'jspdf';
import { persist, refreshAll } from './data.js';
import { Core, NATIVE } from './deps.js';
import { saveAndShare, saveAndShareBytes } from './platform.js';
import { renderReceiptCanvas } from './receipt.js';
import { state } from './state.js';
import { queryElement, confirmDialog, showToast } from './ui.js';
import { updateAppbar } from './views.js';

/* ============================ 导入导出 ============================ */

export function reportExportResult(name, count, result) {
  if (result && result.shared === false) {
    showToast('已取消分享，可再次点击导出');
  } else if (!NATIVE) {
    showToast('已下载 ' + name);
  } else {
    showToast(`已导出 ${count} 条记录，可再次分享到微信 / QQ`);
  }
}

export async function exportAllCsv() {
  try {
    const content = Core.buildFullCsv(state.appData.records);
    const name = `账单导出_${Core.todayStr()}.csv`;
    const result = await saveAndShare(name, content, 'text/csv;charset=utf-8');
    reportExportResult(name, state.appData.records.length, result);
  } catch (caughtError) {
    showToast('导出失败：' + ((caughtError && caughtError.message) || '未知错误'));
  }
}

export async function exportByRange(format) {
  const start = queryElement('#exportStartDate').value;
  const end = queryElement('#exportEndDate').value;

  if (!start || !end) { showToast('请选择开始和结束日期'); return; }
  if (start > end) { showToast('开始日期不能晚于结束日期'); return; }

  const records = Core.filterByRange(state.appData.records, start, end);
  if (!records.length) { showToast('所选时间范围内没有记录'); return; }

  const extension = format === 'json' ? 'json' : 'csv';
  const name = `ledger_${start}_${end}.${extension}`;
  const content = format === 'json'
    ? Core.buildRangeJson(records, { startDate: start, endDate: end, budget: state.appData.budget, categories: state.appData.categories })
    : Core.buildRangeCsv(records);

  try {
    const result = await saveAndShare(name, content, format === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    reportExportResult(name, records.length, result);
  } catch (caughtError) {
    showToast('导出失败：' + ((caughtError && caughtError.message) || '未知错误'));
  }
}

/**
 * 导出账单：在离线环境中生成真正的 PDF 小票。
 * 思路：用 Canvas 2D 把「超市小票」画出来（系统字体天然支持中文、样式完全可控、
 * 美观），再交给 jspdf 包装成 .pdf，最后走「写缓存 + 系统分享」通道分享。
 * 这样既不依赖 @capacitor/print（官方包未发布到当前 registry），也不需要在包里
 * 内嵌数 MB 的中文字体（纯 JS PDF 库无字体就无法渲染中文）。桌面端则用 Chromium
 * 原生 printToPDF 生成 .pdf，两端共用 buildReceiptModel 的口径与样式。
 *
 * @param {boolean} useSelection 是否仅导出多选勾选的记录；为 false 时导出全部记录。
 */
export async function exportBill(useSelection) {
  try {
    let records;
    let scope;
    if (useSelection && state.selectedIds.length) {
      const idSet = new Set(state.selectedIds.map(String));
      records = state.filteredRecords.filter(record => idSet.has(String(record.id)));
      scope = '选中记录';
    } else if (useSelection) {
      const bucket = state.recordFilter === 'all' ? null : state.recordFilter;
      records = Core.sortRecords(state.appData.records, queryElement('#searchInput').value, bucket);
      scope = '当前筛选';
    } else {
      records = state.appData.records.slice();
      scope = '全部记录';
    }
    if (!records.length) { showToast('没有可导出的记录'); return; }

    const model = Core.buildReceiptModel(records, { scope });
    const { canvas, width, height } = renderReceiptCanvas(model);
    const dataUrl = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ unit: 'px', format: [width, height], compress: true });
    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
    const dataUri = pdf.output('datauristring');
    const pdfBase64 = dataUri.substring(dataUri.indexOf(',') + 1);

    const name = `账单_${Core.todayStr()}.pdf`;
    const result = await saveAndShareBytes(pdfBase64, name, 'application/pdf');
    reportExportResult(name, records.length, result);
  } catch (caughtError) {
    showToast('导出失败：' + ((caughtError && caughtError.message) || '未知错误'));
  }
}

export async function importCsvText(text) {
  const parsed = Core.parseCsv(text);
  if (!parsed.success) { showToast(parsed.error || '解析失败'); return; }

  const ok = await confirmDialog({
    title: `导入 ${parsed.records.length} 条记录？`,
    text: '将追加到现有数据，不会覆盖。',
    okText: '导入'
  });
  if (!ok) return;

  // 多次导入时让 importSeq 全局递增，避免不同批次的 CSV 行序在排序时相互穿插
  const maxSeq = state.appData.records.reduce((max, record) => Math.max(max, record.importSeq || 0), 0);
  parsed.records.forEach((record, index) => { record.importSeq = maxSeq + index + 1; });

  state.appData.records.push.apply(state.appData.records, parsed.records);
  await persist();
  refreshAll();
  updateAppbar();
  showToast(`已导入 ${parsed.records.length} 条记录`);
}

/** 老 WebView 没有 Blob.text()，退回 FileReader，避免「选择文件」在这些机型上直接失败 */
function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsText(file, 'UTF-8');
  });
}

export async function importFromFile(file) {
  if (!file) return;
  try {
    const text = await readFileText(file);
    await importCsvText(text);
  } catch (caughtError) {
    showToast('读取文件失败：' + ((caughtError && caughtError.message) || '未知错误') + '，可改用「粘贴文本」导入');
  }
}

export async function deleteByRange() {
  const start = queryElement('#exportStartDate').value;
  const end = queryElement('#exportEndDate').value;
  if (!start || !end) { showToast('请先选择开始和结束日期'); return; }
  if (start > end) { showToast('开始日期不能晚于结束日期'); return; }

  const ok = await confirmDialog({
    title: '删除这段时间的数据？',
    text: `${start} 至 ${end} 之间的所有记录都会被删除，不可恢复。建议先导出备份。`,
    okText: '删除'
  });
  if (!ok) return;

  const before = state.appData.records.length;
  state.appData.records = state.appData.records.filter(record => !record.date || record.date < start || record.date > end);
  const deleted = before - state.appData.records.length;
  await persist();
  refreshAll();
  updateAppbar();
  showToast(`已删除 ${deleted} 条记录`);
}

export async function deleteAll() {
  const ok = await confirmDialog({
    title: '删除全部记录？',
    text: '所有记账记录都会被清空（预算和分类保留），不可恢复。建议先导出备份。',
    okText: '全部删除'
  });
  if (!ok) return;

  const deleted = state.appData.records.length;
  state.appData.records = [];
  await persist();
  refreshAll();
  updateAppbar();
  showToast(`已删除全部 ${deleted} 条记录`);
}
