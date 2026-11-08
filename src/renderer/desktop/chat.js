/**
 * 桌面端 · AI 聊天（意图裁剪上下文 + Markdown 渲染 + 口径标签）
 * 经典脚本：与同页其它脚本共享全局声明，由 index.html 按顺序引入。
 */
// ========== AI 聊天 ==========
async function sendChat() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const messagesEl = document.getElementById('chatMessages');
  messagesEl.innerHTML += `<div class="chat-msg user">${Markdown.escapeHtml(message)}</div>`;
  input.value = '';
  messagesEl.scrollTop = messagesEl.scrollHeight;

  messagesEl.innerHTML += `<div class="chat-msg ai" id="loadingMsg">分析中...</div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 先判断问的是哪套账，上下文里只放这一套的数字，从源头杜绝混算；
  // 追问「另一套呢」要带上上一轮的范围才能正确翻转。
  const intent = AiContext.detectAiIntent(message, lastAiScope);
  const contextData = AiContext.buildAiContext(appData, { message: message, previousScope: lastAiScope });
  lastAiScope = intent.scope;

  const result = await window.ledgerAPI.aiChat(message, contextData, chatHistory.slice());
  document.getElementById('loadingMsg')?.remove();

  if (result.success) {
    chatHistory.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
    const scope = AiContext.scopeText(contextData);
    const tag = scope ? `<div class="chat-scope">本次依据：${Markdown.escapeHtml(scope)}</div>` : '';
    // AI 回复按 Markdown 渲染（模块内部已做 HTML 转义，不会执行注入内容）
    messagesEl.innerHTML += `<div class="chat-msg ai md-body">${Markdown.renderMarkdown(result.reply)}${tag}</div>`;
  } else {
    messagesEl.innerHTML += `<div class="chat-msg system">${Markdown.escapeHtml(result.error)}</div>`;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
