/**
 * 账本逻辑内核（桌面端 / 安卓端共用）
 *
 * 这里只放「纯逻辑」：不碰 DOM、不碰文件系统、不碰平台 API。
 * 桌面端 index.html 里的计算逻辑与这里一一对应，安卓端直接复用，
 * 保证两端算出来的余额、统计、CSV 完全一致。
 *
 * 兼容三种加载方式：
 *   - 浏览器 <script>：window.LedgerCore
 *   - CommonJS（Node / esbuild 打包）：module.exports
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LedgerCore = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 默认分类（与桌面端保持一致） */
  const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '教育', '其他'];

  /** 分类对应的小图标 */
  const CATEGORY_ICONS = {
    餐饮: '🍜', 交通: '🚗', 购物: '🛍️', 娱乐: '🎮',
    居住: '🏠', 医疗: '💊', 教育: '📚', 其他: '📦'
  };

  const BOM = '\uFEFF';

  /**
   * 消费归属（账户）
   *   life   —— 生活消费，走月度预算，影响可用余额
   *   reward —— 奖励消费，走单独的奖励额度，不影响可用余额
   * 默认永远是 life，老数据没有这个字段也按 life 处理。
   */
  const BUCKET_LIFE = 'life';
  const BUCKET_REWARD = 'reward';
  const BUCKET_LABEL = { life: '生活', reward: '奖励' };

  // ========== 日期 ==========

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** 2026-11-06 */
  function todayStr(d) {
    const date = d || new Date();
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  /** 2026-11 */
  function monthKey(d) {
    const date = d || new Date();
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  /** 2026-11-01 */
  function monthStartStr(d) {
    return monthKey(d) + '-01';
  }

  function daysInMonth(d) {
    const date = d || new Date();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  /** 最近 n 个月，返回 ['2026-06', ..., '2026-11'] */
  function lastMonths(n, d) {
    const date = d || new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      out.push(monthKey(new Date(date.getFullYear(), date.getMonth() - i, 1)));
    }
    return out;
  }

  // ========== 基础工具 ==========

  function formatMoney(n) {
    const v = Number(n);
    return (isFinite(v) ? v : 0).toFixed(2);
  }

  function uid(prefix) {
    return `${prefix || 'rec'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function catIcon(cat) {
    return CATEGORY_ICONS[cat] || '📦';
  }

  /** 默认账本数据 */
  function defaultData() {
    return {
      records: [],
      budget: { monthly: 1000, categories: {} },
      // 奖励额度：每月 1 号自动恢复；0 表示还没设置
      reward: { monthly: 0 },
      categories: DEFAULT_CATEGORIES.slice(),
      createdAt: new Date().toISOString()
    };
  }

  /** 默认配置 */
  function defaultConfig() {
    return {
      ai: { apiKey: '', baseUrl: '', model: '' },
      settings: { includeIncomeInBalance: true }
    };
  }

  /** 补齐老数据缺失的字段，避免渲染时炸掉 */
  function normalize(data) {
    const d = data && typeof data === 'object' ? data : {};
    const base = defaultData();
    return {
      records: Array.isArray(d.records) ? d.records.map(normalizeRecord) : [],
      budget: {
        monthly: Number(d.budget && d.budget.monthly) || 0,
        categories: (d.budget && d.budget.categories) || {}
      },
      reward: {
        monthly: Number(d.reward && d.reward.monthly) || 0
      },
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories.slice() : base.categories,
      createdAt: d.createdAt || base.createdAt
    };
  }

  function normalizeRecord(r) {
    const rec = r || {};
    return {
      id: rec.id != null ? rec.id : uid(),
      type: rec.type === 'income' ? 'income' : 'expense',
      amount: Number(rec.amount) || 0,
      category: rec.category || '其他',
      note: rec.note || '',
      date: rec.date || todayStr(),
      bucket: rec.bucket === BUCKET_REWARD ? BUCKET_REWARD : BUCKET_LIFE,
      includeInBalance: rec.includeInBalance !== false,
      createdAt: rec.createdAt || new Date().toISOString()
    };
  }

  /** 这条记录算不算奖励消费（收入永远是生活账户） */
  function isReward(r) {
    return !!r && r.type === 'expense' && r.bucket === BUCKET_REWARD;
  }

  function bucketOf(r) {
    return isReward(r) ? BUCKET_REWARD : BUCKET_LIFE;
  }

  function bucketLabel(r) {
    return BUCKET_LABEL[bucketOf(r)] || BUCKET_LABEL.life;
  }

  // ========== 统计 ==========

  /** 指定月份的记录 */
  function filterByMonth(records, key) {
    return records.filter(r => r.date && r.date.startsWith(key));
  }

  /**
   * 汇总一组记录
   * expense        —— 全部支出（生活 + 奖励）
   * lifeExpense    —— 生活支出，扣可用余额的那部分
   * rewardExpense  —— 奖励支出，只扣奖励额度
   * catSpent       —— 生活支出按分类汇总（分类预算只看这个）
   * rewardCatSpent —— 奖励支出按分类汇总
   * @returns {{expense:number, lifeExpense:number, rewardExpense:number, income:number, incomeInBalance:number, count:number, catSpent:Object, rewardCatSpent:Object}}
   */
  function summarize(records) {
    let expense = 0;
    let lifeExpense = 0;
    let rewardExpense = 0;
    let income = 0;
    let incomeInBalance = 0;
    const catSpent = {};
    const rewardCatSpent = {};

    (records || []).forEach(r => {
      const amount = Number(r.amount) || 0;
      if (r.type === 'expense') {
        expense += amount;
        if (isReward(r)) {
          rewardExpense += amount;
          rewardCatSpent[r.category] = (rewardCatSpent[r.category] || 0) + amount;
        } else {
          lifeExpense += amount;
          catSpent[r.category] = (catSpent[r.category] || 0) + amount;
        }
      } else {
        income += amount;
        // 只有勾选了「计入余额」的收入才算进可用余额
        if (r.includeInBalance !== false) incomeInBalance += amount;
      }
    });

    return {
      expense, lifeExpense, rewardExpense,
      income, incomeInBalance,
      count: (records || []).length,
      catSpent, rewardCatSpent
    };
  }

  /** 可用余额 = 预算 + 计入余额的收入 - 生活支出（奖励消费不参与） */
  function balanceOf(monthlyBudget, summary) {
    return (Number(monthlyBudget) || 0) + summary.incomeInBalance -
      (summary.lifeExpense != null ? summary.lifeExpense : summary.expense);
  }

  /** 奖励额度剩余 = 奖励额度 - 奖励支出 */
  function rewardBalanceOf(monthlyReward, summary) {
    return (Number(monthlyReward) || 0) - (summary.rewardExpense || 0);
  }

  /** 奖励额度的使用比例（0~100），没设额度时返回 0 */
  function rewardUsedPct(monthlyReward, summary) {
    const cap = Number(monthlyReward) || 0;
    if (cap <= 0) return 0;
    return Math.min(((summary.rewardExpense || 0) / cap) * 100, 100);
  }

  /** 把余额换算成「今天起平均每天还能花多少」 */
  function dailyBudget(balance, daysLeft) {
    const days = Math.max(daysLeft, 1);
    return balance > 0 ? balance / days : 0;
  }

  /** 预算使用比例 → 卡片配色档位 */
  function budgetLevel(expense, budget) {
    if (!budget || budget <= 0) return 'normal';
    const ratio = expense / budget;
    if (ratio >= 1) return 'danger';
    if (ratio >= 0.8) return 'warning';
    return 'normal';
  }

  /** 分类占比（默认只看生活支出，传 'reward' 则看奖励支出） */
  function categorySummary(records, bucket) {
    const wantReward = bucket === BUCKET_REWARD;
    const map = {};
    let total = 0;
    (records || []).forEach(r => {
      if (r.type !== 'expense') return;
      if (isReward(r) !== wantReward) return;
      const amount = Number(r.amount) || 0;
      map[r.category] = (map[r.category] || 0) + amount;
      total += amount;
    });
    const items = Object.keys(map)
      .map(cat => ({ cat, sum: map[cat], pct: total > 0 ? (map[cat] / total) * 100 : 0 }))
      .sort((a, b) => b.sum - a.sum);
    return { total, items };
  }

  /** 每日支出（返回 {1: 0, 2: 25.5, ...}），默认只统计生活支出 */
  function dailyTrend(records, days, bucket) {
    const wantReward = bucket === BUCKET_REWARD;
    const daily = {};
    const total = days || daysInMonth();
    for (let i = 1; i <= total; i++) daily[i] = 0;
    (records || []).forEach(r => {
      if (r.type !== 'expense' || !r.date) return;
      if (isReward(r) !== wantReward) return;
      const day = parseInt(r.date.slice(8, 10), 10);
      if (day >= 1 && day <= total) daily[day] += Number(r.amount) || 0;
    });
    return daily;
  }

  /** 近几个月支出合计（返回 {'2026-06': 123.45, ...}），默认只统计生活支出 */
  function monthSums(records, months, bucket) {
    const wantReward = bucket === BUCKET_REWARD;
    const out = {};
    months.forEach(m => {
      out[m] = (records || [])
        .filter(r => r.type === 'expense' && r.date && r.date.startsWith(m) && isReward(r) === wantReward)
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    });
    return out;
  }

  /** 分类预算 vs 实际支出 */
  function categoryBudgetRows(records, budgets) {
    const spent = summarize(records).catSpent;
    return Object.keys(budgets || {}).map(cat => {
      const budget = Number(budgets[cat]) || 0;
      const used = spent[cat] || 0;
      const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
      return {
        cat,
        budget,
        used,
        pct,
        over: budget > 0 && used > budget,
        color: budget > 0 && used > budget ? '#d93025' : pct > 80 ? '#e8710a' : '#1e8e3e'
      };
    });
  }

  // ========== 流水排序与分页 ==========

  /**
   * 搜索 + 排序（新的在前）
   * @param {string} [bucket] 'life' / 'reward' 只看某一边；不传则全部
   */
  function sortRecords(records, keyword, bucket) {
    const kw = (keyword || '').trim().toLowerCase();
    const want = (bucket === BUCKET_REWARD || bucket === BUCKET_LIFE) ? bucket : null;
    return (records || [])
      .filter(r => {
        if (want && bucketOf(r) !== want) return false;
        if (!kw) return true;
        return (r.note && String(r.note).toLowerCase().includes(kw)) ||
          (r.category && String(r.category).toLowerCase().includes(kw));
      })
      .slice()
      .sort((a, b) => {
        const timeA = a.createdAt || a.date || '';
        const timeB = b.createdAt || b.date || '';
        return String(timeB).localeCompare(String(timeA));
      });
  }

  /**
   * 列表里显示的时间：以「记账日期」为准
   *   - 今天的记录：今天 HH:mm
   *   - 其它日期：MM-DD
   * 之前这里优先用 createdAt，导致改了记账日期后列表还是显示当天，看着像没改成功。
   */
  function formatRecordTime(r) {
    const date = r && r.date ? String(r.date) : '';
    const today = todayStr();
    let time = '';
    if (r && r.createdAt) {
      const d = new Date(r.createdAt);
      if (!isNaN(d.getTime())) time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    if (!date) return time;
    if (date === today) return time ? `今天 ${time}` : '今天';
    return date.slice(5);
  }

  // ========== CSV ==========

  function csvCell(v) {
    return String(v == null ? '' : v).replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/,/g, '，');
  }

  /** 全量导出（和桌面端「导出全部 CSV」同格式） */
  function buildFullCsv(records) {
    const header = '日期,类型,分类,金额,备注,账户\n';
    const rows = (records || []).map(r => {
      const type = r.type === 'income' ? '收入' : '支出';
      const account = r.type === 'expense' ? bucketLabel(r) : BUCKET_LABEL.life;
      return `${r.date || ''},${type},${csvCell(r.category)},${Number(r.amount) || 0},${csvCell(r.note)},${account}`;
    }).join('\n');
    return BOM + header + rows;
  }

  /** 按时间范围导出 CSV（机器学习用，带 id） */
  function buildRangeCsv(records) {
    const header = 'id,date,type,category,amount,note,bucket\n';
    const rows = (records || []).map(r => {
      const note = String(r.note || '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
      return `${r.id},"${r.date}","${r.type}","${r.category}",${Number(r.amount) || 0},"${note}","${bucketOf(r)}"`;
    }).join('\n');
    return BOM + header + rows;
  }

  /** 按时间范围导出 JSON */
  function buildRangeJson(records, meta) {
    return JSON.stringify({
      meta: Object.assign({
        exportTime: new Date().toISOString(),
        recordCount: records.length
      }, meta || {}),
      records
    }, null, 2);
  }

  /** 筛选某个时间范围的记录（升序） */
  function filterByRange(records, startDate, endDate) {
    return records
      .filter(r => r.date && r.date >= startDate && r.date <= endDate)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /**
   * 解析 CSV 文本（与桌面端导入逻辑一致）
   * 表头支持中英文：date/日期、type/类型、category/分类、amount/金额、note/备注、
   * include_in_balance、bucket/account/账户（life/reward 或 生活/奖励）
   */
  function parseCsv(text) {
    const content = String(text || '').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return { success: false, error: 'CSV 内容为空' };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const colIdx = {};
    headers.forEach((h, i) => {
      if (h.includes('bucket') || h.includes('account') || h === '账户' || h === '归属') colIdx.bucket = i;
      else if (h.includes('date') || h === '日期') colIdx.date = i;
      else if (h.includes('type') || h === '类型') colIdx.type = i;
      else if (h.includes('category') || h === '分类') colIdx.category = i;
      else if (h.includes('amount') || h === '金额') colIdx.amount = i;
      else if (h.includes('note') || h.includes('remark') || h === '备注') colIdx.note = i;
      else if (h.includes('balance') || h.includes('include')) colIdx.include = i;
    });

    if (colIdx.date === undefined || colIdx.amount === undefined) {
      return { success: false, error: '缺少必需的表头：date 和 amount' };
    }

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { parts.push(current); current = ''; }
        else current += ch;
      }
      parts.push(current);

      const get = (idx, def) => (idx !== undefined && parts[idx] !== undefined ? parts[idx].trim() : (def || ''));
      const typeRaw = get(colIdx.type);
      const includeRaw = get(colIdx.include, 'true').toLowerCase();
      const accountRaw = get(colIdx.bucket).toLowerCase();
      const amount = parseFloat(get(colIdx.amount));

      if (!get(colIdx.date) || !isFinite(amount)) continue;

      records.push({
        id: uid('rec') + '_import_' + i,
        date: get(colIdx.date),
        type: typeRaw === '收入' || typeRaw === 'income' ? 'income' : 'expense',
        category: get(colIdx.category),
        amount,
        note: get(colIdx.note),
        bucket: accountRaw === 'reward' || accountRaw === '奖励' ? BUCKET_REWARD : BUCKET_LIFE,
        includeInBalance: includeRaw !== 'false' && includeRaw !== '0',
        createdAt: new Date().toISOString()
      });
    }

    if (!records.length) return { success: false, error: '没有解析到有效记录' };
    return { success: true, records };
  }

  return {
    DEFAULT_CATEGORIES,
    CATEGORY_ICONS,
    BUCKET_LIFE, BUCKET_REWARD, BUCKET_LABEL,
    // 日期
    todayStr, monthKey, monthStartStr, daysInMonth, lastMonths,
    // 基础
    pad2, formatMoney, uid, catIcon, defaultData, defaultConfig, normalize,
    isReward, bucketOf, bucketLabel,
    // 统计
    filterByMonth, summarize, balanceOf, rewardBalanceOf, rewardUsedPct, dailyBudget, budgetLevel,
    categorySummary, dailyTrend, monthSums, categoryBudgetRows,
    // 流水
    sortRecords, formatRecordTime,
    // CSV
    buildFullCsv, buildRangeCsv, buildRangeJson, filterByRange, parseCsv
  };
});
