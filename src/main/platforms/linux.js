/**
 * Linux (Ubuntu) 专属逻辑
 * - 系统托盘图标（顶部状态栏）
 * - 没有顶部应用菜单，菜单在窗口里
 * - 图标用 PNG 格式
 */

const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

/**
 * Linux 平台初始化
 * @param {object} ctx - 全局上下文（mainWindow、tray 等）
 */
function init(ctx) {
  const { mainWindow } = ctx;

  app.setName('Zinsight');

  // 创建系统托盘图标（顶部状态栏）
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', '..', 'assets', 'desktop', 'dock-icon.png'));
  ctx.tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 Zinsight', click: () => mainWindow.show() },
    { label: '快速记一笔', click: () => { mainWindow.show(); mainWindow.webContents.send('shortcut:quickAdd'); } },
    { type: 'separator' },
    { label: '导出数据', click: () => mainWindow.webContents.send('shortcut:export') },
    { type: 'separator' },
    { label: '隐藏窗口', click: () => mainWindow.hide() },
    { label: '退出', click: () => app.quit() }
  ]);

  ctx.tray.setToolTip('Zinsight - 本月可用余额');
  ctx.tray.setContextMenu(contextMenu);

  ctx.tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

/**
 * Linux 菜单模板
 * Linux 没有顶部应用菜单，返回空数组即可
 * @param {object} ctx - 全局上下文
 * @returns {object[]} 菜单模板
 */
function buildMenuTemplate(ctx) {
  return [];
}

module.exports = { init, buildMenuTemplate };
