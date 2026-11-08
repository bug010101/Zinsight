/**
 * 把 package.json 的版本同步进 Capacitor 生成的安卓工程。
 *
 * 背景：Capacitor 模板里 versionName 固定 "1.0"、versionCode 固定 1，
 * 不会跟 package.json 走；而 CI 每次都是干净环境重新生成 android/，
 * 所以必须在生成之后统一写入，否则 APK 里显示的版本和 Release tag 对不上。
 *
 * 设计原则：幂等 + 容错。文件不存在或字段格式变化时只提示，绝不中断打包。
 * 用法：npx cap add android && node scripts/android-version.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRADLE_FILE = path.join(ROOT, 'android', 'app', 'build.gradle');

// 1.4.1 -> 10401；保证随版本号单调递增，且远小于 int 上限
function toVersionCode(version) {
  const parts = String(version).split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}

function main() {
  if (!fs.existsSync(GRADLE_FILE)) {
    console.log('[android-version] 还没有 android 工程，跳过');
    return;
  }

  let version;
  try {
    version = require(path.join(ROOT, 'package.json')).version;
  } catch (e) {
    console.log(`[android-version] 读取版本失败，保持模板默认值（${e.message}）`);
    return;
  }

  const code = toVersionCode(version);
  if (!Number.isSafeInteger(code) || code <= 0) {
    console.log(`[android-version] 版本号 ${version} 无法生成 versionCode，保持模板默认值`);
    return;
  }

  const original = fs.readFileSync(GRADLE_FILE, 'utf8');
  const reCode = /\bversionCode\s+\d+/;
  const reName = /\bversionName\s+"[^"]*"/;
  if (!reCode.test(original) || !reName.test(original)) {
    console.log('[android-version] 未匹配到 versionCode / versionName，保持模板默认值');
    return;
  }

  const updated = original
    .replace(reCode, `versionCode ${code}`)
    .replace(reName, `versionName "${version}"`);

  if (updated === original) {
    console.log(`[android-version] 已是 ${version} (${code})，无需修改`);
    return;
  }

  fs.writeFileSync(GRADLE_FILE, updated);
  console.log(`[android-version] versionName=${version} versionCode=${code}`);
}

main();
