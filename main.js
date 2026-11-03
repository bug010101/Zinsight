const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// 数据文件路径：开发模式放项目目录，打包后放系统标准位置
const isDev = !app.isPackaged;
const DATA_DIR = isDev
  ? path.join(__dirname, 'data')
  : path.join(app.getPath('userData'), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 默认数据
function getDefaultData() {
  return {
    records: [],      // 所有账单记录
    budget: {         // 预算设置
      monthly: 1000,  // 月度总预算
      categories: {}  // 分类预算 {餐饮: 300, 交通: 100}
    },
    categories: ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '教育', '其他'],
    createdAt: new Date().toISOString()
  };
}

function getDefaultConfig() {
  return {
    ai: {
      apiKey: '',
      baseUrl: '',
      model: ''
    },
    settings: {
      includeIncomeInBalance: true  // 可用余额是否计入收入
    }
  };
}

// 读取数据
function readData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getDefaultData(), null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return getDefaultData();
  }
}

// 保存数据
function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 读取配置
function readConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(getDefaultConfig(), null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return getDefaultConfig();
  }
}

// 保存配置
function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'Zinsight',
    icon: path.join(__dirname, 'assets', 'dock-icon.png'),
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // 开发模式打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// 创建菜单栏图标
function createTray() {
  const { nativeImage } = require('electron');
  // 菜单栏图标用模板图标模式，自动适配深色/浅色
  // 用 2x 尺寸源图，系统自动缩放到合适大小，更清晰
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-final.png'));
  icon.setTemplateImage(true);  // 模板图标，自动着色

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 Zinsight', click: () => mainWindow.show() },
    { label: '快速记一笔', click: () => { mainWindow.show(); mainWindow.webContents.send('shortcut:quickAdd'); } },
    { type: 'separator' },
    { label: '导出数据', click: () => mainWindow.webContents.send('shortcut:export') },
    { type: 'separator' },
    { label: '隐藏窗口', click: () => mainWindow.hide() },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.setToolTip('Zinsight - 本月可用余额');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

app.whenReady().then(() => {
  // 设置应用名称
  app.setName('Zinsight');

  // 设置 Dock 图标（macOS）
  if (process.platform === 'darwin') {
    const { nativeImage } = require('electron');
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'dock-icon.png'));
    app.dock.setIcon(dockIcon);
  }

  createWindow();
  createTray();
  createAppMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 自定义顶部菜单栏
function createAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS 应用菜单
    ...(isMac ? [{
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
    }] : []),

    // 文件菜单
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

    // 编辑菜单
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

    // 视图菜单
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

    // 窗口菜单
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

app.on('window-all-closed', () => {
  // 保持菜单栏常驻，不退出
  // if (process.platform !== 'darwin') app.quit();
});

// ========== IPC 处理 ==========

// 读取所有数据
ipcMain.handle('data:read', () => {
  return readData();
});

// 保存数据
ipcMain.handle('data:save', (event, data) => {
  saveData(data);
  return { success: true };
});

// 读取配置
ipcMain.handle('config:read', () => {
  return readConfig();
});

// 保存配置
ipcMain.handle('config:save', (event, config) => {
  saveConfig(config);
  return { success: true };
});

// 导出 CSV
ipcMain.handle('data:exportCsv', async (event, records) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出账单',
    defaultPath: `账单导出_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return { success: false, canceled: true };

  // BOM 让 Excel 正确识别 UTF-8
  const BOM = '\uFEFF';
  const header = '日期,类型,分类,金额,备注\n';
  const rows = records.map(r => {
    const date = r.date || '';
    const type = r.type === 'income' ? '收入' : '支出';
    const category = (r.category || '').replace(/,/g, '，');
    const amount = r.amount || 0;
    const note = (r.note || '').replace(/,/g, '，').replace(/\n/g, ' ');
    return `${date},${type},${category},${amount},${note}`;
  }).join('\n');

  fs.writeFileSync(result.filePath, BOM + header + rows, 'utf-8');
  return { success: true, path: result.filePath };
});

// 按时间范围导出（用于机器学习分析，支持 CSV / JSON）
ipcMain.handle('data:exportByRange', async (event, { startDate, endDate, format }) => {
  const data = readData();
  // 筛选时间范围内的记录
  const filtered = data.records.filter(r => {
    if (!r.date) return false;
    return r.date >= startDate && r.date <= endDate;
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (!filtered.length) {
    return { success: false, error: '所选时间范围内没有记录' };
  }

  const ext = format === 'json' ? 'json' : 'csv';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `导出 ${startDate} 至 ${endDate} 的数据`,
    defaultPath: `ledger_${startDate}_${endDate}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });

  if (result.canceled || !result.filePath) return { success: false, canceled: true };

  if (format === 'json') {
    // JSON 格式：完整结构化数据，适合机器学习
    const payload = {
      meta: {
        exportTime: new Date().toISOString(),
        startDate,
        endDate,
        recordCount: filtered.length,
        budget: data.budget,
        categories: data.categories
      },
      records: filtered
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  } else {
    // CSV 格式：带 BOM，方便 Excel / pandas 读取
    const BOM = '\uFEFF';
    const header = 'id,date,type,category,amount,note\n';
    const rows = filtered.map(r => {
      const note = (r.note || '').replace(/,/g, '，').replace(/\n/g, ' ').replace(/"/g, "'");
      return `${r.id},"${r.date}","${r.type}","${r.category}",${r.amount},"${note}"`;
    }).join('\n');
    fs.writeFileSync(result.filePath, BOM + header + rows, 'utf-8');
  }

  return { success: true, path: result.filePath, count: filtered.length };
});

