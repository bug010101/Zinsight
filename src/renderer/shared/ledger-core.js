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

  function padTwoDigits(number) {
    return String(number).padStart(2, '0');
  }

  /** 2026-11-06 */
  function todayStr(referenceDate) {
    const date = referenceDate || new Date();
    return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`;
  }

  /** 本地时区的日期时间字符串，用于导出文件的 meta。
   *  不能用 toISOString()：那是 UTC，比北京时间晚 8 小时，会让用户看到的导出时间和实际对不上。 */
  function formatLocalDateTime(referenceDate) {
    const date = referenceDate || new Date();
    return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())} `
      + `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}:${padTwoDigits(date.getSeconds())}`;
  }

  /** 2026-11 */
  function monthKey(referenceDate) {
    const date = referenceDate || new Date();
    return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}`;
  }

  /** 2026-11-01 */
  function monthStartStr(referenceDate) {
    return monthKey(referenceDate) + '-01';
  }

  function daysInMonth(referenceDate) {
    const date = referenceDate || new Date();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  /** 最近 n 个月，返回 ['2026-06', ..., '2026-11'] */
  function lastMonths(number, referenceDate) {
    const date = referenceDate || new Date();
    const out = [];
    for (let index = number - 1; index >= 0; index--) {
      out.push(monthKey(new Date(date.getFullYear(), date.getMonth() - index, 1)));
    }
    return out;
  }

  // ========== 基础工具 ==========

  function formatMoney(number) {
    const value = Number(number);
    return (isFinite(value) ? value : 0).toFixed(2);
  }

  function generateId(prefix) {
    return `${prefix || 'rec'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function categoryIcon(category) {
    return CATEGORY_ICONS[category] || '📦';
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

  /**
   * 统一日期为 YYYY-MM-DD。
   * Excel / Numbers 打开 CSV 再保存时，常把 2026-11-08 写成 2026/11/8；
   * 而月度筛选、按范围导出/删除都依赖 '2026-11' 前缀做字符串比较，
   * 斜杠日期会让记录在统计里「凭空消失」。无效值原样返回，不静默丢数据。
   */
  function normalizeDate(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
    if (iso) return `${iso[1]}-${padTwoDigits(Number(iso[2]))}-${padTwoDigits(Number(iso[3]))}`;
    const loose = text.match(/^(\d{4})[/.年](\d{1,2})[/.月](\d{1,2})/);
    if (loose) {
      const year = Number(loose[1]);
      const month = Number(loose[2]);
      const day = Number(loose[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${padTwoDigits(month)}-${padTwoDigits(day)}`;
      }
    }
    return text;
  }

  /** 补齐老数据缺失的字段，避免渲染时炸掉 */
  function normalize(data) {
    const source = data && typeof data === 'object' ? data : {};
    const base = defaultData();
    return {
      records: Array.isArray(source.records) ? source.records.map(normalizeRecord) : [],
      budget: {
        monthly: Number(source.budget && source.budget.monthly) || 0,
        categories: (source.budget && source.budget.categories) || {}
      },
      reward: {
        monthly: Number(source.reward && source.reward.monthly) || 0
      },
      categories: Array.isArray(source.categories) && source.categories.length ? source.categories.slice() : base.categories,
      createdAt: source.createdAt || base.createdAt
    };
  }

  function normalizeRecord(record) {
    const source = record || {};
    return {
      id: source.id != null ? source.id : generateId(),
      type: source.type === 'income' ? 'income' : 'expense',
      amount: Number(source.amount) || 0,
      category: source.category || '其他',
      note: source.note || '',
      date: normalizeDate(source.date) || todayStr(),
      bucket: source.bucket === BUCKET_REWARD ? BUCKET_REWARD : BUCKET_LIFE,
      includeInBalance: source.includeInBalance !== false,
      createdAt: source.createdAt || new Date().toISOString()
    };
  }

  /** 这条记录算不算奖励消费（收入永远是生活账户） */
  function isReward(record) {
    return !!record && record.type === 'expense' && record.bucket === BUCKET_REWARD;
  }

  function bucketOf(record) {
    return isReward(record) ? BUCKET_REWARD : BUCKET_LIFE;
  }

  function bucketLabel(record) {
    return BUCKET_LABEL[bucketOf(record)] || BUCKET_LABEL.life;
  }

  // ========== 统计 ==========

  /** 指定月份的记录 */
  function filterByMonth(records, key) {
    return records.filter(record => record.date && record.date.startsWith(key));
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

    (records || []).forEach(record => {
      const amount = Number(record.amount) || 0;
      if (record.type === 'expense') {
        expense += amount;
        if (isReward(record)) {
          rewardExpense += amount;
          rewardCatSpent[record.category] = (rewardCatSpent[record.category] || 0) + amount;
        } else {
          lifeExpense += amount;
          catSpent[record.category] = (catSpent[record.category] || 0) + amount;
        }
      } else {
        income += amount;
        // 只有勾选了「计入余额」的收入才算进可用余额
        if (record.includeInBalance !== false) incomeInBalance += amount;
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
    (records || []).forEach(record => {
      if (record.type !== 'expense') return;
      if (isReward(record) !== wantReward) return;
      const amount = Number(record.amount) || 0;
      map[record.category] = (map[record.category] || 0) + amount;
      total += amount;
    });
    const items = Object.keys(map)
      // 对外的字段名固定为 cat（历史数据契约），局部变量仍用完整单词
      .map(category => ({ cat: category, sum: map[category], pct: total > 0 ? (map[category] / total) * 100 : 0 }))
      .sort((firstRecord, secondRecord) => secondRecord.sum - firstRecord.sum);
    return { total, items };
  }

  /** 每日支出（返回 {1: 0, 2: 25.5, ...}），默认只统计生活支出 */
  function dailyTrend(records, days, bucket) {
    const wantReward = bucket === BUCKET_REWARD;
    const daily = {};
    const total = days || daysInMonth();
    for (let index = 1; index <= total; index++) daily[index] = 0;
    (records || []).forEach(record => {
      if (record.type !== 'expense' || !record.date) return;
      if (isReward(record) !== wantReward) return;
      const day = parseInt(record.date.slice(8, 10), 10);
      if (day >= 1 && day <= total) daily[day] += Number(record.amount) || 0;
    });
    return daily;
  }

  /** 近几个月支出合计（返回 {'2026-06': 123.45, ...}），默认只统计生活支出 */
  function monthSums(records, months, bucket) {
    const wantReward = bucket === BUCKET_REWARD;
    const out = {};
    months.forEach(month => {
      out[month] = (records || [])
        .filter(record => record.type === 'expense' && record.date && record.date.startsWith(month) && isReward(record) === wantReward)
        .reduce((total, record) => total + (Number(record.amount) || 0), 0);
    });
    return out;
  }

  /** 分类预算 vs 实际支出 */
  function categoryBudgetRows(records, budgets) {
    const spent = summarize(records).catSpent;
    return Object.keys(budgets || {}).map(category => {
      const budget = Number(budgets[category]) || 0;
      const used = spent[category] || 0;
      const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
      return {
        // 对外的字段名固定为 cat（历史数据契约），局部变量仍用完整单词
        cat: category,
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
    const searchTerm = (keyword || '').trim().toLowerCase();
    const want = (bucket === BUCKET_REWARD || bucket === BUCKET_LIFE) ? bucket : null;
    return (records || [])
      .filter(record => {
        if (want && bucketOf(record) !== want) return false;
        if (!searchTerm) return true;
        return (record.note && String(record.note).toLowerCase().includes(searchTerm)) ||
          (record.category && String(record.category).toLowerCase().includes(searchTerm));
      })
      .slice()
      .sort((firstRecord, secondRecord) => {
        const timeA = firstRecord.createdAt || firstRecord.date || '';
        const timeB = secondRecord.createdAt || secondRecord.date || '';
        return String(timeB).localeCompare(String(timeA));
      });
  }

  /**
   * 列表里显示的时间：以「记账日期」为准
   *   - 今天的记录：今天 HH:mm
   *   - 其它日期：MM-DD
   * 之前这里优先用 createdAt，导致改了记账日期后列表还是显示当天，看着像没改成功。
   */
  function formatRecordTime(record) {
    const date = record && record.date ? String(record.date) : '';
    const today = todayStr();
    let time = '';
    if (record && record.createdAt) {
      const referenceDate = new Date(record.createdAt);
      if (!isNaN(referenceDate.getTime())) time = `${padTwoDigits(referenceDate.getHours())}:${padTwoDigits(referenceDate.getMinutes())}`;
    }
    if (!date) return time;
    if (date === today) return time ? `今天 ${time}` : '今天';
    return date.slice(5);
  }

  // ========== CSV ==========

  function formatCsvCell(value) {
    return String(value == null ? '' : value).replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/,/g, '，');
  }

  /** 全量导出（和桌面端「导出全部 CSV」同格式） */
  function buildFullCsv(records) {
    const header = '日期,类型,分类,金额,备注,账户\n';
    const rows = (records || []).map(record => {
      const type = record.type === 'income' ? '收入' : '支出';
      const account = record.type === 'expense' ? bucketLabel(record) : BUCKET_LABEL.life;
      return `${record.date || ''},${type},${formatCsvCell(record.category)},${Number(record.amount) || 0},${formatCsvCell(record.note)},${account}`;
    }).join('\n');
    return BOM + header + rows;
  }

  /** 按时间范围导出 CSV（机器学习用，带 id） */
  function buildRangeCsv(records) {
    const header = 'id,date,type,category,amount,note,bucket\n';
    const rows = (records || []).map(record => {
      const note = String(record.note || '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
      return `${record.id},"${record.date}","${record.type}","${record.category}",${Number(record.amount) || 0},"${note}","${bucketOf(record)}"`;
    }).join('\n');
    return BOM + header + rows;
  }

  /** 按时间范围导出 JSON */
  function buildRangeJson(records, meta) {
    return JSON.stringify({
      meta: Object.assign({
        exportTime: formatLocalDateTime(),
        recordCount: records.length
      }, meta || {}),
      records
    }, null, 2);
  }

  /** 筛选某个时间范围的记录（升序） */
  function filterByRange(records, startDate, endDate) {
    return records
      .filter(record => record.date && record.date >= startDate && record.date <= endDate)
      .slice()
      .sort((firstRecord, secondRecord) => String(firstRecord.date).localeCompare(String(secondRecord.date)));
  }

  /**
   * 解析 CSV 文本（与桌面端导入逻辑一致）
   * 表头支持中英文：date/日期、type/类型、category/分类、amount/金额、note/备注、
   * include_in_balance、bucket/account/账户（life/reward 或 生活/奖励）
   */
  function parseCsv(text) {
    const content = String(text || '').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      return { success: false, error: 'CSV 内容为空' };
    }

    const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
    const colIdx = {};
    headers.forEach((header, index) => {
      if (header.includes('bucket') || header.includes('account') || header === '账户' || header === '归属') colIdx.bucket = index;
      else if (header.includes('date') || header === '日期') colIdx.date = index;
      else if (header.includes('type') || header === '类型') colIdx.type = index;
      else if (header.includes('category') || header === '分类') colIdx.category = index;
      else if (header.includes('amount') || header === '金额') colIdx.amount = index;
      else if (header.includes('note') || header.includes('remark') || header === '备注') colIdx.note = index;
      else if (header.includes('balance') || header.includes('include')) colIdx.include = index;
    });

    if (colIdx.date === undefined || colIdx.amount === undefined) {
      return { success: false, error: '缺少必需的表头：date 和 amount' };
    }

    const records = [];
    for (let index = 1; index < lines.length; index++) {
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (const ch of lines[index]) {
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
        id: generateId('rec') + '_import_' + index,
        date: normalizeDate(get(colIdx.date)),
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

    // 导入的历史记录没有精确创建时间，按「记账日期 + CSV 行序」给每条补一个 createdAt。
    // 否则所有记录都是导入这一刻、完全相等，列表排序会退化成依赖 CSV 文件顺序，
    // 出现「最新的却显示在最底下」之类的错乱。
    records.forEach((record, index) => {
      const base = new Date(`${record.date}T12:00:00`);
      if (!isNaN(base.getTime())) {
        base.setSeconds(base.getSeconds() + index);
        record.createdAt = base.toISOString();
      }
    });

    return { success: true, records };
  }

  // ========== AI 接口地址 ==========

  /**
   * 归一化设置页填写的 AI 接口地址。
   * 允许两种写法：只填 base（https://api.deepseek.com/v1），或填完整的
   * .../chat/completions。请求前统一成后者；空值原样返回，表示未配置。
   */
  function normalizeAiEndpoint(input) {
    let url = String(input == null ? '' : input).trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(url)) return url;
    return url + '/chat/completions';
  }

  /**
   * 把接口的失败响应变成能看懂的一句话。
   * 各家错误字段不一样（error.message / error.code / msg / message），
   * 都不是 JSON 时退回报文片段，避免只显示一个状态码让人无从下手。
   */
  function formatAiError(status, body) {
    const code = status ? `接口返回 ${status}` : '请求失败';
    const fallback = `${code}，请检查接口地址、Key 和模型名`;
    let raw = body;
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (!text) return fallback;
      try { raw = JSON.parse(text); } catch (error) { /* 不是 JSON，按纯文本处理 */ }
    }
    let detail = '';
    if (raw && typeof raw === 'object') {
      const caughtError = raw.error;
      detail = (caughtError && typeof caughtError === 'object' && (caughtError.message || caughtError.msg || caughtError.code)) ||
               (typeof caughtError === 'string' ? caughtError : '') ||
               raw.message || raw.msg || raw.error_msg || '';
    } else if (typeof raw === 'string') {
      detail = raw;
    }
    detail = String(detail || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    return detail ? `${code}：${detail}` : fallback;
  }

  return {
    DEFAULT_CATEGORIES,
    CATEGORY_ICONS,
    BUCKET_LIFE, BUCKET_REWARD, BUCKET_LABEL,
    // 日期
    todayStr, monthKey, monthStartStr, daysInMonth, lastMonths, normalizeDate, formatLocalDateTime,
    // 基础
    padTwoDigits, formatMoney, generateId, categoryIcon, defaultData, defaultConfig, normalize,
    isReward, bucketOf, bucketLabel,
    // 统计
    filterByMonth, summarize, balanceOf, rewardBalanceOf, rewardUsedPct, dailyBudget, budgetLevel,
    categorySummary, dailyTrend, monthSums, categoryBudgetRows,
    // 流水
    sortRecords, formatRecordTime,
    // CSV
    buildFullCsv, buildRangeCsv, buildRangeJson, filterByRange, parseCsv,
    // AI 配置
    normalizeAiEndpoint, formatAiError
  };
});
