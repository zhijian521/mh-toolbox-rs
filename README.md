# 梦幻养老助手 · Rust 版

> **这是 Rust 重写版，稳定版在 [`zhijian521/mh-toolbox`](https://github.com/zhijian521/mh-toolbox)。**
> 那个仓库冻结保留，继续给朋友用；它是本项目的差分测试基准与数据兼容基准。

梦幻西游端游的养成记账工具。技术栈 Rust + Tauri 2 + Vue 3 + SQLite，
界面走「账簿」方向：宣纸底、墨字、朱红印章、结构靠线不靠阴影。

## 当前状态（2026-10-30）

骨架已起，只有一个页面。

| 已完成       | 说明                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 窗口 | 1280×820，最小 1024×680，居中；productName `梦幻养老助手`，identifier `com.zhijian.mhtoolbox.rs`                       |
| IPC 通路     | `app_info` 命令，前端经 `src/services/desktop.ts` 调用（渲染层唯一允许碰系统的地方）                                   |
| 设置页       | 主题三档 + 字号三档（滑块）+ 组件预览（色板 / 字号 / 按钮 / 凹槽胶囊 / 两格开关 / 勾选 / 印章 / 金额 / 文武线 + 账线） |
| 设计语言     | `design/tokens.css`、`design/base.css`、`design/income.html`（收益页样张，只读参考）                                   |

未开始：数据层（SQLite）、领域层、其余七个页面、OCR、e2e。

**字体与字号都只有一条通路。** 全站唯一字体是霞鹜文楷（不再与黑体混排）；八档字号全部写成
`calc(Npx * var(--fs-scale))`，设置页的三档滑块只改 `--fs-scale` 一个变量（0.92 / 1 / 1.1）。
连左栏宽度、印章尺寸也跟着缩放——否则放大字号时「梦幻养老助手」会被截成「梦幻养…」。

## 目录

```
├── src/                  Vue 前端
│   ├── components/       SealMark / SegmentedPills / SlotButton / VerticalSlider / CostSwitch /
│   │                     BaseCheck / LedgerSection / FontSizeSlider / TitleBar / PageHeader /
│   │                     AppRail / AppIcon（图标走 tabler，只维护名字映射）
│   ├── composables/      use-theme（主题）/ use-font-scale（字号三档）/
│   │                     use-roving-focus（单选组键盘）/ use-app-info（版本）
│   ├── services/         desktop.ts —— 渲染层唯一的系统能力出口
│   ├── styles/           tokens.css（令牌）/ base.css（重置 + `.well` 凹槽 + 胶囊）/
│   │                     blocks.css（页面级版式）
│   └── views/            SettingsView
├── src-tauri/            Rust 壳（窗口、命令、能力配置）
├── design/               设计语言样张与令牌原件
└── assets/fonts/         霞鹜文楷 Screen（全量 9.8 MB，不子集化，OFL 1.1）
```

工程约定单独成文，开工前先读这两份：

- **[`AGENTS.md`](AGENTS.md)** — 本机环境硬约束（沙箱能做什么、不能做什么）、验证方式、红线、明确不做的事
- **[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)** — 工程规范、全仓审查发现、分批落地计划

质量门只有一条命令：

```bash
npm run check    # format:check + lint + typecheck
```

## 启动

双击根目录的 **`start.bat`** 即可。它会自己补齐 MSVC 的 `LIB` 与 `PATH`（原因见文末
「Windows 上编译必须先设环境」），然后起窗口。

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222（供 e2e / 实拍）
start.bat --check    只做环境自检，不启动
start.bat --force    遇到占用或残留实例时直接处理，不询问
```

它做四件事，每件都对应一个真踩过的坑：

1. **按目录探测 MSVC 与 Windows SDK 的最新版本**，不写死版本号——装了新 BuildTools 或新 SDK
   之后脚本不用改。
2. **并行度压到 4**（`CARGO_BUILD_JOBS`）。本机 rustc 高并发编译时崩过
   `STATUS_ACCESS_VIOLATION`，这是编译器进程崩，不是代码错。
3. **独占资源预检：窗口实例 + 5173 端口**。这是启动失败最常见的原因，两条都要查。
   `vite.config.ts` 开了 `strictPort`，5173 被占时 Vite 不换端口而是直接退出，
   `tauri dev` 只会抛一句 `Error The "beforeDevCommand" terminated with a non-zero status
code.`——完全不提端口。脚本会把占用者 PID 打出来并询问是否结束，**只结束 `node.exe`**，
   别的进程一律不动；结束之后还会**轮询等端口真正释放**（最多 10 秒），
   避免 kill 完立刻 bind 的偶发失败。
4. **`System32` 显式提到 PATH 前段**。从 Git Bash 里调用本脚本时，PATH 里混着 Git 的
   `usr/bin`，同名的 `timeout.exe` 会抢在 Windows 的 `timeout` 前面被调用。

启动失败时脚本不再只丢一个退出码，而是列出三条对应的排查方向（谁抢了 5173 / rustc 报错 /
target 目录被占用）。

> **`start.bat` 必须保存为 GBK(936) 编码 + CRLF 换行。** 存成 UTF-8 时 cmd 会按双字节切行，
> 中文注释被拆成命令，报一堆「xxx 不是内部或外部命令」，而且报错位置与真实问题毫无关系。
> 用 VSCode 编辑时确认右下角是 `GB 2312` 与 `CRLF`。
>
> 在 Git Bash 里请用 `cmd //c start.bat`；直接在 mintty 里跑会因编码不同显示成乱码
> （不影响功能）。非交互终端下无法弹询问，脚本会提示改用 `--force`。

## 开发

```bash
npm install
npm run dev            # 只跑前端（浏览器里可看 UI，但没有 Rust 侧）
npm run desktop        # 起 Tauri 窗口（vite + cargo run）
npm run build          # 类型检查 + 构建前端
npm run desktop:build  # 打包
```

直接跑 `npm run desktop` 需要先按文末手动设好环境；`start.bat` 就是这一步的封装。

### 调试端口（e2e 的唯一通道）

WebView2 支持 CDP，但**必须由代码把参数递进去**：Tauri 建 webview 时会显式传自己的
`additional_browser_args`，把环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 整个盖掉。
所以窗口从 `tauri.conf.json` 挪到了 `src-tauri/src/lib.rs` 的 `create_main_window()`，
只有 debug 构建才读 `MH_CDP_PORT`（发布版不含调试端口）。

```bash
MH_CDP_PORT=9222 npm run desktop                  # 起带调试端口的窗口
curl --noproxy '*' http://127.0.0.1:9222/json/list # 拿到 webSocketDebuggerUrl
```

连上后 `Runtime.evaluate` 等价于旧版的 `executeJavaScript`，`Page.captureScreenshot`
直接抓真窗口——以后 e2e 就走这条，断言仍是 DOM + invoke 返回值。

### Windows 上编译必须先设环境（本机实测）

`vcvars64.bat` 依赖 `reg.exe`，而它在沙箱黑名单里，LIB 补不全 → 链接报
`LNK1181: 无法打开 kernel32.lib`。另外 Git Bash 自带的 `usr/bin/link.exe` 是 Unix 的
`link` 命令，会抢在 MSVC 前面被调用。所以手动设：

```bash
export PATH="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64:/c/Users/pc/.cargo/bin:$PATH"
export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64"
```

crates 走中科大镜像（`~/.cargo/config.toml` 的 source replace，直连与代理在本机均不通）。

## 红线

1. **数据目录固定 `%APPDATA%\mh-tool-v2`**，与旧版共用；Tauri 默认会写到
   `%APPDATA%\<identifier>`，必须显式指回，否则朋友升级后数据「消失」。
2. **identifier 必须与旧版 appId 不同**，否则 Windows 会把两个安装包当成同一个应用互相覆盖。
3. 数据层落地后必须做 **SQLite → JSON 反向镜像**，否则一旦转换就退不回旧版。
4. 卸载不删数据（`deleteAppDataOnUninstall` 保持 false）。

## 许可

PolyForm Noncommercial 1.0.0（沿用旧版）。字体为 SIL OFL 1.1，`assets/fonts/OFL.txt` 随字体保留。
