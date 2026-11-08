/**
 * AI 能力门面：把 intent / context / prompt 三个纯函数模块组装成单一出口。
 *
 * 三端只依赖这个文件，不知道内部怎么拆：
 *   浏览器经典脚本 → window.ZinsightAiContext（HTML 里须按 intent → context → prompt → index 顺序引入）
 *   ESM（安卓端由 esbuild 打包）→ import AiContext from '../shared/ai/index.js'
 *   CommonJS（桌面主进程）→ require('../renderer/shared/ai/index.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./intent.js'),
      require('./context.js'),
      require('./prompt.js')
    );
  } else {
    root.ZinsightAiContext = factory(
      root.ZinsightAI.intent,
      root.ZinsightAI.context,
      root.ZinsightAI.prompt
    );
  }
})(typeof self !== 'undefined' ? self : this, function (Intent, Context, Prompt) {
  'use strict';

  /**
   * 统一兜底：视图层已按意图构造好的上下文直接采用；空对象是「测试连接」；
   * 旧结构、缺失、或意图与问题对不上时，用当前账本按问题重建，避免任何一端
   * 悄悄把两套账一起塞给模型。
   */
  function ensureAiContext(contextData, dataOrGetter, message, previousScope) {
    // 主进程可传 () => readData()：只有真要重建时才读磁盘，避免正常路径
    // 因账本文件读取异常而连累 AI 请求；安卓端直接传内存里的 state.appData。
    const read = () => (typeof dataOrGetter === 'function' ? dataOrGetter() : dataOrGetter);
    if (!contextData || typeof contextData !== 'object') {
      return Context.buildAiContext(read(), { message, previousScope });
    }
    if (Object.keys(contextData).length === 0) return contextData; // 测试连接
    // 视图层已按完整意图（含「另一套呢」这类依赖上一轮的追问）构造好，
    // 这里不能再识别一次，否则追问的范围会被重置成默认的生活账。
    if (contextData.统计月份 && contextData['本次回答范围']) return contextData;
    return Context.buildAiContext(read(), { message, previousScope });
  }

  /** 给聊天 UI 显示「本次依据：生活消费 · 2026-11（本月）」 */
  function scopeText(contextData) {
    const scope = contextData && contextData['本次回答范围'];
    if (!scope) return '';
    return scope.账本 + ' · ' + (contextData.统计月份 || '') + '（' + (scope.时间范围 || '本月') + '）';
  }

  return {
    AI_RULES: Prompt.AI_RULES,
    LIFE: Context.LIFE,
    REWARD: Context.REWARD,
    SCOPE_LIFE: Intent.SCOPE_LIFE,
    SCOPE_REWARD: Intent.SCOPE_REWARD,
    SCOPE_BOTH: Intent.SCOPE_BOTH,
    detectAiIntent: Intent.detectAiIntent,
    scopeLabel: Intent.scopeLabel,
    buildAiContext: Context.buildAiContext,
    buildAiSystemPrompt: Prompt.buildAiSystemPrompt,
    buildAiMessages: Prompt.buildAiMessages,
    ensureAiContext,
    scopeText
  };
});
