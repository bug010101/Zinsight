/**
 * 窗口管理模块
 * 负责主窗口的创建和配置
 */

const { BrowserWindow, Menu } = require('electron');
const path = require('path');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'Zinsight',
    icon: path.join(__dirname, '..', '..', 'assets', 'dock-icon.png'),
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

function createAppMenu(mainWindow, platformMenu) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...platformMenu,

    {
      label: '文件',
      submenu: [
        { label: '快速记一笔', accelerator: 'Cmd+N', click: () => {
          mainWindow.show();
          mainWindow.webContents.send('shortcut:quickAdd');
        }},
        { type: 'separator' },
        { label: '导入 CSV', click: () => mainWindow.webContents.send('shortcut:import') },
        { label: '导出数据', click: () => mainWindow.webContents.send('shortcut:export') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }])
      ]
    },

    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },

    {
      label: '视图',
      submenu: [
        { label: '看板', accelerator: 'Cmd+1', click: () => mainWindow.webContents.send('shortcut:navigate', 'dashboard') },
        { label: '流水', accelerator: 'Cmd+2', click: () => mainWindow.webContents.send('shortcut:navigate', 'records') },
        { label: '统计', accelerator: 'Cmd+3', click: () => mainWindow.webContents.send('shortcut:navigate', 'stats') },
        { label: 'AI 分析', accelerator: 'Cmd+4', click: () => mainWindow.webContents.send('shortcut:navigate', 'ai') },
        { type: 'separator' },
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },

    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'unhide', label: '显示' },
        { type: 'separator' },
        { role: 'front', label: '全部置于顶层' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { createMainWindow, createAppMenu };
