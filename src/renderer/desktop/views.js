/**
 * 桌面端 · 导航、看板与流水列表渲染
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
// ========== 导航 ==========
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.page).classList.add('active');
  });
});

// ========== 看板渲染 ==========
function renderDashboard() {
  const records = getCurrentMonthRecords();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const daysLeft = daysInMonth - today + 1;

  document.getElementById('monthLabel').textContent = `${month+1}月`;
  document.getElementById('rewardMonthLabel').textContent = `${month+1}月`;

  const summary = summarize(records);

  const budget = Number(appData.budget.monthly) || 0;
  const balance = budget + summary.incomeInBalance - summary.lifeExpense;

  document.getElementById('balanceAmount').textContent = formatMoney(Math.max(balance, 0));
  document.getElementById('budgetTotal').textContent = formatMoney(budget);
  document.getElementById('spentTotal').textContent = formatMoney(summary.lifeExpense);
  document.getElementById('daysLeft').textContent = daysLeft;
  document.getElementById('dailyAvg').textContent = formatMoney(balance > 0 ? balance / daysLeft : 0);

  document.getElementById('monthExpense').textContent = formatMoney(summary.lifeExpense);
  document.getElementById('monthReward').textContent = formatMoney(summary.rewardExpense);
  document.getElementById('monthIncome').textContent = formatMoney(summary.income);
  document.getElementById('monthCount').textContent = records.length;

  // 余额卡片颜色（只看生活支出）
  const card = document.getElementById('balanceCard');
  card.classList.remove('warning', 'danger');
  const ratio = budget > 0 ? summary.lifeExpense / budget : 0;
  if (ratio >= 1) card.classList.add('danger');
  else if (ratio >= 0.8) card.classList.add('warning');

  renderRewardCard(summary, daysLeft);
  renderCatBudgetOverview();
}

/** 奖励额度卡：独立的池子，只受奖励消费影响 */
function renderRewardCard(summary, daysLeft) {
  const cap = Number(appData.reward && appData.reward.monthly) || 0;
  const spent = summary.rewardExpense;
  const left = cap - spent;
  const card = document.getElementById('rewardCard');
  const fill = document.getElementById('rewardFill');
  const hint = document.getElementById('rewardHint');

  card.classList.remove('over', 'idle');
  document.getElementById('rewardTotal').textContent = formatMoney(cap);
  document.getElementById('rewardSpent').textContent = formatMoney(spent);
  document.getElementById('rewardLeft').textContent = formatMoney(Math.max(left, 0));
  document.getElementById('rewardDailyAvg').textContent = formatMoney(left > 0 ? left / Math.max(daysLeft, 1) : 0);

  if (!cap) {
    card.classList.add('idle');
    fill.style.width = '0%';
    document.getElementById('rewardTag').textContent = '未设置';
    hint.textContent = '还没设奖励额度，去「设置 → 预算设置」填一个吧';
    return;
  }

  const pct = Math.min((spent / cap) * 100, 100);
  fill.style.width = pct + '%';
  document.getElementById('rewardTag').textContent = left < 0 ? '已超额' : '奖励自己';
  if (left < 0) card.classList.add('over');
  hint.textContent = left < 0
    ? `奖励额度超了 ¥${formatMoney(Math.abs(left))}，下个月再补回来`
    : `奖励消费只扣这份额度，不影响生活余额（已用 ${pct.toFixed(0)}%）`;
}

