/**
 * 数据存储模块
 * 负责账单数据和配置的读写
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const isDev = !app.isPackaged;
const DATA_DIR = isDev
  ? path.join(__dirname, '..', '..', 'data')
  : path.join(app.getPath('userData'), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDefaultData() {
  return {
    records: [],
    budget: {
      monthly: 1000,
      categories: {}
    },
    reward: {
      monthly: 0
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
      includeIncomeInBalance: true
    }
  };
}

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

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = {
  readData,
  saveData,
  readConfig,
  saveConfig,
  DATA_DIR
};
