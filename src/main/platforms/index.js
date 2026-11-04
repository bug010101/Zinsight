/**
 * 平台选择器
 * 根据当前操作系统自动加载对应的平台模块
 */

const platform = process.platform;

let platformModule;

if (platform === 'darwin') {
  // macOS
  platformModule = require('./mac.js');
} else if (platform === 'win32') {
  // Windows
  platformModule = require('./windows.js');
} else if (platform === 'linux') {
  // Linux (Ubuntu 等)
  platformModule = require('./linux.js');
} else {
  // 其他平台，默认用 Linux
  console.warn(`不支持的平台: ${platform}，使用 Linux 默认配置`);
  platformModule = require('./linux.js');
}

module.exports = platformModule;
