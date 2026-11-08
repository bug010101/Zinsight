/**
 * 安卓端 · 启动入口（build:www 的 esbuild 打包入口）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { renderCategoryChips, syncBucketUI, syncTypeUI } from './actions.js';
import { refreshAll } from './data.js';
import { Core } from './deps.js';
import { bindEvents } from './events.js';
import { readJSON } from './platform.js';
import { renderCatList, renderSettings } from './settings.js';
import { state } from './state.js';
import { queryElement, escapeHtml } from './ui.js';
import { setView } from './views.js';

/* ============================ 启动 ============================ */

export async function init() {
  state.appData = Core.normalize(await readJSON('data'));
  const rawConfig = await readJSON('config');
  state.appConfig = Object.assign(Core.defaultConfig(), rawConfig || {});
  state.appConfig.ai = Object.assign({ apiKey: '', baseUrl: '', model: '' }, (rawConfig && rawConfig.ai) || {});

  queryElement('#inputDate').value = Core.todayStr();
  queryElement('#inputDate').dataset.picked = queryElement('#inputDate').value;
  queryElement('#chatInput').placeholder = '例如：我这个月餐饮花了多少？';

  bindEvents();
  renderSettings();
  renderCatList();
  renderCategoryChips();
  syncTypeUI();
  syncBucketUI();
  refreshAll();
  setView('dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(caughtError => {
    console.error(caughtError);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:16px;background:#fce8e6;color:#a50e0e;font-size:13px;">初始化失败：${escapeHtml(caughtError && caughtError.message)}</div>`);
  });
});
