/**
 * 安卓端 · 跨模块共享的可变状态（单一来源）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
export const state = {
  appData: null,
  appConfig: null,
  currentView: 'dashboard',
  currentType: 'expense',
  currentBucket: 'life',
  selectedCategory: '',
  editingId: null,
  recordFilter: 'all',
  filteredRecords: [],
  renderPage: 1,
  chatBusy: false,
  chatHistory: [],      // 最近几轮对话，仅用于追问指代，不落盘、不外发额外服务
  lastAiScope: null     // 上一轮问的是哪套账，用于「另一套呢」
};