function renderCatBudgetOverview() {
  const records = getCurrentMonthRecords();
  const container = document.getElementById('catBudgetList');
  container.innerHTML = '';

  const catSpent = {};
  records.filter(record => record.type === 'expense' && !isReward(record)).forEach(record => {
    catSpent[record.category] = (catSpent[record.category] || 0) + record.amount;
  });

  const budgets = appData.budget.categories || {};
  const cats = Object.keys(budgets);
  if (!cats.length) {
    container.innerHTML = '<div style="color:#86868b;font-size:13px;">暂无分类预算，去设置页配置</div>';
    return;
  }

  cats.forEach(category => {
    const spent = catSpent[category] || 0;
    const budget = budgets[category];
    const pct = budget > 0 ? Math.min(spent / budget * 100, 100) : 0;
    const over = spent > budget;
    const color = over ? '#ff3b30' : pct > 80 ? '#ff9500' : '#34c759';

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">${category}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <div class="bar-value">¥${formatMoney(spent)}/${formatMoney(budget)}</div>
    `;
    container.appendChild(row);
  });
}

// ========== 流水列表 ==========
let currentFilteredRecords = [];
let renderPage = 1;
const PAGE_SIZE = 20;

function getSortedFilteredRecords() {
  const keyword = document.getElementById('searchInput').value.toLowerCase();
  return [...appData.records]
    .filter(record => {
      if (recordFilter === 'life' && isReward(record)) return false;
      if (recordFilter === 'reward' && !isReward(record)) return false;
      if (!keyword) return true;
      return (record.note && record.note.toLowerCase().includes(keyword)) ||
             (record.category && record.category.toLowerCase().includes(keyword));
    })
    .sort((firstRecord, secondRecord) => {
      // 优先按 createdAt 时间戳倒序，旧数据没有 createdAt 就按 date 排序
      const firstTimestamp = firstRecord.createdAt || firstRecord.date;
      const secondTimestamp = secondRecord.createdAt || secondRecord.date;
      return String(secondTimestamp).localeCompare(String(firstTimestamp));
    });
}

function setRecordFilter(filter) {
  recordFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  renderRecords();
}

// 列表时间统一由共享内核的 formatRecordTime 提供（见顶部别名绑定）。

function renderRecords() {
  currentFilteredRecords = getSortedFilteredRecords();
  renderPage = 1;
  const list = document.getElementById('recordList');

  if (!currentFilteredRecords.length) {
    const tip = recordFilter === 'reward'
      ? '还没有奖励消费记录，记一笔时选「奖励消费」'
      : recordFilter === 'life'
        ? '还没有生活消费记录'
        : '还没有记录，去记一笔吧';
    list.innerHTML = `<div class="empty">${tip}</div>`;
    return;
  }

  renderRecordPage();
}

function renderRecordPage() {
  const list = document.getElementById('recordList');
  const catIcons = {'餐饮':'🍜','交通':'🚗','购物':'🛍️','娱乐':'🎮','居住':'🏠','医疗':'💊','教育':'📚','其他':'📦'};

  const start = 0;
  const end = renderPage * PAGE_SIZE;
  const pageRecords = currentFilteredRecords.slice(start, end);

  const html = pageRecords.map(record => `
    <div class="record-item">
      <div class="record-icon">${catIcons[record.category] || '📦'}</div>
      <div class="record-info">
        <div class="record-cat">${record.category}${isReward(record) ? '<span class="record-badge">奖励</span>' : ''}</div>
        <div class="record-note">${record.note || '—'}</div>
      </div>
      <div class="record-date">${formatRecordTime(record)}</div>
      <div class="record-amount ${record.type}">${record.type === 'expense' ? '-' : '+'}¥${formatMoney(record.amount)}</div>
      <div class="record-actions">
        <button onclick="editRecord('${record.id}')">编辑</button>
        <button onclick="deleteRecord('${record.id}')">删除</button>
      </div>
    </div>
  `).join('');

  // 还有更多就加个提示
  const hasMore = end < currentFilteredRecords.length;
  const loadMoreHtml = hasMore
    ? `<div style="text-align:center;padding:12px;color:#86868b;font-size:13px;">下拉加载更多（已显示 ${end}/${currentFilteredRecords.length} 条）</div>`
    : `<div style="text-align:center;padding:12px;color:#c7c7cc;font-size:12px;">— 已经到底了 —</div>`;

  list.innerHTML = html + loadMoreHtml;
}

// 滚动到底部加载更多（.main 才是真正滚动容器）
document.querySelector('.main').addEventListener('scroll', function() {
  if (!document.getElementById('page-records').classList.contains('active')) return;
  const element = this;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 80) {
    const end = renderPage * PAGE_SIZE;
    if (end < currentFilteredRecords.length) {
      renderPage++;
      renderRecordPage();
    }
  }
});
