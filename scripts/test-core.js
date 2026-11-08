/**
 * 账本内核 / Markdown / AI 地址自测（不依赖测试框架）
 * 运行：node scripts/test-core.js（由 npm run test:core 统一调用）
 * AI 意图、上下文裁剪与提示词在 scripts/test-ai.js。
 */

const assert = require('assert');
const Core = require('../src/renderer/shared/ledger-core.js');
const Markdown = require('../src/renderer/shared/markdown.js');
const { createRunner } = require('./test-kit.js');
const { test, done } = createRunner();

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

// ========== 奖励系统 ==========

const mixed = sample.concat([
  { id: 'e', type: 'expense', amount: 80, category: '娱乐', note: '买游戏', date: '2026-11-05', bucket: 'reward', createdAt: '2026-11-05T04:00:00.000Z' },
  { id: 'f', type: 'expense', amount: 20, category: '餐饮', note: '奶茶', date: '2026-11-06', bucket: 'reward', createdAt: '2026-11-06T04:00:00.000Z' }
]);

test('summarize 拆分生活/奖励支出', () => {
  const s = Core.summarize(mixed);
  assert.strictEqual(s.lifeExpense, 125.5);
  assert.strictEqual(s.rewardExpense, 100);
  assert.strictEqual(s.expense, 225.5);
  // 分类汇总只统计生活支出，奖励单独一份
  assert.strictEqual(s.catSpent['娱乐'], undefined);
  assert.strictEqual(s.rewardCatSpent['娱乐'], 80);
});

test('奖励消费不影响可用余额，只扣奖励额度', () => {
  const s = Core.summarize(mixed);
  assert.strictEqual(Core.balanceOf(1000, s), 1374.5);          // 与没有奖励消费时一致
  assert.strictEqual(Core.rewardBalanceOf(150, s), 50);
  assert.strictEqual(Core.rewardBalanceOf(60, s), -40);
  assert.strictEqual(Core.rewardUsedPct(200, s), 50);
  assert.strictEqual(Core.rewardUsedPct(0, s), 0);
});

test('bucket 默认 life，老数据不炸', () => {
  const d = Core.normalize({ records: [{ type: 'expense', amount: 10, category: '餐饮' }] });
  assert.strictEqual(d.records[0].bucket, 'life');
  assert.strictEqual(d.reward.monthly, 0);
  assert.strictEqual(Core.isReward(d.records[0]), false);
  assert.strictEqual(Core.bucketLabel({ type: 'expense', bucket: 'reward' }), '奖励');
});

test('收入永远算生活账户', () => {
  assert.strictEqual(Core.isReward({ type: 'income', bucket: 'reward' }), false);
});

test('CSV 账户列能往返', () => {
  const csv = Core.buildFullCsv(mixed);
  const parsed = Core.parseCsv(csv);
  assert.strictEqual(parsed.success, true);
  const rewardRows = parsed.records.filter(r => r.bucket === 'reward');
  assert.strictEqual(rewardRows.length, 2);
  assert.strictEqual(parsed.records.find(r => r.id && r.note === '午餐').bucket, 'life');
});

test('CSV 没有账户列时按生活导入（向后兼容）', () => {
  const parsed = Core.parseCsv('date,type,category,amount,note\n2026-11-01,expense,餐饮,10,午饭\n');
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.records[0].bucket, 'life');
});

test('normalizeDate 统一斜杠 / 点 / 中文 / ISO 时间写法', () => {
  assert.strictEqual(Core.normalizeDate('2026/11/8'), '2026-11-08');
  assert.strictEqual(Core.normalizeDate('2026.11.8'), '2026-11-08');
  assert.strictEqual(Core.normalizeDate('2026年11月8日'), '2026-11-08');
  assert.strictEqual(Core.normalizeDate('2026-11-08 00:00:00'), '2026-11-08');
  assert.strictEqual(Core.normalizeDate(' 2026-11-8 '), '2026-11-08');
  assert.strictEqual(Core.normalizeDate('不是日期'), '不是日期');
  assert.strictEqual(Core.normalizeDate(''), '');
});

test('Excel 另存的斜杠日期 CSV 导入后仍能进月度统计', () => {
  // Numbers / Excel 另存会去掉 BOM、改成 CRLF、把日期写成 2026/11/8
  const excelCsv = '日期,类型,分类,金额,备注,账户\r\n2026/11/8,支出,餐饮,12,晚餐,生活\r\n2026/11/1,支出,娱乐,147.22,自助,奖励\r\n';
  const parsed = Core.parseCsv(excelCsv);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.records.length, 2);
  assert.deepStrictEqual(parsed.records.map(r => r.date), ['2026-11-08', '2026-11-01']);
  assert.strictEqual(parsed.records[1].bucket, 'reward');
  assert.strictEqual(Core.filterByMonth(parsed.records, '2026-11').length, 2);
  assert.strictEqual(Core.filterByRange(parsed.records, '2026-11-01', '2026-11-30').length, 2);
});

test('启动时 normalize 会修正历史数据里已存坏的日期', () => {
  const fixed = Core.normalize({ records: [{ date: '2026/11/8', type: 'expense', amount: 10 }] });
  assert.strictEqual(fixed.records[0].date, '2026-11-08');
  assert.strictEqual(Core.filterByMonth(fixed.records, '2026-11').length, 1);
});

