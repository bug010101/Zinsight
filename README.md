# Zinsight

轻量级个人记账应用。一套逻辑、两种外壳：**桌面端（Electron）** + **安卓端（Capacitor）**。专注于「本月还能花多少钱」，支持预算管理、奖励额度、收支统计、AI 分析，数据完全本地存储。

> **当前版本 v1.4.0**：新增奖励额度系统、修复记账日期显示、强化安卓端适配。
> 默认完全离线：不内置任何云服务、第三方接口或数据上报；AI 分析是可选功能，只有你主动配置 API 才会联网。

---

## 目录

- [功能特性](#功能特性)
- [版本与更新](#版本与更新)
- [快速开始](#快速开始)
- [下载安装](#下载安装)
- [使用指南](#使用指南)
- [安卓版（APK）](#安卓版apk)
- [项目结构](#项目结构)
- [打包发布](#打包发布)
- [技术架构](#技术架构)
- [开发指南](#开发指南)

---

## 功能特性

### 核心看板
- **本月可用余额**：大字显示剩余可花金额，超支自动变色（80% 橙色 / 100% 红色）
- **月度预算**：设置每月总预算，自动计算剩余
- **奖励额度**：单独给「奖励自己」的消费设一条上限，按月恢复，不占用生活预算
- **分类预算**：给餐饮、交通等分类单独设上限，超支提醒
- **按天均摊**：显示"今天起平均每天还能花多少"

### 记账
- **快速记一笔**：金额 + 分类 + 备注 + 日期，回车完成
- **支出 / 收入**：一键切换，收入可选择是否计入可用余额
- **生活 / 奖励**：每笔记账都能选归属，默认生活消费；奖励消费只扣奖励额度
- **日期以记账日为准**：流水显示的是记账日期（如 `11-01`），改完立刻生效；安卓端另有「今天 / 昨天 / 前天」快捷按钮
- **编辑 / 删除**：弹窗就地编辑，不用跳页
- **流水搜索**：按备注、分类关键词搜索，可按生活/奖励筛选
- **懒加载**：大量记录也不卡

### 奖励系统（自我奖励）
- **独立额度池**：和月度预算完全分开，`可用余额 = 预算 + 计入余额收入 − 生活支出`，奖励消费一分钱都不动它
- **每月重置**：额度每月 1 号自动恢复，不会累积成"存着不用浪费"
- **单独统计**：看板奖励卡有剩余额度、已用比例、日均可用；超支卡片变红
- **分类分布**：统计页单独有一块「本月奖励消费分布」
- **CSV 兼容**：导出多一列「账户」，导入时自动识别 `奖励/生活`，老 CSV 照样能导

### 统计
- **分类占比**：本月各分类支出条形图
- **每日趋势**：每天花了多少，一目了然
- **历史对比**：近 6 个月支出对比

### 数据与隐私
- **本地存储**：数据存在本地 JSON 文件，不上传任何服务器
- **默认零外发**：不内置云服务、第三方接口、反馈上报、埋点或推送；断网也能完整记账、统计、导入导出
- **导出 CSV**：导出全部或指定时间范围的数据
- **导入 CSV**：按规范格式批量导入历史记录
- **按时间导出**：支持 CSV / JSON 格式，方便机器学习分析

### AI 分析（可选）
- **按需联网**：设置里留空就是纯离线；只有填了 API 配置才会联网
- **聊天式问答**：直接问"我这个月餐饮花了多少""帮我分析下消费习惯"
- **本地数据**：AI 只查询你的本地数据，不泄露隐私
- **可配置**：支持任何 OpenAI 兼容的 API（DeepSeek、智谱、通义等）

### 桌面端
- **菜单栏常驻**：右上角小图标，点一下隐藏/显示窗口
- **自定义菜单栏**：快捷键快速记账、切换页面
- **窗口置顶 / 全屏**：macOS 原生体验
- **多平台**：支持 macOS / Windows / Linux

### 安卓端
- **同一套功能**：看板、流水、统计、AI 分析、设置全都在
- **手机布局**：顶部标题栏 + 底部 5 个页签 + 底部弹层记账
- **触控友好**：44px 以上点击区、分类用 chips 点选、数字键盘输入
- **系统分享导出**：CSV / JSON 直接存到手机或发到微信、邮箱
- **同源数据**：和桌面端使用同一份记账逻辑，算出来的数一模一样

---

## 版本与更新

版本号只维护一处：`package.json` 的 `version`。桌面端安装包由 electron-builder 读取它；安卓端的 `versionName` / `versionCode` 由 `scripts/android-version.js` 同步（`1.4.0` → `versionCode 10400`）。打 tag 触发 CI 时，会先校验 tag 与 `package.json` 版本一致，避免 Release 名和包内版本对不上。

### v1.4.0（新增功能 + Bug 修复）

| 类型 | 内容 |
|---|---|
| 新增 | 奖励额度系统：独立额度池、按月重置、记账可选归属、看板与统计单独展示、CSV 增加归属列 |
| 修复 | 改了记账日期后列表仍显示当天（时间取的是创建时间）；桌面端默认日期在早 8 点前会变成昨天 |
| 改进 | 安卓端刘海安全区、软键盘、320px 小屏、横屏、长分类名与大金额溢出；记账日期快捷选择 |
| 调整 | 全程本地、零外发：不内置任何云服务、第三方接口或外部跳转 |

历史版本见 [GitHub Releases](https://github.com/bug010101/Zinsight/releases)。

---

## 快速开始

### 环境要求
- Node.js >= 22（Capacitor 8 的要求；本地与 CI 统一使用 22）
- npm >= 8
- 安卓打包不需要本地环境，交给 GitHub Actions

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

### 安卓安装（APK）

1. 打开仓库的 **Actions → Android APK**，取最新一次 `Zinsight-x.y.z-android.apk`
   （也可以从 [Releases](https://github.com/bug010101/Zinsight/releases) 直接下）
2. 把 APK 传到手机（微信文件传输助手 / 数据线 / 网盘都行）
3. 点开安装，系统提示「未知来源应用」时允许即可
4. 这个包用 debug 签名，个人自用、侧载安装完全没问题；上架应用商店才需要正式签名

> 打包在 GitHub 的机器上完成，本地不用装 Android Studio、SDK 或 JDK。

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
date,type,category,amount,note,include_in_balance,bucket
2026-11-01,expense,餐饮,25.5,午餐,true,life
2026-11-02,income,兼职,500,周末兼职,false,life
2026-11-05,expense,娱乐,199,买个新游戏,true,reward
```

| 字段 | 说明 | 必填 |
|---|---|---|
| `date` | 日期，格式 YYYY-MM-DD | 是 |
| `type` | `expense`=支出，`income`=收入 | 是 |
| `category` | 分类名称（需和系统里一致） | 是 |
| `amount` | 金额，数字 | 是 |
| `note` | 备注说明 | 否 |
| `include_in_balance` | 是否计入可用余额，true/false | 否（默认 true） |
| `bucket` | 归属：`life`=生活消费，`reward`=奖励消费（也认 `生活`/`奖励`、`account`/`账户`） | 否（默认 life） |

> 💡 小技巧：先点「导出 CSV」导出一条记录当模板，照着改就行。

表头中英文都认：`date / 日期`、`type / 类型`、`category / 分类`、`amount / 金额`、`note / 备注`、`bucket / account / 账户 / 归属`。两种导出的表头不同，但都能直接导回去：

| 导出方式 | 表头 | 归属列 |
|---|---|---|
| 导出全部 CSV | `日期,类型,分类,金额,备注,账户` | 中文 `生活` / `奖励` |
| 按时间范围导出 | `id,date,type,category,amount,note,bucket` | 英文 `life` / `reward` |

`include_in_balance` 是可选的导入字段，导出时不带；不写就默认 `true`。老版本导出的 CSV 没有归属列，导入后一律按「生活消费」处理。

### AI 配置

1. 打开设置（`Cmd + ,`）
2. 填入你的 AI API 信息：
   - **Base URL**：例如 `https://api.deepseek.com/v1/chat/completions`
   - **API Key**：你的密钥
   - **Model**：例如 `deepseek-chat`
3. 支持任何 OpenAI 兼容的 API

> 全部留空就是纯离线模式。应用不会主动联网，只有你在 AI 页发起提问、且配置已填好时才会请求对应接口。

### 奖励额度怎么用

「奖励额度」是给"奖励自己"的那部分消费单独开的额度池，和月度预算完全分开：

1. 设置 → 预算设置 → 填「月度奖励额度」，比如 300
2. 记账时选「奖励消费」（默认是「生活消费」）
3. 看板第二张卡片就是奖励额度：剩余 ¥、已用进度、日均可用；超了会变红

两条账互不干扰：

```
可用余额 = 月度生活预算 + 计入余额的收入 − 生活消费
奖励剩余 = 月度奖励额度 − 奖励消费
```

也就是说，买那件"奖励自己"的东西时，生活余额一分都不会掉，但奖励额度会掉；
额度用完了看板会提示「已超额」，下个月 1 号自动恢复。

---

## 安卓版（APK）

安卓端不是把桌面窗口塞进手机，而是**同一套业务逻辑 + 另写一层手机 UI**：

```
┌──────────────────────────────────────────────────────────┐
│  桌面端：src/renderer/index.html   （Electron 窗口）      │
│  安卓端：src/renderer/mobile/      （Capacitor WebView）  │
│              ↓ 两边共用 ↓                                 │
│  src/renderer/shared/ledger-core.js                       │
│  预算/余额/分类统计/趋势/CSV 编解码 —— 纯函数，无平台依赖 │
└──────────────────────────────────────────────────────────┘
```

原生能力走 `src/renderer/mobile/app.js` 里的「桥」：

| 能力 | 桌面端 | 安卓端 |
|---|---|---|
| 数据存储 | `userData/data/*.json` | App 私有目录 `files/zinsight/*.json` |
| 导出文件 | 系统「另存为」对话框 | 写缓存 + 系统分享面板（可存到手机/发微信） |
| 导入 CSV | 文件选择框 | 文件选择 + 粘贴文本双通道 |
| AI 请求 | 主进程 fetch（无跨域） | `CapacitorHttp` 原生请求（绕过 WebView 跨域） |

样式按 Android（Material 3）重做：底部导航、44px 触控区、底部弹层记账、分类 chips、Snackbar 提示、自定义确认框（WebView 的 `alert` 不可靠，所以全部自己实现）。

**屏幕适配**：`viewport-fit=cover` + `--safe-area-inset-*`（含左右 inset）处理刘海/状态栏/手势条；键盘弹出用 `interactive-widget=resizes-content` 压缩视口而不是把输入框顶飞；看板统计卡、条形图、分类预算行、双列日期输入都改成 `minmax(0,1fr)` + 省略号，320px 小屏和横屏都不会溢出。记账日期输入补了「今天 / 昨天 / 前天」快捷按钮和 `change` 兜底，避免个别 WebView 回写不及时。

### 本地跑安卓端（可选）

CI 打包用的是 `@capacitor/cli` 的标准流程，本地想调试也可以，但**需要装 Android Studio**，不装就只用 CI：

```bash
npm install
npm run build:www      # 把移动端页面打进 www/
npm run android:init   # 生成 android/ 原生工程 + 换图标
npm run android:open   # 用 Android Studio 打开
```

改完 `src/renderer/mobile/` 里的代码后，执行 `npm run android:sync` 同步进原生工程。

> 浏览器里预览移动端页面：`npm run build:www` 后用任意静态服务器打开 `www/`，
> 会自动降级成 localStorage 存储，看 UI 足够了。

---

## 项目结构

```
Zinsight/
├── main.js                    # 主进程入口（只做初始化）
├── capacitor.config.json      # 安卓壳配置（appId / webDir）
├── src/
│   ├── main/                  # 主进程代码（桌面端）
│   │   ├── window.js          # 窗口管理 + 菜单栏
│   │   ├── data.js            # 数据存储读写
│   │   ├── ipc.js             # IPC 通信 + 导入导出
│   │   ├── preload.cjs        # 进程桥接
│   │   └── platforms/         # 平台专属逻辑
│   │       ├── index.js       # 平台选择器（自动识别）
│   │       ├── mac.js         # macOS 专属
│   │       ├── windows.js     # Windows 专属
│   │       └── linux.js       # Linux 专属
│   └── renderer/
│       ├── index.html         # 桌面端界面（全部 UI + 逻辑）
│       ├── shared/
│       │   └── ledger-core.js # ★ 两端共用的计算内核（纯函数）
│       └── mobile/            # 安卓端界面
│           ├── index.html     # 结构（AppBar / 5 个视图 / 底部弹层）
│           ├── styles.css     # Material 3 风格样式
│           └── app.js         # 交互逻辑 + 原生能力桥接
├── scripts/
│   ├── build-www.js           # 组装 www/（esbuild 打包 + 拷贝资源）
│   ├── android-version.js     # 把 package.json 版本写进安卓 versionName / versionCode
│   ├── android-icons.js       # 把启动图标铺进原生工程
│   └── test-core.js           # 逻辑内核自测（node 直接跑）
├── resources/android/         # 安卓启动图标（各密度）
├── assets/                    # 图标资源
│   ├── dock-icon.png          # Dock / 任务栏图标（1024，安卓图标源）
│   ├── tray-final.png         # macOS 菜单栏图标
│   └── icon.ico               # Windows 图标
├── www/                       # 安卓 Web 产物（构建生成，不入库）
├── android/                   # 安卓原生工程（构建生成，不入库）
├── data/                      # 数据目录（自动生成）
│   ├── ledger.json            # 账单数据
│   └── config.json            # 配置（AI Key 等）
└── .github/workflows/
    ├── release.yml            # 桌面三平台自动打包
    └── android-apk.yml        # 安卓 APK 自动打包
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
git tag v1.4.0
git push origin v1.4.0
```

> tag 必须和 `package.json` 里的版本号一致，CI 会校验，不一致直接失败——这样 Release 名、安装包内版本、APK 的 `versionName` 三者一定对得上。

自动打包内容：
- macOS → `.dmg`
- Windows → `.exe`
- Linux → `.deb`
- Android → `.apk`

### 安卓 APK 打包

APK 由 `.github/workflows/android-apk.yml` 在 GitHub 的机器上编译，**本地什么都不用装**。

两种触发方式：

| 方式 | 操作 | 结果 |
|---|---|---|
| 打 tag | `git tag v1.4.0 && git push origin v1.4.0` | 出 APK 并自动挂到 Release |
| 手动 | Actions → Android APK → Run workflow | 出 APK 存在 Artifact，保留 30 天 |

完整流程：`npm run test:core`（逻辑自测）→ `build:www`（打包页面）→ `cap add android`（生成原生工程）→ `android-version.js`（写版本）→ 替换图标 → `cap sync android` → `gradlew assembleDebug`（出 APK）。
桌面端三条打包线也会先跑自测；产物没生成时上传步骤会直接失败，不会出现「构建绿了但 Release 里没文件」。

> **想改成正式签名的 release 包**：在仓库 Secrets 里放 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`，再在 workflow 里加一步解出 keystore 并配 `signingConfigs`，`assembleDebug` 换成 `assembleRelease` 即可。

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
| **逻辑层** | `src/renderer/shared/ledger-core.js` | 两端共用的计算内核（纯函数） |
| **视图层** | `src/renderer/index.html` | 桌面端 UI |
| **移动视图层** | `src/renderer/mobile/` | 安卓端 UI + 原生能力桥接 |

新增功能只需在对应层级加文件，不用动其他层。
`ledger-core.js` 是安卓端与 `npm run test:core` 共用的计算内核；桌面端把同一套口径写在 `index.html` 的内联脚本里（同样是纯函数、无平台依赖）。
**改计算口径必须两端同步改**，再跑 `npm run test:core`，并在两端页面实际点一遍确认行为一致——桌面端不会自动加载 `ledger-core.js`。

### 技术栈

- **Electron 33** - 桌面应用框架
- **Capacitor 8** - 把同一份 Web 页面装进安卓原生壳，产出 APK
- **原生 HTML / CSS / JavaScript** - 无前端框架，轻量快速
- **JSON 文件存储** - 本地数据库，零依赖
- **CommonJS / ESM** - 主进程用 CommonJS，移动端用 ESM 由 esbuild 打包
- **esbuild** - 只做一件事：把移动端页面和依赖打成一个 IIFE 文件

### 数据存储路径

| 模式 | 数据路径 |
|---|---|
| 开发模式 | 项目目录下 `data/` |
| macOS 打包后 | `~/Library/Application Support/Zinsight/data/` |
| Windows 打包后 | `%APPDATA%/Zinsight/data/` |
| Linux 打包后 | `~/.config/Zinsight/data/` |
| 安卓 | App 私有目录 `files/zinsight/`（卸载即清除，注意先导出备份） |

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
