/**
 * 安卓端 · AI 聊天（意图裁剪上下文 + Markdown 渲染 + 口径标签）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { AiContext, Markdown } from './deps.js';
import { aiChat } from './platform.js';
import { state } from './state.js';
import { queryElement } from './ui.js';

/* ============================ AI 聊天 ============================ */

export function appendChat(role, text, extraClass, rich) {
  const element = document.createElement('div');
  element.className = 'chat-msg ' + role + (extraClass ? ' ' + extraClass : '') + (rich ? ' md-body' : '');
  // AI 回复走 Markdown 渲染（模块内部已做 HTML 转义）；其余消息一律纯文本
  if (rich) element.innerHTML = Markdown.renderMarkdown(text);
  else element.textContent = text;
  queryElement('#chatMessages').appendChild(element);
  scrollChatToBottom();
  return element;
}

export function scrollChatToBottom() {
  const box = queryElement('#chatMessages');
  box.scrollTop = box.scrollHeight;
}

export async function sendChat() {
  const input = queryElement('#chatInput');
  const message = input.value.trim();
  if (!message || state.chatBusy) return;

  state.chatBusy = true;
  input.value = '';
  appendChat('user', message);
  const loading = appendChat('ai', '分析中…', 'loading');

  // 上下文按问题裁剪，只保留相关账本；追问「另一套呢」依赖上一轮范围
  const intent = AiContext.detectAiIntent(message, state.lastAiScope);
  const contextData = AiContext.buildAiContext(state.appData, {
    message: message,
    previousScope: state.lastAiScope
  });
  state.lastAiScope = intent.scope;

  const result = await aiChat(message, contextData, state.chatHistory.slice());
  loading.remove();
  state.chatBusy = false;

  if (result.success) {
    const element = appendChat('ai', result.reply, '', true);
    const scope = AiContext.scopeText(contextData);
    if (scope) {
      const tag = document.createElement('div');
      tag.className = 'chat-scope';
      tag.textContent = '本次依据：' + scope;
      element.appendChild(tag);
    }
    state.chatHistory.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    if (state.chatHistory.length > 12) state.chatHistory = state.chatHistory.slice(-12);
  } else {
    appendChat('system', result.error || '请求失败');
  }
}
