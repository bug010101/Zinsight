/**
 * IPC 通信模块
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const { readData, saveData, readConfig, saveConfig } = require('./data');

/** 生活 / 奖励 两种账户，和 ledger-core 里的约定一致 */
const bucketLabel = r => (r && r.type === 'expense' && r.bucket === 'reward') ? '奖励' : '生活';

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

  // 导出 CSV
  ipcMain.handle('data:exportCsv', async (event, records) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出账单',
      defaultPath: `账单导出_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    const BOM = '\uFEFF';
    const header = '日期,类型,分类,金额,备注,账户\n';
    const rows = records.map(r => {
      const date = r.date || '';
      const type = r.type === 'income' ? '收入' : '支出';
      const category = (r.category || '').replace(/,/g, '，');
      const amount = r.amount || 0;
      const note = (r.note || '').replace(/,/g, '，').replace(/\n/g, ' ');
      return `${date},${type},${category},${amount},${note},${bucketLabel(r)}`;
    }).join('\n');

    fs.writeFileSync(result.filePath, BOM + header + rows, 'utf-8');
    return { success: true, path: result.filePath };
  });

  // 按时间范围导出（机器学习用）
  ipcMain.handle('data:exportByRange', async (event, { startDate, endDate, format }) => {
    const data = readData();
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
      const BOM = '\uFEFF';
      const header = 'id,date,type,category,amount,note,bucket\n';
      const rows = filtered.map(r => {
        const note = (r.note || '').replace(/,/g, '，').replace(/\n/g, ' ').replace(/"/g, "'");
        const bucket = r.type === 'expense' && r.bucket === 'reward' ? 'reward' : 'life';
        return `${r.id},"${r.date}","${r.type}","${r.category}",${r.amount},"${note}","${bucket}"`;
      }).join('\n');
      fs.writeFileSync(result.filePath, BOM + header + rows, 'utf-8');
    }

    return { success: true, path: result.filePath, count: filtered.length };
  });

  // 删除指定时间范围
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
      const content = fs.readFileSync(result.filePaths[0], 'utf-8').replace(/^\uFEFF/, '');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) return { success: false, error: 'CSV 内容为空' };

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const colIdx = {};
      headers.forEach((h, i) => {
        if (h.includes('bucket') || h.includes('account') || h === '账户' || h === '归属') colIdx.bucket = i;
        else if (h.includes('date') || h === '日期') colIdx.date = i;
        else if (h.includes('type') || h === '类型') colIdx.type = i;
        else if (h.includes('category') || h === '分类') colIdx.category = i;
        else if (h.includes('amount') || h === '金额') colIdx.amount = i;
        else if (h.includes('note') || h.includes('remark') || h === '备注') colIdx.note = i;
        else if (h.includes('balance') || h.includes('include')) colIdx.include = i;
      });

      const records = [];
      for (let i = 1; i < lines.length; i++) {
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
        const accountRaw = get(colIdx.bucket).toLowerCase();

        records.push({
          id: 'rec_' + Date.now() + '_import_' + i,
          date: get(colIdx.date),
          type,
          category: get(colIdx.category),
          amount: parseFloat(get(colIdx.amount)) || 0,
          note: get(colIdx.note),
          bucket: type === 'expense' && (accountRaw === 'reward' || accountRaw === '奖励') ? 'reward' : 'life',
          includeInBalance: includeRaw !== 'false' && includeRaw !== '0',
          createdAt: new Date().toISOString()
        });
      }
      return { success: true, records };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // AI 分析
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
}

module.exports = { registerIpc };
