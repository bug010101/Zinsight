/**
 * 桌面端 · 记账编辑、导入导出与数据操作
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
// ========== 记账 ==========
function setType(type) {
  currentType = type;
  document.querySelectorAll('.js-type').forEach(button => {
    button.classList.remove('active', 'expense', 'income');
  });
  const button = document.querySelector(`.js-type[data-type="${type}"]`);
  if (button) button.classList.add('active', type);
  // 收入时显示"计入可用余额"选项，并把归属锁到生活
  document.getElementById('includeBalanceRow').style.display = type === 'income' ? 'flex' : 'none';
  document.getElementById('bucketRow').style.display = type === 'income' ? 'none' : 'flex';
  document.getElementById('bucketHintRow').style.display = type === 'income' ? 'none' : 'flex';
  if (type === 'income') setBucket('life');
}

function setBucket(bucket) {
  currentBucket = bucket === 'reward' ? 'reward' : 'life';
  document.querySelectorAll('.js-bucket').forEach(button => {
    button.classList.remove('active', 'life', 'reward');
  });
  const button = document.querySelector(`.js-bucket[data-bucket="${currentBucket}"]`);
  if (button) button.classList.add('active', currentBucket);
  const hint = document.getElementById('bucketHint');
  if (hint) {
    hint.textContent = currentBucket === 'reward'
      ? '奖励消费只扣奖励额度，不影响生活余额（额度可在设置里改）'
      : '生活消费走月度预算，正常扣可用余额';
  }
}

function renderCategorySelect() {
  const selector = document.getElementById('inputCategory');
  selector.innerHTML = '';
  appData.categories.forEach(category => {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    selector.appendChild(opt);
  });
}

async function addRecord() {
  const amount = parseFloat(document.getElementById('inputAmount').value);
  const category = document.getElementById('inputCategory').value;
  const note = document.getElementById('inputNote').value;
  const dateEl = document.getElementById('inputDate');
  const date = dateEl.value || dateEl.dataset.picked || todayStr();

  if (!amount || amount <= 0) {
    alert('请输入有效金额');
    return;
  }
  if (!date) {
    alert('请选择日期');
    return;
  }

  if (editingId) {
    // 编辑模式
    const currentRecord = appData.records.find(record => record.id === editingId);
    if (currentRecord) {
      currentRecord.amount = amount;
      currentRecord.category = category;
      currentRecord.note = note;
      currentRecord.date = date;
      currentRecord.type = currentType;
      currentRecord.bucket = currentType === 'income' ? 'life' : currentBucket;
    }
    editingId = null;
  } else {
    // 新增
    const includeInBalance = currentType === 'income'
      ? document.getElementById('inputIncludeBalance').checked
      : true;  // 支出默认计入（本来就是减余额）
    appData.records.push({
      id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: currentType,
      amount, category, note, date,
      bucket: currentType === 'income' ? 'life' : currentBucket,
      includeInBalance,
      createdAt: Core.formatLocalDateTime()
    });
  }

  await window.ledgerAPI.saveData(appData);

  // 清空表单
  document.getElementById('inputAmount').value = '';
  document.getElementById('inputNote').value = '';
  setBucket('life');

  renderDashboard();
  renderRecords();
  renderStats();
  renderCatBudgetSettings();
}

function deleteRecord(id) {
  if (!confirm('确定删除这条记录？')) return;
  appData.records = appData.records.filter(record => String(record.id) !== String(id));
  window.ledgerAPI.saveData(appData);
  renderDashboard();
  renderRecords();
  renderStats();
  renderCatBudgetSettings();
}

let editingRecordId = null;
let editingType = 'expense';
let editingBucket = 'life';

function editRecord(id) {
  const currentRecord = appData.records.find(record => String(record.id) === String(id));
  if (!currentRecord) return;
  editingRecordId = id;
  editingType = currentRecord.type;

  // 填充弹窗数据
  document.getElementById('editAmount').value = currentRecord.amount;
  document.getElementById('editNote').value = currentRecord.note || '';
  document.getElementById('editDate').value = currentRecord.date;
  document.getElementById('editIncludeBalance').checked = currentRecord.includeInBalance !== false;

  // 分类下拉
  const selector = document.getElementById('editCategory');
  selector.innerHTML = '';
  appData.categories.forEach(category => {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    if (category === currentRecord.category) opt.selected = true;
    selector.appendChild(opt);
  });

  // 类型 / 归属按钮状态
  setEditType(currentRecord.type);
  setEditBucket(isReward(currentRecord) ? 'reward' : 'life');

  // 打开弹窗
  document.getElementById('editModal').classList.add('show');
  document.getElementById('editAmount').focus();
}

function setEditType(type) {
  editingType = type;
  document.querySelectorAll('.js-edit-type').forEach(button => {
    button.classList.remove('active', 'expense', 'income');
  });
  const button = document.querySelector(`.js-edit-type[data-type="${type}"]`);
  if (button) button.classList.add('active', type);
  // 收入时显示"计入可用余额"选项
  document.getElementById('editIncludeRow').style.display = type === 'income' ? 'flex' : 'none';
  document.getElementById('editBucketRow').style.display = type === 'income' ? 'none' : 'flex';
  if (type === 'income') setEditBucket('life');
}

function setEditBucket(bucket) {
  editingBucket = bucket === 'reward' ? 'reward' : 'life';
  document.querySelectorAll('.js-edit-bucket').forEach(button => {
    button.classList.remove('active', 'life', 'reward');
  });
  const button = document.querySelector(`.js-edit-bucket[data-bucket="${editingBucket}"]`);
  if (button) button.classList.add('active', editingBucket);
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
  editingRecordId = null;
}

// ========== 记录详情（在 selection.js） ==========

async function saveEdit() {
  const amount = parseFloat(document.getElementById('editAmount').value);
  const category = document.getElementById('editCategory').value;
  const note = document.getElementById('editNote').value;
  const date = document.getElementById('editDate').value;

  if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
  if (!date) { alert('请选择日期'); return; }

  const currentRecord = appData.records.find(record => String(record.id) === String(editingRecordId));
  if (currentRecord) {
    currentRecord.amount = amount;
    currentRecord.category = category;
    currentRecord.note = note;
    currentRecord.date = date;
    currentRecord.type = editingType;
    currentRecord.bucket = editingType === 'income' ? 'life' : editingBucket;
    currentRecord.includeInBalance = editingType === 'income'
      ? document.getElementById('editIncludeBalance').checked
      : true;
    await window.ledgerAPI.saveData(appData);
  }

  closeEditModal();
  renderDashboard();
  renderRecords();
  renderStats();
  renderCatBudgetSettings();
}

// ========== 导入导出 ==========
async function exportCsv() {
  const result = await window.ledgerAPI.exportCsv(appData.records);
  if (result.success) alert('导出成功：' + result.path);
}

async function exportByRange(format) {
  const start = document.getElementById('exportStartDate').value;
  const end = document.getElementById('exportEndDate').value;
  if (!start || !end) {
    alert('请选择开始和结束日期');
    return;
  }
  if (start > end) {
    alert('开始日期不能晚于结束日期');
    return;
  }
  const result = await window.ledgerAPI.exportByRange(start, end, format);
  if (result.success) {
    alert(`导出成功：${result.count} 条记录\n保存到：${result.path}`);
  } else if (!result.canceled) {
    alert('导出失败：' + result.error);
  }
}

async function deleteByRange() {
  const start = document.getElementById('exportStartDate').value;
  const end = document.getElementById('exportEndDate').value;
  if (!start || !end) {
    alert('请先选择开始和结束日期');
    return;
  }
  // 第一次确认
  if (!confirm(`即将删除 ${start} 至 ${end} 之间的所有记录，此操作不可恢复。\n\n确定要继续吗？`)) return;
  // 第二次确认
  if (!confirm(`再次确认：真的要删除这段时间的所有数据吗？`)) return;

  const result = await window.ledgerAPI.deleteByRange(start, end);
  if (result.success) {
    // 刷新数据
    appData = await window.ledgerAPI.readData();
    renderDashboard();
    renderRecords();
    renderStats();
    renderCatBudgetSettings();
    alert(`已删除 ${result.deleted} 条记录`);
  }
}

async function deleteAll() {
  // 第一次确认
  if (!confirm('即将删除所有记账记录（预算和分类设置保留），此操作不可恢复。\n\n确定要继续吗？')) return;
  // 第二次确认
  if (!confirm('再次确认：真的要删除全部记录吗？建议先导出备份。')) return;

  const result = await window.ledgerAPI.deleteAll();
  if (result.success) {
    appData = await window.ledgerAPI.readData();
    renderDashboard();
    renderRecords();
    renderStats();
    renderCatBudgetSettings();
    alert(`已删除全部 ${result.deleted} 条记录`);
  }
}

async function importCsv() {
  const result = await window.ledgerAPI.importCsv();
  if (result.success) {
    if (confirm(`导入 ${result.records.length} 条记录？（将追加到现有数据）`)) {
      appData.records.push(...result.records);
      await window.ledgerAPI.saveData(appData);
      renderDashboard();
      renderRecords();
      renderStats();
      alert('导入成功');
    }
  } else if (!result.canceled) {
    alert('导入失败：' + result.error);
  }
}
