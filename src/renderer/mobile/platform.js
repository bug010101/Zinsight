/**
 * 安卓端 · 原生能力桥接（文件读写、分享、AI 请求）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import { APP_DIR, LS_KEY } from './constants.js';
import { AiContext, CapacitorHttp, Core, Directory, Encoding, Filesystem, NATIVE, Share } from './deps.js';
import { state } from './state.js';
import { queryElement } from './ui.js';

/* ============================ 存储桥接 ============================ */

/** 浏览器预览模式下 localStorage 可能不可用（隐私模式 / file://），退化成内存存储 */
export const memoryStore = {};

export function lsGet(key) {
  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue !== null) return storedValue;
  } catch (error) { /* 继续走内存 */ }
  return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return;
  } catch (error) { /* 继续走内存 */ }
  memoryStore[key] = value;
}

export async function readJSON(kind) {
  const isData = kind === 'data';
  const fallback = () => (isData ? Core.defaultData() : Core.defaultConfig());

  if (NATIVE) {
    try {
      const result = await Filesystem.readFile({
        path: `${APP_DIR}/${kind}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      return JSON.parse(result.data);
    } catch (error) {
      const def = fallback();
      await writeJSON(kind, def);
      return def;
    }
  }

  const raw = lsGet(LS_KEY[kind]);
  if (raw) {
    try { return JSON.parse(raw); } catch (error) { /* 落到默认值 */ }
  }
  const def = fallback();
  lsSet(LS_KEY[kind], JSON.stringify(def));
  return def;
}

export async function writeJSON(kind, obj) {
  if (NATIVE) {
    try {
      await Filesystem.mkdir({ path: APP_DIR, directory: Directory.Data, recursive: true });
    } catch (error) { /* 目录已存在 */ }
    await Filesystem.writeFile({
      path: `${APP_DIR}/${kind}.json`,
      directory: Directory.Data,
      data: JSON.stringify(obj, null, 2),
      encoding: Encoding.UTF8
    });
    return;
  }
  lsSet(LS_KEY[kind], JSON.stringify(obj));
}

/** 把文本文件交给系统：原生走「分享/保存到」面板，浏览器走下载 */
export async function saveAndShare(filename, content, mime) {
  if (!NATIVE) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return { success: true, shared: true, path: filename };
  }

  // Filesystem.writeFile 的 recursive 默认是 false，写 exports/xxx.csv 时
  // 若 exports/ 还不存在就会报 "missing parent directory ... recursive = false
  // was passed or parent directory creation failed"。先建目录，写入时也带上
  // recursive，避免首次导出（或清过缓存后）直接失败。
  const exportDir = 'exports';
  try {
    await Filesystem.mkdir({
      path: exportDir,
      directory: Directory.Cache,
      recursive: true
    });
  } catch (error) { /* 目录已存在或部分实现不支持，交给下面的写入兜底 */ }

  let result;
  try {
    result = await Filesystem.writeFile({
      path: `${exportDir}/${filename}`,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });
  } catch (error) {
    // 少数 ROM / 旧插件版本仍可能拒绝子目录，降级直接写缓存根目录再试一次
    result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });
  }

  // 只传 files，不传 text：同时带 EXTRA_TEXT 和 EXTRA_STREAM 时，
  // 微信 / QQ 可能只把文字发出去而丢掉附件。MIME 由插件按扩展名推断。
  let shared = true;
  try {
    await Share.share({
      title: filename,
      files: [result.uri],
      dialogTitle: '分享 ' + filename
    });
  } catch (error) {
    const message = (error && error.message) || '';
    if (/cancel/i.test(message)) shared = false;
    else throw error;
  }

  return { success: true, shared, path: filename };
}

/* ============================ AI ============================ */

export async function aiChat(message, contextData, history) {
  const ai = (state.appConfig && state.appConfig.ai) || {};
  if (!ai.apiKey || !ai.baseUrl) {
    return { success: false, error: '请先在设置中配置 AI API Key 和接口地址' };
  }
  // 设置页允许只填 base，这里统一补成完整的 chat/completions 端点
  const url = Core.normalizeAiEndpoint(ai.baseUrl);
  // 视图层已按问题裁剪好上下文；旧结构 / 缺失时由共享模块统一兜底重建，
  // 空对象表示「测试连接」，保持原样不塞账本数据。
  const context = AiContext.ensureAiContext(contextData, state.appData, message);
  const payload = {
    model: ai.model || 'gpt-3.5-turbo',
    messages: AiContext.buildAiMessages(context, message, history),
    temperature: 0.7
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ai.apiKey}`
  };

  try {
    let status = 0;
    let raw;
    if (NATIVE) {
      // 原生 HTTP，绕过 WebView 的跨域限制
      const result = await CapacitorHttp.post({
        url,
        headers,
        data: payload,
        connectTimeout: 20000,
        readTimeout: 90000
      });
      status = result.status;
      raw = result.data;
    } else {
      const result = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      status = result.status;
      raw = await result.text();
    }

    if (status >= 400) {
      return { success: false, error: Core.formatAiError(status, raw) };
    }
    let data;
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      return { success: false, error: '接口返回的不是 JSON：' + String(raw).slice(0, 120) };
    }
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    return { success: true, reply: reply || '抱歉，没有获取到回复' };
  } catch (caughtError) {
    return { success: false, error: (caughtError && caughtError.message) || '请求失败' };
  }
}