// 删除指定时间范围内的记录
ipcMain.handle('data:deleteByRange', async (event, { startDate, endDate }) => {
  const data = readData();
  const before = data.records.length;
  data.records = data.records.filter(r => {
    if (!r.date) return true;
    return r.date < startDate || r.date > endDate;
  });
  const deleted = before - data.records.length;
  saveData(data);
  return { success: true, deleted };
});

// 删除所有记录（保留预算和分类设置）
ipcMain.handle('data:deleteAll', async () => {
  const data = readData();
  const deleted = data.records.length;
  data.records = [];
  saveData(data);
  return { success: true, deleted };
});

// 导入 CSV
ipcMain.handle('data:importCsv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入账单',
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8').replace(/^\uFEFF/, '');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { success: false, error: 'CSV 内容为空' };

    // 解析表头，判断列顺序
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const colIdx = {};
    headers.forEach((h, i) => {
      if (h.includes('date') || h === '日期') colIdx.date = i;
      else if (h.includes('type') || h === '类型') colIdx.type = i;
      else if (h.includes('category') || h === '分类') colIdx.category = i;
      else if (h.includes('amount') || h === '金额') colIdx.amount = i;
      else if (h.includes('note') || h.includes('remark') || h === '备注') colIdx.note = i;
      else if (h.includes('balance') || h.includes('include')) colIdx.include = i;
    });

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      // 简单 CSV 解析（处理带引号的字段）
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { parts.push(current); current = ''; }
        else current += ch;
      }
      parts.push(current);

      const get = (idx, def = '') => parts[idx] !== undefined ? parts[idx].trim() : def;

      const typeRaw = get(colIdx.type);
      const type = typeRaw === '收入' || typeRaw === 'income' ? 'income' : 'expense';
      const includeRaw = get(colIdx.include, 'true').toLowerCase();

      records.push({
        id: 'rec_' + Date.now() + '_import_' + i,
        date: get(colIdx.date),
        type,
        category: get(colIdx.category),
        amount: parseFloat(get(colIdx.amount)) || 0,
        note: get(colIdx.note),
        includeInBalance: includeRaw !== 'false' && includeRaw !== '0',
        createdAt: new Date().toISOString()
      });
    }
    return { success: true, records };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// AI 分析调用（转发请求到用户配置的 API）
ipcMain.handle('ai:chat', async (event, { message, contextData }) => {
  const config = readConfig();
  if (!config.ai.apiKey || !config.ai.baseUrl) {
    return { success: false, error: '请先在设置中配置 AI API Key 和 Base URL' };
  }

  try {
    const systemPrompt = `你是一个个人记账分析助手。以下是用户的记账数据：\n${JSON.stringify(contextData, null, 2)}\n\n请根据这些数据回答用户的问题，给出简洁有用的分析。用中文回答。`;

    const response = await fetch(config.ai.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`
      },
      body: JSON.stringify({
        model: config.ai.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '抱歉，没有获取到回复';
    return { success: true, reply };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
