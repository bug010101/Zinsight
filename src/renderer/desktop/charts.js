/**
 * 桌面端 · 统计页图表
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
// ========== 统计页 ==========
function renderStats() {
  renderCategoryChart();
  renderTrendChart();
  renderMonthCompare();
  renderRewardCategoryChart();
}

const CHART_COLORS = ['#0071e3','#34c759','#ff9500','#ff3b30','#af52de','#5ac8fa','#ff2d55','#8e8e93'];

function renderCategoryChart() {
  const records = getCurrentMonthRecords().filter(record => record.type === 'expense' && !isReward(record));
  const container = document.getElementById('categoryChart');

  if (!records.length) {
    container.innerHTML = '<div class="empty">本月暂无生活支出记录</div>';
    return;
  }

  const catSum = {};
  let total = 0;
  records.forEach(record => {
    catSum[record.category] = (catSum[record.category] || 0) + record.amount;
    total += record.amount;
  });

  const sorted = Object.entries(catSum).sort((firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]);

  container.innerHTML = sorted.map(([category, sum], index) => {
    const pct = (sum / total * 100).toFixed(1);
    return `
      <div class="bar-row">
        <div class="bar-label">${category}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${CHART_COLORS[index % CHART_COLORS.length]};"></div></div>
        <div class="bar-value">¥${formatMoney(sum)} (${pct}%)</div>
      </div>
    `;
  }).join('');
}

function renderRewardCategoryChart() {
  const container = document.getElementById('rewardCategoryChart');
  const records = getCurrentMonthRecords().filter(record => record.type === 'expense' && isReward(record));

  if (!records.length) {
    container.innerHTML = '<div class="empty">本月还没有奖励消费，记一笔选「奖励消费」试试</div>';
    return;
  }

  const catSum = {};
  let total = 0;
  records.forEach(record => {
    catSum[record.category] = (catSum[record.category] || 0) + record.amount;
    total += record.amount;
  });

  const sorted = Object.entries(catSum).sort((firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]);

  container.innerHTML = sorted.map(([category, sum], index) => {
    const pct = (sum / total * 100).toFixed(1);
    return `
      <div class="bar-row">
        <div class="bar-label">${category}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${['#6f3fd4','#9d72ff','#c084fc','#e879f9'][index % 4]};"></div></div>
        <div class="bar-value">¥${formatMoney(sum)} (${pct}%)</div>
      </div>
    `;
  }).join('');
}

function renderTrendChart() {
  const records = getCurrentMonthRecords().filter(record => record.type === 'expense' && !isReward(record));
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const daily = {};
  for (let index = 1; index <= daysInMonth; index++) daily[index] = 0;
  records.forEach(record => {
    const day = parseInt(record.date.slice(8, 10));
    if (day >= 1 && day <= daysInMonth) daily[day] += record.amount;
  });

  const max = Math.max(...Object.values(daily), 1);
  const container = document.getElementById('trendChart');
  container.innerHTML = '';

  for (let day = 1; day <= daysInMonth; day++) {
    const amount = daily[day];
    const height = amount > 0 ? Math.max(amount / max * 100, 3) : 2;
    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    bar.style.height = height + '%';
    bar.innerHTML = `<div class="tip">${day}日: ¥${formatMoney(amount)}</div>`;
    container.appendChild(bar);
  }
}

function renderMonthCompare() {
  // 近6个月
  const now = new Date();
  const months = [];
  for (let index = 5; index >= 0; index--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push(`${monthDate.getFullYear()}-${String(monthDate.getMonth()+1).padStart(2,'0')}`);
  }

  const monthSum = {};
  months.forEach(month => {
    monthSum[month] = appData.records
      .filter(record => record.type === 'expense' && !isReward(record) && record.date && record.date.startsWith(month))
      .reduce((total, record) => total + record.amount, 0);
  });

  const max = Math.max(...Object.values(monthSum), 1);
  const container = document.getElementById('monthCompareChart');
  container.innerHTML = months.map(month => {
    const sum = monthSum[month];
    const pct = sum / max * 100;
    const [, mon] = month.split('-');
    return `
      <div class="bar-row">
        <div class="bar-label">${parseInt(mon)}月</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#0071e3;"></div></div>
        <div class="bar-value">¥${formatMoney(sum)}</div>
      </div>
    `;
  }).join('');
}
