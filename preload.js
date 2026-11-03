const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ledgerAPI', {
  // 监听菜单快捷键事件
  on: (channel, callback) => {
    const validChannels = ['shortcut:quickAdd', 'shortcut:openSettings', 'shortcut:import', 'shortcut:export', 'shortcut:navigate'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // 数据
  readData: () => ipcRenderer.invoke('data:read'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  // 配置
  readConfig: () => ipcRenderer.invoke('config:read'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  // 导入导出
  exportCsv: (records) => ipcRenderer.invoke('data:exportCsv', records),
  exportByRange: (startDate, endDate, format) => ipcRenderer.invoke('data:exportByRange', { startDate, endDate, format }),
  deleteByRange: (startDate, endDate) => ipcRenderer.invoke('data:deleteByRange', { startDate, endDate }),
  deleteAll: () => ipcRenderer.invoke('data:deleteAll'),
  importCsv: () => ipcRenderer.invoke('data:importCsv'),
  // AI
  aiChat: (message, contextData) => ipcRenderer.invoke('ai:chat', { message, contextData })
});