test('sortRecords 支持按账户筛选', () => {
  assert.strictEqual(Core.sortRecords(mixed, '', 'reward').length, 2);
  assert.strictEqual(Core.sortRecords(mixed, '', 'life').length, 4);
  assert.strictEqual(Core.sortRecords(mixed, '').length, 6);
  // 收入只在生活里
  assert.ok(Core.sortRecords(mixed, '', 'life').every(r => r.type === 'income' || !Core.isReward(r)));
});

test('流水时间以记账日期为准，不是创建时间', () => {
  const d = new Date();
  assert.strictEqual(Core.formatRecordTime({ date: Core.todayStr(d), createdAt: d.toISOString() }).indexOf('今天'), 0);
  assert.strictEqual(Core.formatRecordTime({ date: '2026-11-01', createdAt: '2026-11-08T04:00:00.000Z' }), '11-01');
  assert.strictEqual(Core.formatRecordTime({ date: '2026-11-01' }), '11-01');
});

test('AI 地址：只填 base 时自动补 chat/completions', () => {
  assert.strictEqual(
    Core.normalizeAiEndpoint('https://open.bigmodel.cn/api/paas/v4'),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  );
  assert.strictEqual(
    Core.normalizeAiEndpoint('https://api.deepseek.com/v1'),
    'https://api.deepseek.com/v1/chat/completions'
  );
});

test('AI 地址：完整端点不重复拼接，尾部斜杠与空格被清理', () => {
  assert.strictEqual(
    Core.normalizeAiEndpoint('  https://api.deepseek.com/v1/chat/completions/  '),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.strictEqual(
    Core.normalizeAiEndpoint('https://open.bigmodel.cn/api/paas/v4/'),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  );
});

test('AI 地址：漏写协议时补 https，空配置保持为空', () => {
  assert.strictEqual(
    Core.normalizeAiEndpoint('api.openai.com/v1'),
    'https://api.openai.com/v1/chat/completions'
  );
  assert.strictEqual(Core.normalizeAiEndpoint('   '), '');
  assert.strictEqual(Core.normalizeAiEndpoint(null), '');
});

test('AI 错误：提取各家不同的错误字段', () => {
  assert.ok(Core.formatAiError(401, '{"error":{"message":"Invalid API Key","code":"401"}}').includes('Invalid API Key'));
  assert.ok(Core.formatAiError(400, { error: { code: '1210' } }).includes('1210'));
  assert.ok(Core.formatAiError(429, { msg: '余额不足' }).includes('余额不足'));
});

test('AI 错误：非 JSON 响应给出报文片段，空响应给出兜底提示', () => {
  assert.ok(Core.formatAiError(404, '<html><body>404 Not Found</body></html>').includes('404 Not Found'));
  assert.ok(Core.formatAiError(401, '').includes('请检查接口地址'));
});

// ---------- Markdown 渲染（AI 回复，两端共用） ----------

test('Markdown：标题、粗体、斜体、删除线', () => {
  const html = Markdown.renderMarkdown('## 概览\n\n**餐饮**花费 *300* 元，~~原计划 200~~');
  assert.ok(html.includes('<h2>概览</h2>'));
  assert.ok(html.includes('<strong>餐饮</strong>'));
  assert.ok(html.includes('<em>300</em>'));
  assert.ok(html.includes('<del>原计划 200</del>'));
});

test('Markdown：有序/无序列表、嵌套、引用与分割线', () => {
  const html = Markdown.renderMarkdown('- 餐饮\n- 交通\n  - 地铁\n\n1. 第一步\n\n> 建议\n\n---');
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('class="md-nested"'));
  assert.ok(html.includes('<blockquote>建议</blockquote>'));
  assert.ok(html.includes('<hr>'));
});

test('Markdown：表格含对齐与多行', () => {
  const html = Markdown.renderMarkdown('| 分类 | 金额 |\n| --- | ---: |\n| 餐饮 | 300 |\n| 交通 | 120 |');
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('text-align:right'));
  assert.strictEqual((html.match(/<tr>/g) || []).length, 3);
});

test('Markdown：围栏代码块与行内代码只转义、不二次解析', () => {
  const html = Markdown.renderMarkdown('`**不是粗体**`\n\n```js\nconst x = 1 < 2;\n```');
  assert.ok(html.includes('<code class="md-code">**不是粗体**</code>'));
  assert.ok(html.includes('&lt;'));
  assert.ok(!html.includes('<strong>不是粗体</strong>'));
  assert.ok(html.includes('<span class="md-lang">js</span>'));
});

test('Markdown：原始 HTML 被转义，绝不产生可执行脚本', () => {
  const html = Markdown.renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('Markdown：链接只显示文本、图片不加载，不产生外链与外发请求', () => {
  const html = Markdown.renderMarkdown('[官网](https://example.com) ![图](https://example.com/a.png)');
  assert.ok(html.includes('官网'));
  assert.ok(html.includes('[图片：图]'));
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('<img'));
});

test('Markdown：空值与纯文本输入不报错', () => {
  assert.strictEqual(Markdown.renderMarkdown(''), '');
  assert.strictEqual(Markdown.renderMarkdown(null), '');
  assert.strictEqual(Markdown.renderMarkdown(undefined), '');
  assert.strictEqual(Markdown.renderMarkdown('普通一行'), '<p>普通一行</p>');
  assert.strictEqual(Markdown.escapeHtml('a&b<c>'), 'a&amp;b&lt;c&gt;');
});

done('账本内核 / Markdown / AI 地址');
