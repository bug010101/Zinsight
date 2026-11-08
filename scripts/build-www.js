/**
 * 组装 Web 产物
 *
 * Capacitor 只认一个 webDir（默认 www/），所以先把移动端页面打成一个纯净目录：
 *   src/renderer/mobile/*（ES 模块）+ src/renderer/shared/markdown.css -> www/
 *
 * - 用 esbuild 把 app.js（含 Capacitor 插件 import 与 shared 纯函数）打成单文件 IIFE，
 *   这样页面里不需要 import map，也不需要打包器常驻。
 * - HTML 直接拷贝；styles.css 拷贝；共享的 Markdown 样式拷成 www/markdown.css。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src', 'renderer', 'mobile');
const OUT_DIR = path.join(ROOT, 'www');

async function build() {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (e) {
    console.error('[build-www] 缺少 esbuild，请先执行 npm install');
    process.exit(1);
  }

  // 先清空再生成：www 是唯一会被 cap sync 打进 APK 的目录，
  // 残留的调试/临时文件会一起进包，也可能带进测试数据
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(SRC_DIR, 'app.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome87'],
    outfile: path.join(OUT_DIR, 'app.js'),
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'warning'
  });

  // HTML 直接拷贝；CSS 按目录整体拷贝（新增样式表无需改这里）
  fs.copyFileSync(path.join(SRC_DIR, 'index.html'), path.join(OUT_DIR, 'index.html'));
  fs.readdirSync(SRC_DIR)
    .filter(file => file.endsWith('.css'))
    .forEach(file => fs.copyFileSync(path.join(SRC_DIR, file), path.join(OUT_DIR, file)));
  fs.copyFileSync(
    path.join(ROOT, 'src', 'renderer', 'shared', 'markdown.css'),
    path.join(OUT_DIR, 'markdown.css')
  );

  const size = (fs.statSync(path.join(OUT_DIR, 'app.js')).size / 1024).toFixed(1);
  console.log(`[build-www] 完成 -> www/  (app.js ${size} KB)`);
}

build().catch(err => {
  console.error('[build-www] 失败:', err.message);
  process.exit(1);
});
