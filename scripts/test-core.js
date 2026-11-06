/**
 * 逻辑内核自测（不依赖任何测试框架）
 * 运行：node scripts/test-core.js
 *
 * 目的：确认安卓端与桌面端共用的一套计算逻辑没有跑偏——
 * 余额、统计、CSV 编解码都按预期工作。
 */

const assert = require('assert');
const Core = require('../src/renderer/shared/ledger-core.js');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name);
    console.error('    ' + err.message);
    process.exitCode = 1;
  }
}

const sample = [
  { id: 'a', type: 'expense', amount: 25.5, category: '餐饮', note: '午餐', date: '2026-11-01', includeInBalance: true, createdAt: '2026-11-01T04:00:00.000Z' },
  { id: 'b', type: 'expense', amount: 100, category: '交通', note: '打车', date: '2026-11-02', includeInBalance: true, createdAt: '2026-11-02T04:00:00.000Z' },
  { id: 'c', type: 'income', amount: 500, category: '兼职', note: '周末', date: '2026-11-03', includeInBalance: true, createdAt: '2026-11-03T04:00:00.000Z' },
  { id: 'd', type: 'income', amount: 200, category: '其他', note: '红包', date: '2026-11-04', includeInBalance: false, createdAt: '2026-11-04T04:00:00.000Z' }
];

console.log('ledger-core 自测');

test('formatMoney 保留两位小数', () => {
  assert.strictEqual(Core.formatMoney(12), '12.00');
  assert.strictEqual(Core.formatMoney('8.456'), '8.46');
  assert.strictEqual(Core.formatMoney(undefined), '0.00');
});

test('monthKey / todayStr 格式正确', () => {
  const d = new Date(2026, 10, 6);
  assert.strictEqual(Core.monthKey(d), '2026-11');
  assert.strictEqual(Core.todayStr(d), '2026-11-06');
  assert.strictEqual(Core.monthStartStr(d), '2026-11-01');
  assert.strictEqual(Core.daysInMonth(new Date(2026, 1, 1)), 28);
});

test('lastMonths 跨年正确', () => {
  const months = Core.lastMonths(3, new Date(2026, 0, 15));
  assert.deepStrictEqual(months, ['2025-11', '2025-12', '2026-01']);
});

test('summarize 只把计入余额的收入算进余额', () => {
  const s = Core.summarize(sample);
  assert.strictEqual(s.expense, 125.5);
  assert.strictEqual(s.income, 700);
  assert.strictEqual(s.incomeInBalance, 500);
  assert.strictEqual(s.count, 4);
  assert.strictEqual(s.catSpent['餐饮'], 25.5);
  assert.strictEqual(Core.balanceOf(1000, s), 1374.5);
});

test('budgetLevel 分级', () => {
  assert.strictEqual(Core.budgetLevel(500, 1000), 'normal');
  assert.strictEqual(Core.budgetLevel(850, 1000), 'warning');
  assert.strictEqual(Core.budgetLevel(1000, 1000), 'danger');
  assert.strictEqual(Core.budgetLevel(999, 0), 'normal');
});

test('categorySummary 按金额倒序并算占比', () => {
  const { total, items } = Core.categorySummary(sample);
  assert.strictEqual(total, 125.5);
  assert.strictEqual(items[0].cat, '交通');
  assert.strictEqual(items[1].cat, '餐饮');
  assert.strictEqual(items[0].pct.toFixed(1), '79.7');
});

test('dailyTrend 只统计支出', () => {
  const daily = Core.dailyTrend(sample, 30);
  assert.strictEqual(daily[1], 25.5);
  assert.strictEqual(daily[3], 0);
  assert.strictEqual(Object.keys(daily).length, 30);
});

test('monthSums 只统计支出', () => {
  const sums = Core.monthSums(sample, ['2026-11']);
  assert.strictEqual(sums['2026-11'], 125.5);
});

test('sortRecords 搜索与倒序', () => {
  const all = Core.sortRecords(sample, '');
  assert.strictEqual(all[0].id, 'd');
  assert.strictEqual(Core.sortRecords(sample, '午餐').length, 1);
  assert.strictEqual(Core.sortRecords(sample, '餐').length, 1);
});

test('buildFullCsv 能被 parseCsv 读回来', () => {
  const csv = Core.buildFullCsv(sample);
  assert.ok(csv.charCodeAt(0) === 0xfeff, '应带 BOM');
  const parsed = Core.parseCsv(csv);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.records.length, 4);
  assert.strictEqual(parsed.records[0].type, 'expense');
  assert.strictEqual(parsed.records[0].category, '餐饮');
  assert.strictEqual(parsed.records[2].type, 'income');
  assert.strictEqual(parsed.records[0].includeInBalance, true);
});

test('parseCsv 支持引号包裹的字段并跳过坏行', () => {
  const text = 'date,type,category,amount,note,include_in_balance\n' +
    '2026-11-01,expense,"餐饮,外食",25.5,"午,餐",false\n' +
    '\n' +
    '2026-11-02,income,兼职,500,周末,true\n';
  const parsed = Core.parseCsv(text);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.records.length, 2);
  assert.strictEqual(parsed.records[0].category, '餐饮,外食');
  assert.strictEqual(parsed.records[0].includeInBalance, false);
  assert.strictEqual(parsed.records[1].includeInBalance, true);
});

test('parseCsv 缺表头时报错', () => {
  const parsed = Core.parseCsv('foo,bar\n1,2\n');
  assert.strictEqual(parsed.success, false);
});

test('buildRangeJson 带 meta', () => {
  const json = JSON.parse(Core.buildRangeJson(Core.filterByRange(sample, '2026-11-01', '2026-11-02'), { startDate: '2026-11-01', endDate: '2026-11-02' }));
  assert.strictEqual(json.records.length, 2);
  assert.strictEqual(json.meta.startDate, '2026-11-01');
});

test('normalize 补齐缺失字段', () => {
  const d = Core.normalize({ records: [{ type: 'expense', amount: '3' }] });
  assert.strictEqual(d.records[0].category, '其他');
  assert.strictEqual(d.records[0].amount, 3);
  assert.ok(d.records[0].id);
  assert.strictEqual(d.categories.length, 8);
  assert.strictEqual(d.budget.monthly, 0);
});

test('categoryBudgetRows 判断超支', () => {
  const rows = Core.categoryBudgetRows(sample, { 餐饮: 20, 交通: 200 });
  assert.strictEqual(rows[0].over, true);
  assert.strictEqual(rows[1].over, false);
  assert.strictEqual(rows[0].pct, 100);
});

console.log(`\n${passed} 项通过` + (process.exitCode ? '，存在失败项' : '，全部通过'));
