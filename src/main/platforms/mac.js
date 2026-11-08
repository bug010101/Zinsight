/**
 * macOS 专属逻辑
 * - Dock 图标设置
 * - 应用菜单（顶部菜单栏最左边的 Zinsight 菜单）
 * - 模板图标（自动适配深色/浅色）
 */

const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

/**
 * macOS 平台初始化
 * @param {object} ctx - 全局上下文（mainWindow、tray 等）
 */
function init(ctx) {
  const { mainWindow } = ctx;

  // 设置应用名称
  app.setName('Zinsight');

  // 设置 Dock 图标
  const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', '..', '..', 'assets', 'desktop', 'dock-icon.png'));
  app.dock.setIcon(dockIcon);

  // 创建托盘图标（菜单栏）
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', '..', 'assets', 'desktop', 'tray-final.png'));
  icon.setTemplateImage(true);  // 模板图标，自动着色

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
 * 创建 macOS 应用菜单（顶部菜单栏）
 * @param {object} ctx - 全局上下文
 * @returns {object[]} 菜单模板
 */
function buildMenuTemplate(ctx) {
  const { mainWindow } = ctx;

  return [
    // macOS 专属：应用菜单（最左边的 Zinsight 菜单）
    {
      label: 'Zinsight',
      submenu: [
        { role: 'about', label: '关于 Zinsight' },
        { type: 'separator' },
        { label: '偏好设置', accelerator: 'Cmd+,', click: () => {
          mainWindow.webContents.send('shortcut:openSettings');
        }},
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Zinsight' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Zinsight' }
      ]
    }
  ];
}

module.exports = { init, buildMenuTemplate };
