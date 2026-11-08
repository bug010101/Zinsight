/**
 * 把 assets/android 里的启动图标铺进 Capacitor 生成的安卓工程。
 *
 * 用法：npx cap add android && node scripts/android-icons.js
 *
 * 说明：
 * - 图标源文件是 assets/desktop/dock-icon.png（1024×1024），预先缩成各密度，
 *   所以这里不需要 ImageMagick / 在线转换。
 * - 同时删掉 mipmap-anydpi-v26 的自适应图标 XML，让系统直接使用位图，
 *   避免「白底圆 + 圆角方块」的套娃效果。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'android');
const RES_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

function main() {
  if (!fs.existsSync(RES_DIR)) {
    console.log('[android-icons] 还没生成 android 目录，跳过');
    return;
  }
  if (!fs.existsSync(SRC_DIR)) {
    console.log('[android-icons] 没有 assets/android，跳过');
    return;
  }

  let copied = 0;
  fs.readdirSync(SRC_DIR).forEach(density => {
    const dir = path.join(SRC_DIR, density);
    // ic_launcher.png（方图）+ ic_launcher_round.png（圆形图标，manifest 里 roundIcon 引用了它，
    // 少了会编译报错，所以必须一起铺进去）
    ['ic_launcher.png', 'ic_launcher_round.png'].forEach(name => {
      const from = path.join(dir, name);
      if (!fs.existsSync(from)) return;
      const targetDir = path.join(RES_DIR, density);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(from, path.join(targetDir, name));
      copied++;
    });
  });

  // 去掉自适应图标定义，系统会回退到位图
  // （删不掉也不影响 APK 产物，只是图标还是 Capacitor 默认的）
  ['mipmap-anydpi-v26', 'mipmap-anydpi'].forEach(dir => {
    const full = path.join(RES_DIR, dir);
    if (!fs.existsSync(full)) return;
    fs.readdirSync(full)
      .filter(f => f.indexOf('ic_launcher') === 0)
      .forEach(f => {
        try {
          fs.rmSync(path.join(full, f), { force: true });
        } catch (e) {
          console.log(`[android-icons] 跳过 ${dir}/${f}（${e.code || e.message}）`);
        }
      });
  });

  console.log(`[android-icons] 已替换 ${copied} 个启动图标文件`);
}

main();
