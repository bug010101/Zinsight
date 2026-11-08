/**
 * 安卓端 · 通用 UI 工具（选择器、转义、Toast、确认框）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
/* ============================ 小工具 ============================ */

/** 在指定范围内查找单个元素；不传范围时从整个文档查找 */
export function queryElement(selector, scopeRoot) {
  return (scopeRoot || document).querySelector(selector);
}

/** 在指定范围内查找全部元素，返回真数组以便直接使用 forEach / map */
export function queryElements(selector, scopeRoot) {
  return Array.from((scopeRoot || document).querySelectorAll(selector));
}

/** HTML 转义，防止备注里的特殊字符打乱结构 */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export let toastTimer = null;
export function showToast(message) {
  const element = queryElement('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
}

/* ============================ 确认框 ============================ */

export let dialogResolve = null;

export function confirmDialog(rawOptions) {
  const dialogOptions = typeof rawOptions === 'string' ? { text: rawOptions } : (rawOptions || {});
  return new Promise(resolve => {
    dialogResolve = resolve;
    queryElement('#dialogTitle').textContent = dialogOptions.title || '确认';
    queryElement('#dialogText').textContent = dialogOptions.text || '';
    queryElement('#dialogOk').textContent = dialogOptions.okText || '确定';
    queryElement('#dialogOk').className = dialogOptions.danger === false ? '' : 'danger';
    queryElement('#dialogMask').classList.add('show');
  });
}

export function settleDialog(value) {
  queryElement('#dialogMask').classList.remove('show');
  if (dialogResolve) {
    const fn = dialogResolve;
    dialogResolve = null;
    fn(value);
  }
}

/** 需要用户输入多行文本时用的弹窗（CSV 粘贴） */
export function askText(title, placeholder) {
  return new Promise(resolve => {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask show';
    mask.innerHTML = `
      <div class="dialog">
        <h3>${escapeHtml(title)}</h3>
        <div class="field" style="margin:12px 0 0;">
          <textarea id="askTextArea" placeholder="${escapeHtml(placeholder || '')}"></textarea>
        </div>
        <div class="dialog-actions">
          <button data-act="cancel">取消</button>
          <button data-act="ok">确定</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = result => { mask.remove(); resolve(result); };
    mask.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    mask.querySelector('[data-act="ok"]').addEventListener('click', () => close(mask.querySelector('#askTextArea').value));
  });
}
