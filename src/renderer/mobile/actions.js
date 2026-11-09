/**
 * 安卓端 · 记账弹层与保存/删除动作
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { persist, refreshAll } from './data.js';
import { Core } from './deps.js';
import { state } from './state.js';
import { queryElement, queryElements, confirmDialog, escapeHtml, showToast } from './ui.js';
import { updateAppbar } from './views.js';

/* ============================ 记账弹层 ============================ */

export function showSheet() {
  queryElement('#sheetMask').classList.add('show');
  queryElement('#sheet').classList.add('show');
}

export function hideSheet() {
  queryElement('#sheetMask').classList.remove('show');
  queryElement('#sheet').classList.remove('show');
  state.editingId = null;
}

export function openSheet(record) {
  state.editingId = record ? record.id : null;
  state.currentType = record ? record.type : 'expense';
  state.currentBucket = record ? Core.bucketOf(record) : 'life';
  state.selectedCategory = record && record.category
    ? record.category
    : (state.appData.categories[0] || '其他');

  queryElement('#sheetTitle').textContent = record ? '编辑记录' : '记一笔';
  queryElement('#inputAmount').value = record ? record.amount : '';
  queryElement('#inputNote').value = record ? (record.note || '') : '';
  queryElement('#inputDate').value = record ? record.date : Core.todayStr();
  queryElement('#inputDate').dataset.picked = queryElement('#inputDate').value;
  queryElement('#inputIncludeBalance').checked = record ? record.includeInBalance !== false : true;
  queryElement('#btnSheetDelete').style.display = record ? 'inline-flex' : 'none';
  queryElement('#btnSheetSave').textContent = record ? '保存' : '记一笔';

  syncTypeUI();
  syncBucketUI();
  renderCategoryChips();
  showSheet();
  if (!record) setTimeout(() => queryElement('#inputAmount').focus(), 280);
}

export function syncTypeUI() {
  queryElements('#typeSwitch .seg-btn').forEach(button => button.classList.toggle('active', button.dataset.type === state.currentType));
  queryElement('#includeBalanceRow').classList.toggle('hidden', state.currentType !== 'income');
  // 收入没有归属概念，固定算生活
  const isIncome = state.currentType === 'income';
  queryElement('#bucketSwitch').classList.toggle('hidden', isIncome);
  queryElement('#bucketHint').classList.toggle('hidden', isIncome);
  if (isIncome && state.currentBucket !== 'life') {
    state.currentBucket = 'life';
    syncBucketUI();
  }
}

export function syncBucketUI() {
  queryElements('#bucketSwitch .seg-btn').forEach(button => button.classList.toggle('active', button.dataset.bucket === state.currentBucket));
  queryElement('#bucketHint').textContent = state.currentBucket === 'reward'
    ? '奖励消费只扣奖励额度，不影响生活余额（额度在设置里改）'
    : '生活消费走月度预算，正常扣可用余额';
}

export function renderCategoryChips() {
  const box = queryElement('#categoryChips');
  if (!state.selectedCategory || state.appData.categories.indexOf(state.selectedCategory) < 0) {
    state.selectedCategory = state.appData.categories[0] || '其他';
  }
  box.innerHTML = state.appData.categories.map(category => `
    <button class="chip ${category === state.selectedCategory ? 'active' : ''}" data-cat="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join('');
}

export async function saveSheet() {
  const amount = parseFloat(queryElement('#inputAmount').value);
  const note = queryElement('#inputNote').value.trim();
  const dateEl = queryElement('#inputDate');
  const date = dateEl.value || dateEl.dataset.picked || Core.todayStr();

  if (!amount || amount <= 0) { showToast('请输入有效金额'); return; }
  if (!date) { showToast('请选择日期'); return; }

  const includeInBalance = state.currentType === 'income'
    ? queryElement('#inputIncludeBalance').checked
    : true; // 支出本来就是减余额
  const bucket = state.currentType === 'income' ? 'life' : state.currentBucket;

  if (state.editingId) {
    const currentRecord = state.appData.records.find(record => String(record.id) === String(state.editingId));
    if (currentRecord) {
      currentRecord.amount = amount;
      currentRecord.category = state.selectedCategory;
      currentRecord.note = note;
      currentRecord.date = date;
      currentRecord.type = state.currentType;
      currentRecord.bucket = bucket;
      currentRecord.includeInBalance = includeInBalance;
    }
    showToast('已更新');
  } else {
    state.appData.records.push({
      id: Core.generateId('rec'),
      type: state.currentType,
      amount: amount,
      category: state.selectedCategory,
      note: note,
      date: date,
      bucket: bucket,
      includeInBalance: includeInBalance,
      createdAt: Core.formatLocalDateTime(),
      hasTime: true
    });
    showToast(bucket === 'reward' ? '已记一笔奖励消费' : '已记一笔');
  }

  await persist();
  hideSheet();
  refreshAll();
  updateAppbar();
}

export async function deleteCurrent() {
  if (!state.editingId) return;
  const ok = await confirmDialog({
    title: '删除这条记录？',
    text: '删除后无法恢复。',
    okText: '删除'
  });
  if (!ok) return;

  state.appData.records = state.appData.records.filter(record => String(record.id) !== String(state.editingId));
  await persist();
  hideSheet();
  refreshAll();
  updateAppbar();
  showToast('已删除');
}

/* ============================ 记录详情 ============================ */

export function openDetail(record) {
  state.detailId = record ? record.id : null;
  const rows = [
    ['记账日期', record.date],
    ['类型', record.type === 'income' ? '收入' : '支出'],
    ['分类', record.category],
    ['金额', (record.type === 'income' ? '收入' : '支付') + ' ¥' + Core.formatMoney(record.amount)],
    ['备注', record.note || '—'],
    ['归属', Core.bucketLabel(record)],
    ['完整记录时间', Core.formatFullDateTime(record)],
    ['记录 ID', record.id]
  ];
  const container = queryElement('#detailRows');
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
  queryElement('#detailMask').classList.add('show');
  queryElement('#detailDialog').classList.add('show');
}

export function closeDetail() {
  queryElement('#detailMask').classList.remove('show');
  queryElement('#detailDialog').classList.remove('show');
  state.detailId = null;
}
