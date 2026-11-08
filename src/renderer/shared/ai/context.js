/**
 * AI 账本上下文构造（依赖 ledger-core 与 intent，纯函数）
 *
 * 关键设计：**按意图物理裁剪**。只把用户问到的那套账的数字放进上下文，
 * 连按月汇总、累计、分类支出都一起裁剪。模型看不到另一套的金额，
 * 就不存在「把奖励消费算进生活消费」的可能，而不是靠提示词求它别这么做。
 *
 * 加载：
 *   浏览器经典脚本 → window.ZinsightAI.context（须在 core / intent 之后、index.js 之前）
 *   CommonJS / ESM → module.exports / 默认导出
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../ledger-core.js'), require('./intent.js'));
  } else {
    root.ZinsightAI = root.ZinsightAI || {};
    root.ZinsightAI.context = factory(root.LedgerCore, root.ZinsightAI.intent);
  }
})(typeof self !== 'undefined' ? self : this, function (Core, Intent) {
  'use strict';

  const LIFE = '生活消费';
  const REWARD = '奖励消费';

  function round2(number) {
    const value = Number(number);
    return Math.round((isFinite(value) ? value : 0) * 100) / 100;
  }

  function amountMap(src) {
    const out = {};
    Object.keys(src || {}).forEach(key => { out[key] = round2(src[key]); });
    return out;
  }

  /** 备注是用户自由文本，清洗控制字符并限长，避免被模型当成换行指令 */
  function cleanNote(text) {
    return String(text == null ? '' : text)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  function toDetail(record, label) {
    return {
      日期: record.date,
      类型: record.type === 'income' ? '收入' : '支出',
      分类: record.category,
      金额: round2(record.amount),
      备注: cleanNote(record.note),
      所属账本: label
    };
  }

  /** 明细按日期升序；超长截断，但汇总数字始终覆盖全部记录 */
  function detailBlock(records, label, limit) {
    const sorted = records.slice().sort((firstRecord, secondRecord) => String(firstRecord.date).localeCompare(String(secondRecord.date)));
    const shown = sorted.slice(0, limit).map(record => toDetail(record, label));
    const block = { 当月笔数: records.length, 当月明细: shown };
    if (records.length > shown.length) {
      block.明细说明 = `明细仅列出前 ${shown.length} 条（共 ${records.length} 条）；各项汇总数字已包含全部记录`;
    }
    return block;
  }

  /** 按月 × 分类的支出，用于「上个月餐饮花了多少」这类跨月分类问题 */
  function categoryByMonth(records, months, wantReward) {
    const out = {};
    months.forEach(month => {
      const map = {};
      Core.filterByMonth(records, month).forEach(record => {
        if (record.type !== 'expense' || Core.isReward(record) !== wantReward) return;
        map[record.category] = (map[record.category] || 0) + (Number(record.amount) || 0);
      });
      if (Object.keys(map).length) out[month] = amountMap(map);
    });
    return out;
  }

  function monthList(records, intent) {
    const set = {};
    records.forEach(record => { if (record.date) set[record.date.slice(0, 7)] = true; });
    let months = Object.keys(set).sort();
    if (intent.range === 'recent' && intent.monthsBack > 0) months = months.slice(-intent.monthsBack);
    return months;
  }

  function lastMonthKey(now) {
    return Core.monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  }

  /**
   * @param {Object} rawData 账本（先经 Core.normalize 补齐老数据缺失的 bucket）
   * @param {Object} [options] { now, intent, message, previousScope, maxRecords }
   */
  function buildAiContext(rawData, options) {
    const rawOptions = options || {};
    // 没有提问时给完整账本（调试 / 测试用）；裁剪只在明确知道用户问什么时发生。
    const intent = rawOptions.intent || (rawOptions.message
      ? Intent.detectAiIntent(rawOptions.message, rawOptions.previousScope)
      : {
          scope: Intent.SCOPE_BOTH, range: 'month', monthsBack: 0,
          label: Intent.scopeLabel(Intent.SCOPE_BOTH),
          note: '未提供具体问题，这里给出完整账本两套数据'
        });
    const data = Core.normalize(rawData);
    const now = rawOptions.now ? new Date(rawOptions.now) : new Date();
    const currentMonth = Core.monthKey(now);
    const month = intent.range === 'lastMonth' ? lastMonthKey(now) : currentMonth;
    const historical = month !== currentMonth;
    const limit = Number(rawOptions.maxRecords) > 0 ? Math.floor(Number(rawOptions.maxRecords)) : 200;

    const all = data.records;
    const monthRecords = Core.filterByMonth(all, month);
    const lifeRecords = monthRecords.filter(record => !Core.isReward(record));
    const rewardRecords = monthRecords.filter(Core.isReward);
    const sum = Core.summarize(monthRecords);
    const budget = Number(data.budget && data.budget.monthly) || 0;
    const rewardCap = Number(data.reward && data.reward.monthly) || 0;
    const months = monthList(all, intent);

    const HISTORICAL_NOTE = '历史月份不适用当前预算与额度设置，本次不提供余额';
    const life = Object.assign({
      说明: '日常开销，扣减月度预算与可用余额；用户未提「奖励」时默认回答这一套',
      月度预算: round2(budget),
      分类预算: amountMap(data.budget && data.budget.categories),
      当月支出: round2(sum.lifeExpense),
      当月收入: round2(sum.income),
      计入余额的收入: round2(sum.incomeInBalance),
      可用余额: historical ? null : round2(Core.balanceOf(budget, sum)),
      分类支出: amountMap(sum.catSpent)
    }, detailBlock(lifeRecords, LIFE, limit));

    const reward = Object.assign({
      说明: '用户奖励自己的独立消费池，按月重置，绝不计入生活支出、生活预算或可用余额',
      每月奖励额度: round2(rewardCap),
      额度设置: rewardCap > 0 ? '已设置' : '未设置（额度为 0，不要据此判断超支）',
      当月已用: round2(sum.rewardExpense),
      剩余奖励额度: (historical || rewardCap <= 0) ? null : round2(Core.rewardBalanceOf(rewardCap, sum)),
      分类支出: amountMap(sum.rewardCatSpent)
    }, detailBlock(rewardRecords, REWARD, limit));

    const ctx = {
      统计月份: month,
      本次回答范围: {
        账本: intent.label,
        时间范围: Intent.rangeLabel(intent.range, intent.monthsBack),
        说明: intent.note
      },
      预算适用范围: currentMonth + '（预算 / 奖励额度是当前设置值，只对这一月有效，不要套用到历史月份）',
      数据状态: monthRecords.length
        ? '统计月份有 ' + monthRecords.length + ' 条记录'
        : '统计月份没有记录，请如实说明，不要臆测消费',
      口径提醒: [
        '生活消费与奖励消费是两套独立账本，金额不得互相计入，也不得默认相加',
        '「当月支出」是生活支出，不含奖励消费；「当月已用」才是奖励消费',
        '本次上下文已按问题裁剪：未出现的账本不要臆造，也不要引用历史消息里的旧数字'
      ]
    };

    const showLife = intent.scope !== Intent.SCOPE_REWARD;
    const showReward = intent.scope !== Intent.SCOPE_LIFE;
    if (showLife) ctx[LIFE] = life;
    if (showReward) ctx[REWARD] = reward;
    if (intent.scope === Intent.SCOPE_BOTH) {
      ctx['两套合计（仅在用户明确要求合计时引用）'] = {
        生活支出: round2(sum.lifeExpense),
        奖励支出: round2(sum.rewardExpense),
        两套相加: round2(sum.lifeExpense + sum.rewardExpense)
      };
    }
    if (intent.scope !== Intent.SCOPE_BOTH) {
      ctx['未提供的账本'] = intent.scope === Intent.SCOPE_LIFE
        ? '奖励消费已省略（问题未要求）；如需分析请明确提到「奖励」'
        : '生活消费已省略（问题未要求）；如需分析请明确说明';
    }

    // 所有趋势 / 累计数字同样按范围裁剪，避免另一套账从汇总里漏进来
    const trend = { 月份: months };
    if (showLife) {
      trend.生活支出 = amountMap(Core.monthSums(all, months, Core.BUCKET_LIFE));
      trend.生活分类支出 = categoryByMonth(all, months, false);
    }
    if (showReward) {
      trend.奖励支出 = amountMap(Core.monthSums(all, months, Core.BUCKET_REWARD));
      trend.奖励分类支出 = categoryByMonth(all, months, true);
    }
    ctx['按月汇总'] = trend;

    const lifetime = Core.summarize(all);
    const total = { 记录总数: all.length };
    if (showLife) {
      total.生活支出累计 = round2(lifetime.lifeExpense);
      total.收入累计 = round2(lifetime.income);
    }
    if (showReward) total.奖励支出累计 = round2(lifetime.rewardExpense);
    ctx['账本概况'] = Object.assign(total, {
      明细范围: '逐条明细只含统计月份 ' + month + '；跨月请使用「按月汇总」',
      余额说明: historical ? HISTORICAL_NOTE : '可用余额与剩余额度只适用于统计月份'
    });

    return ctx;
  }

  return { LIFE, REWARD, buildAiContext, cleanNote };
});
