/**
 * Zinsight 主进程入口
 * 轻量级个人记账桌面应用
 */

const { app, BrowserWindow } = require('electron');
const { createMainWindow, createAppMenu } = require('./src/main/window');
const { registerIpc } = require('./src/main/ipc');
const platform = require('./src/main/platforms');

const ctx = {
  mainWindow: null,
  tray: null
};

app.whenReady().then(() => {
  // 平台专属初始化（Dock 图标、托盘等）
  platform.init(ctx);

  // 创建主窗口
  ctx.mainWindow = createMainWindow();

  // 创建菜单栏
  const platformMenu = platform.buildMenuTemplate(ctx);
  createAppMenu(ctx.mainWindow, platformMenu);

  // 注册 IPC 通信
  registerIpc(ctx.mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ctx.mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 保持菜单栏常驻，不退出
});
