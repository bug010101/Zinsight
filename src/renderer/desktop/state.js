/**
 * 桌面端 · 全局状态与共享内核别名（最先加载）
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
/**
 * Zinsight 桌面端视图逻辑（Electron renderer）
 *
 * 分层约定：
 *   - 纯业务逻辑（余额 / 统计 / 日期 / CSV）在 ../shared/ledger-core.js，桌面端不重复实现
 *   - AI 意图 / 上下文 / 提示词在 ../shared/ai/，三端只依赖 index.js 门面，禁止在此重写
 *   - 平台能力（读写文件、导出对话框、AI 请求）由主进程通过 window.ledgerAPI 提供
 *   - 本文件只负责 DOM 渲染、交互与事件绑定
 */

// ========== 全局状态 ==========
let appData = null;
let appConfig = null;
let currentType = 'expense';
let currentBucket = 'life';   // 'life' 生活消费 | 'reward' 奖励消费
let editingId = null;
let recordFilter = 'all';
let selectionMode = false;
let selectedRecordIds = [];
let chatHistory = [];      // 最近几轮对话，仅用于追问指代，不落盘、不外发额外服务
let lastAiScope = null;    // 上一轮问的是哪套账，用于「另一套呢」

// ========== 领域逻辑（统一走共享内核） ==========
// 日期、金额、归属、汇总、CSV 等纯逻辑全部由 src/renderer/shared/ledger-core.js
// 提供，桌面端只做别名绑定，避免与安卓端出现两份实现、结果慢慢漂移。
const Core = window.LedgerCore;
const Markdown = window.ZinsightMarkdown;
const AiContext = window.ZinsightAiContext;
const {
  padTwoDigits, todayStr, monthKey, formatMoney, isReward,
  normalize: normalizeData, summarize, formatRecordTime,
  filterByMonth, DEFAULT_CATEGORIES
} = Core;
const getMonthStr = monthKey;
const getCurrentMonthRecords = () => filterByMonth(appData.records, monthKey());

/** 配置结构两端略有差异，这段归一化留在桌面端 */
function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  return {
    ai: Object.assign({ apiKey: '', baseUrl: '', model: '' }, config.ai || {}),
    settings: Object.assign({ includeIncomeInBalance: true }, config.settings || {})
  };
}
