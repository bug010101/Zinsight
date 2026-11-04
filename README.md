# Zinsight

轻量级个人记账桌面应用，基于 Electron 开发。专注于「本月还能花多少钱」，支持预算管理、收支统计、AI 分析，数据完全本地存储。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [项目结构](#项目结构)
- [打包发布](#打包发布)
- [技术架构](#技术架构)
- [开发指南](#开发指南)

---

## 功能特性

### 核心看板
- **本月可用余额**：大字显示剩余可花金额，超支自动变色（80% 橙色 / 100% 红色）
- **月度预算**：设置每月总预算，自动计算剩余
- **分类预算**：给餐饮、交通等分类单独设上限，超支提醒
- **按天均摊**：显示"今天起平均每天还能花多少"

### 记账
- **快速记一笔**：金额 + 分类 + 备注 + 日期，回车完成
- **支出 / 收入**：一键切换，收入可选择是否计入可用余额
- **编辑 / 删除**：弹窗就地编辑，不用跳页
- **流水搜索**：按备注、分类关键词搜索
- **懒加载**：大量记录也不卡

### 统计
- **分类占比**：本月各分类支出条形图
- **每日趋势**：每天花了多少，一目了然
- **历史对比**：近 6 个月支出对比

### 数据
- **本地存储**：数据存在本地 JSON 文件，不上传任何服务器
- **导出 CSV**：导出全部或指定时间范围的数据
- **导入 CSV**：按规范格式批量导入历史记录
- **按时间导出**：支持 CSV / JSON 格式，方便机器学习分析

### AI 分析
- **聊天式问答**：直接问"我这个月餐饮花了多少""帮我分析下消费习惯"
- **本地数据**：AI 只查询你的本地数据，不泄露隐私
- **可配置**：支持任何 OpenAI 兼容的 API（DeepSeek、智谱、通义等）

### 桌面端
- **菜单栏常驻**：右上角小图标，点一下隐藏/显示窗口
- **自定义菜单栏**：快捷键快速记账、切换页面
- **窗口置顶 / 全屏**：macOS 原生体验
- **多平台**：支持 macOS / Windows / Linux

---

## 快速开始

### 环境要求
- Node.js >= 16
- npm >= 8

### 安装运行

```bash
# 克隆项目
git clone https://github.com/bug010101/Zinsight.git
cd Zinsight

# 安装依赖
npm install

# 开发模式运行（自动打开开发者工具）
npm run dev

# 正常运行
npm start
```

---

## 下载安装

从 [GitHub Releases](https://github.com/bug010101/Zinsight/releases) 下载对应平台的安装包。

### macOS 安装

1. 下载 `.dmg` 文件，打开后拖到「应用程序」文件夹
2. 因为应用没有苹果开发者签名，首次打开会被 Gatekeeper 拦截
3. 打开「终端」，执行下面这行命令解除隔离：

```bash
xattr -cr /Applications/Zinsight.app
```

4. 然后就能正常打开了。

---

## 使用指南

### 快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd + N` | 快速记一笔 |
| `Cmd + 1` | 切换到看板 |
| `Cmd + 2` | 切换到流水 |
| `Cmd + 3` | 切换到统计 |
| `Cmd + 4` | 切换到 AI 分析 |
| `Cmd + ,` | 打开设置 |

### CSV 导入格式

第一行是表头，每条记录一行，字段用英文逗号分隔：

```csv
date,type,category,amount,note,include_in_balance
2026-11-01,expense,餐饮,25.5,午餐,true
2026-11-02,income,兼职,500,周末兼职,false
```

| 字段 | 说明 | 必填 |
|---|---|---|
| `date` | 日期，格式 YYYY-MM-DD | 是 |
| `type` | `expense`=支出，`income`=收入 | 是 |
| `category` | 分类名称（需和系统里一致） | 是 |
| `amount` | 金额，数字 | 是 |
| `note` | 备注说明 | 否 |
| `include_in_balance` | 是否计入可用余额，true/false | 否（默认 true） |

> 💡 小技巧：先点「导出 CSV」导出一条记录当模板，照着改就行。

### AI 配置

1. 打开设置（`Cmd + ,`）
2. 填入你的 AI API 信息：
   - **Base URL**：例如 `https://api.deepseek.com/v1/chat/completions`
   - **API Key**：你的密钥
   - **Model**：例如 `deepseek-chat`
3. 支持任何 OpenAI 兼容的 API

---

## 项目结构

```
Zinsight/
├── main.js                    # 主进程入口（只做初始化）
├── src/
│   ├── main/                  # 主进程代码
│   │   ├── window.js          # 窗口管理 + 菜单栏
│   │   ├── data.js            # 数据存储读写
│   │   ├── ipc.js             # IPC 通信 + 导入导出
│   │   ├── preload.cjs        # 进程桥接
│   │   └── platforms/         # 平台专属逻辑
│   │       ├── index.js       # 平台选择器（自动识别）
│   │       ├── mac.js         # macOS 专属
│   │       ├── windows.js     # Windows 专属
│   │       └── linux.js       # Linux 专属
│   └── renderer/              # 渲染进程（UI）
│       └── index.html         # 全部界面
├── assets/                    # 图标资源
│   ├── dock-icon.png          # Dock / 任务栏图标
│   ├── tray-final.png         # macOS 菜单栏图标
│   └── icon.ico               # Windows 图标
├── data/                      # 数据目录（自动生成）
│   ├── ledger.json            # 账单数据
│   └── config.json            # 配置（AI Key 等）
└── .github/workflows/         # GitHub Actions
    └── release.yml            # 自动打包发布
```

---

## 打包发布

### 本地打包

```bash
# macOS → 生成 .dmg
npm run build

# Windows → 生成 .exe
npm run build:win

# Linux → 生成 .deb
npm run build:linux
```

打包结果在 `dist/` 目录。

### 国内镜像加速

打包时如果下载 Electron 慢，可以设置国内镜像：

```bash
# macOS / Linux
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm run build
```

```powershell
# Windows PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run build:win
```

### GitHub 自动打包

打 tag 后会自动触发 GitHub Actions 打包并上传到 Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

自动打包内容：
- macOS → `.dmg`
- Windows → `.exe`
- Linux → `.deb`

---

## 技术架构

### 分层设计

| 层级 | 目录 | 职责 |
|---|---|---|
| **入口层** | `main.js` | 应用启动、初始化 |
| **窗口层** | `src/main/window.js` | 窗口创建、菜单栏 |
| **数据层** | `src/main/data.js` | 数据读写、文件存储 |
| **通信层** | `src/main/ipc.js` | 进程间通信、导入导出 |
| **平台层** | `src/main/platforms/` | 各平台专属逻辑 |
| **视图层** | `src/renderer/` | UI 界面 |

新增功能只需在对应层级加文件，不用动其他层。

### 技术栈

- **Electron 33** - 桌面应用框架
- **原生 HTML / CSS / JavaScript** - 无前端框架，轻量快速
- **JSON 文件存储** - 本地数据库，零依赖
- **CommonJS 模块** - 主进程模块系统
- **ES6+ 语法** - 箭头函数、模板字符串、解构赋值等

### 数据存储路径

| 模式 | 数据路径 |
|---|---|
| 开发模式 | 项目目录下 `data/` |
| macOS 打包后 | `~/Library/Application Support/Zinsight/data/` |
| Windows 打包后 | `%APPDATA%/Zinsight/data/` |
| Linux 打包后 | `~/.config/Zinsight/data/` |

---

## 开发指南

### 代码规范

- **主进程**：CommonJS 模块（`require` / `module.exports`），ES6 语法风格
- **渲染进程**：原生浏览器 ES6 语法
- **命名**：文件名小写驼峰，常量大写

### 新增平台支持

在 `src/main/platforms/` 下新建一个文件，实现两个函数：

```js
// myplatform.js
function init(ctx) {
  // 平台专属初始化（托盘、图标等）
}

function buildMenuTemplate(ctx) {
  // 返回该平台的菜单模板
  return [];
}

module.exports = { init, buildMenuTemplate };
```

然后在 `src/main/platforms/index.js` 里加上判断即可。

---

## License

MIT
