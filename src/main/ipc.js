/**
 * IPC 通信模块
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const Core = require('../renderer/shared/ledger-core.js');
const AiContext = require('../renderer/shared/ai/index.js');
const { readData, saveData, readConfig, saveConfig } = require('./data');

function registerIpc(mainWindow) {
  // 数据读写
  ipcMain.handle('data:read', () => readData());
  ipcMain.handle('data:save', (event, data) => {
    saveData(data);
    return { success: true };
  });

  // 配置读写
  ipcMain.handle('config:read', () => readConfig());
  ipcMain.handle('config:save', (event, config) => {
    saveConfig(config);
    return { success: true };
  });

  // 导出 CSV：格式由共享内核唯一定义，与安卓端「导出全部」输出完全一致
  ipcMain.handle('data:exportCsv', async (event, records) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出账单',
      defaultPath: `账单导出_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    fs.writeFileSync(result.filePath, Core.buildFullCsv(records), 'utf-8');
    return { success: true, path: result.filePath };
  });

  // 按时间范围导出（机器学习用）
  ipcMain.handle('data:exportByRange', async (event, { startDate, endDate, format }) => {
    const data = readData();
    const filtered = data.records.filter(record => {
      if (!record.date) return false;
      return record.date >= startDate && record.date <= endDate;
    }).sort((firstRecord, secondRecord) => firstRecord.date.localeCompare(secondRecord.date));

    if (!filtered.length) {
      return { success: false, error: '所选时间范围内没有记录' };
    }

    const extension = format === 'json' ? 'json' : 'csv';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `导出 ${startDate} 至 ${endDate} 的数据`,
      defaultPath: `ledger_${startDate}_${endDate}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    // CSV / JSON 的生成同样只走共享内核，避免两端格式慢慢漂移
    const content = format === 'json'
      ? Core.buildRangeJson(filtered, {
        exportTime: new Date().toISOString(),
        startDate,
        endDate,
        recordCount: filtered.length,
        budget: data.budget,
        categories: data.categories
      })
      : Core.buildRangeCsv(filtered);
    fs.writeFileSync(result.filePath, content, 'utf-8');

    return { success: true, path: result.filePath, count: filtered.length };
  });

  // 删除指定时间范围
  ipcMain.handle('data:deleteByRange', async (event, { startDate, endDate }) => {
    const data = readData();
    const before = data.records.length;
    data.records = data.records.filter(record => {
      if (!record.date) return true;
      return record.date < startDate || record.date > endDate;
    });
    const deleted = before - data.records.length;
    saveData(data);
    return { success: true, deleted };
  });

  // 删除全部
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
      // 导入解析同样只走共享内核：中英文表头、引号包裹、归属列、坏行跳过
      // 都由 ledger-core.js 统一处理，避免桌面端与安卓端解析出不同结果。
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const parsed = Core.parseCsv(content);
      if (!parsed.success) return { success: false, error: parsed.error };
      return { success: true, records: parsed.records };
    } catch (caughtError) {
      return { success: false, error: caughtError.message };
    }
  });

  // AI 分析
  ipcMain.handle('ai:chat', async (event, { message, contextData, history }) => {
    const config = readConfig();
    if (!config.ai.apiKey || !config.ai.baseUrl) {
      return { success: false, error: '请先在设置中配置 AI API Key 和接口地址' };
    }
    // 设置页允许只填 base，这里统一补成完整的 chat/completions 端点
    const url = Core.normalizeAiEndpoint(config.ai.baseUrl);
    // 视图层已按问题裁剪好上下文；旧结构 / 缺失时由共享模块统一兜底重建，
    // 空对象表示「测试连接」，保持原样不塞账本数据。
    const context = AiContext.ensureAiContext(contextData, () => readData(), message);
    const messages = AiContext.buildAiMessages(context, message, history);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.ai.apiKey}`
        },
        body: JSON.stringify({
          model: config.ai.model || 'gpt-3.5-turbo',
          messages,
          temperature: 0.7
        })
      });

      const raw = await response.text();
      if (!response.ok) {
        return { success: false, error: Core.formatAiError(response.status, raw) };
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        return { success: false, error: '接口返回的不是 JSON：' + raw.slice(0, 120) };
      }
      const reply = data.choices?.[0]?.message?.content || '抱歉，没有获取到回复';
      return { success: true, reply };
    } catch (caughtError) {
      return { success: false, error: (caughtError && caughtError.message) || '请求失败' };
    }
  });
}

module.exports = { registerIpc };
