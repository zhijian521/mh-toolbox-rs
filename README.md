# 梦幻养老助手 · Rust 版

> **这是 Rust 重写版，稳定版在 [`zhijian521/mh-toolbox`](https://github.com/zhijian521/mh-toolbox)。**
> 那个仓库冻结保留，继续给朋友用；它是本项目的差分测试基准与数据兼容基准。

梦幻西游端游的养成记账工具。技术栈 Rust + Tauri 2 + Vue 3 + SQLite，
界面走「账簿」方向：宣纸底、墨字、朱红作记、结构靠线不靠阴影。

## 当前状态（2026-11-01）

八个导航页都有路由，其中**设置页与工具页有内容**，其余六页是占位；工具页下挂子页
（捉鬼助手 `/tools/ghost`，可用）。另有一张不进导航的开发页 `#/dev`，
入口是**三连击左栏顶部的标**。

| 已完成       | 说明                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 窗口 | 1280×820，最小 1024×780，居中；productName `梦幻养老助手`，identifier `com.zhijian.mhtoolbox.rs`                                               |
| IPC 通路     | `app_info` 命令，前端经 `src/services/desktop.ts` 调用；捉鬼的 `ghost_*` 命令经 `src/services/ghost.ts`                                        |
| 路由         | `vue-router` + hash 模式；`src/navigation.ts` 是真源，路由与左栏都由它派生；工具子路由来自 `src/tools.ts`。`/equipment` 重定向到 `/characters` |
| 设置页       | 外观（主题 / 字号）+ 关于，两块卡片，宽度够时并排                                                                                              |
| 工具页       | 桌面图标式启动器：92px 格子、56px 压印图标块（`PressTile`）、名称在下，没有副标题                                                              |
| 捉鬼助手     | 截屏 + 本地 OCR（PP-OCRv4，缺模型退回系统 OCR）读任务栏的假坐标，在底图上画该往哪找；ROI 按显示器 DPI 换算                                     |
| 设计语言     | `src/styles/tokens.css` / `base.css` / `blocks.css`（唯一真源）、`design/income.html`（收益页样张，直接引同一份 CSS）                          |

未开始：数据层（SQLite）、领域层、六个尚未写的业务页、e2e。

**字体与字号都只有一条通路。** 全站唯一字体是霞鹜文楷（不再与黑体混排；裁到 GB2312 全集，
越界的生僻字才回退雅黑）；六档字号全部写成
`calc(Npx * var(--fs-scale))`，设置页的三档滑块只改 `--fs-scale` 一个变量（0.92 / 1 / 1.1）。
连左栏宽度、区块标的尺寸也跟着缩放——否则放大字号时「梦幻养老助手」会被截成「梦幻养…」。

## 目录

```
├── src/                  Vue 前端
│   ├── components/       控件与外壳件：AppRail / AppIcon / PressTile / SlotButton /
│   │                     SegmentedPills / CostSwitch / SteppedSlider / VerticalSlider /
│   │                     FontSizeSlider / PageHeader / PageShell / TitleBar / LedgerSection
│   │                     ghost/MapCanvas（底图与范围绘制）；icons.ts 只维护名字到 tabler 映射
│   ├── composables/      use-theme / use-font-scale / use-roving-focus / use-app-info /
│   │                     use-ghost-watch
│   ├── services/         系统能力与纯规则：desktop（唯一外壳出口）/ ghost（IPC 契约）/
│   │                     ghost-maps / ghost-parse / ghost-model / ghost-hold（可单测的纯函数）
│   ├── styles/           tokens.css（令牌）/ base.css（重置 + `.well` 凹槽 + 印面）/
│   │                     blocks.css（页面级版式）
│   └── views/            SettingsView + settings/（外观、关于）/ ToolsView/tools/
│                         （捉鬼助手）/ dev/（开发帮助，5 张卡）/ PlaceholderView
├── src-tauri/            Rust 壳（窗口、命令、截屏、OCR、能力配置）
├── docs/                 ARCHITECTURE / CONVENTIONS / RECORD / GHOST-HUNT
├── scripts/              质量门小工具：版本号一致、提交信息
├── tools/probe/          CDP 探针（截图 / 量几何 / 量启动；内置静态服务与防翻车前提）
├── tools/font/           字体子集脚本（全量 9.8 MB → 1.75 MB，见脚本头部）
├── .github/workflows/    CI：npm run check + cargo fmt --check + Windows cargo test --lib
├── design/               设计语言样张与图标源（.py 生成脚本）
└── assets/               霞鹜文楷 Screen（GB2312 子集 1.75 MB + 全量原件，OFL 1.1）+ 牌记 PNG
```

工程约定单独成文，开工前先读这四份：

- **[`AGENTS.md`](AGENTS.md)** — 本机环境硬约束（沙箱能做什么、不能做什么）、验证方式、红线、明确不做的事
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — 分层、数据流、IPC 边界、crate 划分、数据兼容红线
- **[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)** — 现在该怎么写：命名、分层、样式语言、控件契约、验收方式
- **[`docs/RECORD.md`](docs/RECORD.md)** — 过程记录：全仓审查的原始发现与十六个小批的落地历史

质量门只有一条命令，本机与 GitHub Actions 跑的是同一条：

```bash
npm run check    # format:check + lint + typecheck + test + check:version + lint:commits
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
export PATH="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64:$HOME/.cargo/bin:$PATH"
export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64"
```

crates 走中科大镜像（`~/.cargo/config.toml` 的 source replace，直连与代理在本机均不通）。

## 红线

**红线只有一份，在 [`AGENTS.md` §六](AGENTS.md#六红线改代码前必须知道)。** 六条：数据目录、
identifier、渲染层边界、令牌真源、卸载不删数据、SQLite → JSON 镜像。

这里原先手抄了四条，已经和 AGENTS 那份对不上（少了「渲染层只有 services 能碰系统」与
「令牌只有一份真源」，顺序也不一样）。同一份规矩写两处，改一处忘一处就变成两条互相矛盾的规矩。

## 许可

PolyForm Noncommercial 1.0.0（沿用旧版）。字体为 SIL OFL 1.1，`assets/fonts/OFL.txt` 随字体保留。
