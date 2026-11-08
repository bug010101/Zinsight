/**
 * AI 提问意图识别（零依赖纯函数）
 *
 * 目的：不靠模型「自觉」区分两套账，而是在发请求前判断用户问的是哪一套，
 * 让上下文里只出现相关账本的数字。也处理「不算奖励」「另一套呢」这类
 * 容易误判的说法，以及跨月 / 全时间范围的问题。
 *
 * 加载：
 *   浏览器经典脚本 → window.ZinsightAI.intent（须先于 index.js 加载）
 *   CommonJS / ESM → module.exports / 默认导出
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ZinsightAI = root.ZinsightAI || {}; root.ZinsightAI.intent = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCOPE_LIFE = 'life';
  const SCOPE_REWARD = 'reward';
  const SCOPE_BOTH = 'both';

  const RE = {
    reward: /奖励|犒劳|奖赏|赏自己|额度池/,
    life: /生活|日常|正常开销|普通消费/,
    // 「不含奖励」「除了奖励」仍是生活口径，不能因为出现「奖励」就切到奖励账
    exclude: /不含|不算|不包括|不包含|不计|除了|排除|去掉|剔除|抛开/,
    // 只有明确要求两套一起时才给 both；「总共 / 一共」不算，避免默认相加
    both: /两套|两本|两账户|加起来|加上奖励|包含奖励|奖励也算|分别|对比|一起算|生活.{0,6}奖励|奖励.{0,6}生活/,
    another: /另一套|另一个|另一本|换一套/,
    total: /总共|一共|合计|总计|整体/,
    lastMonth: /上个?月|上月/,
    allTime: /今年|全年|累计|历史|所有记录|全部记录|这半年|上半年|去年/,
    recent: /近([一二三四五六七八九十0-9]+)个?月/
  };

  const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  function toNumber(text) {
    const raw = String(text || '').trim();
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    if (CN_NUM[raw]) return CN_NUM[raw];
    // 「十二」这类组合数字
    const match = raw.match(/^十([一二三四五六七八九])$/);
    if (match) return 10 + CN_NUM[match[1]];
    return 0;
  }

  function scopeLabel(scope) {
    if (scope === SCOPE_REWARD) return '奖励消费';
    if (scope === SCOPE_BOTH) return '生活消费 + 奖励消费';
    return '生活消费';
  }

  function rangeLabel(range, monthsBack) {
    if (range === 'lastMonth') return '上个月';
    if (range === 'recent') return '最近 ' + monthsBack + ' 个月';
    if (range === 'all') return '全部有记录的月份';
    return '本月';
  }

  /**
   * @param {string} message 用户问题
   * @param {string} [previousScope] 上一轮意图，用于「另一套呢」这类追问
   */
  function detectAiIntent(message, previousScope) {
    const text = String(message == null ? '' : message).trim();
    const hasReward = RE.reward.test(text);
    const hasLife = RE.life.test(text);
    const excluded = RE.exclude.test(text);

    let scope = SCOPE_LIFE;
    if (RE.another.test(text) && previousScope && previousScope !== SCOPE_BOTH) {
      scope = previousScope === SCOPE_LIFE ? SCOPE_REWARD : SCOPE_LIFE;
    } else if (hasReward && excluded) {
      scope = SCOPE_LIFE;
    } else if (RE.both.test(text) || (hasLife && hasReward)) {
      scope = SCOPE_BOTH;
    } else if (hasReward) {
      scope = SCOPE_REWARD;
    }

    let range = 'month';
    let monthsBack = 0;
    const recent = text.match(RE.recent);
    if (RE.lastMonth.test(text)) {
      range = 'lastMonth';
    } else if (recent && toNumber(recent[1]) > 0) {
      range = 'recent';
      monthsBack = Math.min(toNumber(recent[1]), 24);
    } else if (RE.allTime.test(text)) {
      range = 'all';
    }

    const wantsTotal = RE.total.test(text);
    return {
      scope,
      range,
      monthsBack,
      wantsTotal,
      label: scopeLabel(scope),
      note: '本次只提供「' + scopeLabel(scope) + '」的数据（' + rangeLabel(range, monthsBack)
        + '）；未出现的账本是刻意省略的，严禁臆造或混算。'
    };
  }

  return {
    SCOPE_LIFE, SCOPE_REWARD, SCOPE_BOTH,
    detectAiIntent, scopeLabel, rangeLabel
  };
});
