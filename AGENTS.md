# 本仓库协作约定（开工前先读）

> 这些不是建议，是本机实测过的现象与对应的固定做法。**不要重新发现。**
> 工程规范见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)，本文只讲「这台机器上怎么干活」。

## 一、一条命令验证

```bash
npm run check     # format:check + lint + typecheck + test + check:version + lint:commits，人跑的和 CI 跑的是同一条
```

Rust 侧需要单独跑（要先设 MSVC 环境，见 §三）：

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

`npm run build` 里已经包含 `vue-tsc --noEmit`，打包前不必再单独 typecheck。

## 二、沙箱与工具限制

| 现象                                               | 事实                                                               | 正确做法                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| PowerShell `Get-Content` 读中文源码乱码            | 5.1 按 GBK 解码无 BOM 的 UTF-8                                     | **读文件一律用 read 工具**，搜内容用 grep 工具，不要用 `Get-Content`/`Select-String`                     |
| `git commit -m "…"` 被安全策略拒绝                 | 消息里出现「用 shell 调 cmd / start」这类字样时被判为绕过命令校验  | 用 `git commit -F <消息文件>`，文件放 `.runtime/`（已 gitignore），提交后删                              |
| `git checkout` / `git add` 报 `index.lock` 存在    | 并行的 git 进程（编辑器集成、AI 会话）会留下锁文件                 | 确认无活跃 git 进程后 `rm -f .git/index.lock` 再重试，**不要**删整个 `.git`                              |
| `rm -rf` 报权限错误                                | 沙箱对递归删除有额外限制                                           | 不要绕过。逐个文件 `rm`，或用 PowerShell `Remove-Item -Recurse -Force -Confirm:$false`（会触发升级授权） |
| `Rename-Item` / `Remove-Item` 对刚建的文件报 EPERM | 子进程写不了由 write 工具刚创建的文件                              | 不要重试同一种写法。留给人工或换一次会话处理                                                             |
| `npx <工具> --write <新文件>` 可能 EPERM           | 同上                                                               | 先 `--check` 定位，再用 edit 工具按格式手改；或对所有文件统一跑一次                                      |
| 后台任务被回收后 vite 的 node 子进程残留           | 占用 5173，下次 `npm run desktop` 报 `beforeDevCommand terminated` | `netstat -ano \| grep ":5173.*LISTENING"` 找 PID → `taskkill //F //PID <pid>`                            |

## 三、Windows 上编译必须先设环境（本机实测）

`vcvars64.bat` 依赖 `reg.exe`，而它在沙箱黑名单里，LIB 补不全 → 链接报
`LNK1181: 无法打开 kernel32.lib`。另外 Git Bash 自带的 `usr/bin/link.exe` 是 Unix 的
`link` 命令，会抢在 MSVC 前面被调用。

```bash
MSVC="C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDK="C:/Program Files (x86)/Windows Kits/10"; SDKVER=10.0.26100.0
export LIB="$MSVC/lib/x64;$SDK/Lib/$SDKVER/um/x64;$SDK/Lib/$SDKVER/ucrt/x64"
export PATH="$HOME/.cargo/bin:$MSVC/bin/Hostx64/x64:$PATH"
export CARGO_BUILD_JOBS=4
```

- **`~/.cargo/bin` 不在默认 PATH 里**，必须显式加，否则 `cargo` 命令不存在。
- **并行度压到 4**：本机 rustc 高并发时崩过 `STATUS_ACCESS_VIOLATION`（0xc0000005）。
  这是编译器进程崩，不是代码错。`Cargo.toml` 的 `[profile.dev] debug = 0` 也是为此。
- 日常不用手敲这些——根目录 `start.bat` 全封装了（含端口与实例预检）。

## 四、启动与窗口

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222
start.bat --check    只做环境自检
start.bat --force    遇到占用直接处理，不询问
```

- **`start.bat` 必须存成 GBK(936) + CRLF。** 存 UTF-8 时 cmd 按双字节切行，中文注释被拆成
  命令，报一串「xxx 不是内部或外部命令」，且报错行号与真实问题完全无关。
  `.gitattributes` 与 `.editorconfig` 已声明 `*.bat` 为 CRLF 双保险。
- **启动失败的头号原因是 5173 被占**，而 tauri 只会说
  `Error The "beforeDevCommand" terminated with a non-zero status code.`——一个字不提端口。
- **WebView2 `HRESULT(0x8007139F)`「组或资源状态不正确」**：上一次实例留下的
  `msedgewebview2.exe --type=crashpad-handler`（`--user-data-dir=…\com.zhijian.mhtoolbox.rs\EBWebView`）
  还占着用户数据目录。杀掉那个 crashpad 即可。**不要**动 SearchHost 的 webview2，那是系统搜索。

## 五、验证方式

| 要验什么              | 怎么做                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码质量              | `npm run check`                                                                                                                                                                                                                                                                                                                                               |
| 界面观感              | `npm run build` → `node tools/probe/cdp.mjs --root dist --hash '#/settings' --shot x.png`（自带静态服务与截图）                                                                                                                                                                                                                                               |
| IPC / 外链 / 窗口操作 | **必须回 Tauri 真窗口**。`MH_CDP_PORT=9223 npm run desktop`，连 `http://127.0.0.1:9223/json/list`                                                                                                                                                                                                                                                             |
| CSP / 安全策略        | **`tauri dev` 走的是 `devCsp`，验不到生产的 `csp`**。要验就出包：`npm run tauri build -- --debug --no-bundle`，再 `MH_CDP_PORT=9224 ./src-tauri/target/debug/mh-toolbox-rs.exe`（它从 `tauri.localhost` 加载内嵌产物，才是生产策略）。判据：设置页 2 个 section + 开发页（`#/dev`）5 张卡在、字体 `loaded`、`appInfo` IPC 通、`Log`/`Runtime` 事件零 CSP 拦截 |
| 降动效                | CDP `Emulation.setEmulatedMedia` 传 `features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]`，再读 `getComputedStyle(el).transitionDuration`，应为 `0.001s`                                                                                                                                                                                          |
| 悬停、按下等伪类      | 探针加 `--hover <选择器>` / `--active <选择器>`：走 `CSS.forcePseudoState`，与 DevTools 的「强制元素状态」同一套，样式引擎**真的**当作悬停/按下。它只改样式、不派发 `mouseenter` / `pointerdown`，所以验「悬停时才开始预载」这类 **JS 行为**仍要 `Input.dispatchMouseEvent` 真移鼠标。**js 派发 DOM 事件不会激活 `:hover`**，拿那个截图是自欺                 |
| 几何是否对齐          | 读 `getBoundingClientRect()` 断言，不要靠眼看截图                                                                                                                                                                                                                                                                                                             |

**截图与量几何一律走 `tools/probe/cdp.mjs`。** 它把踩过的前提写死在代码里，别每轮现写一个
`probe-xxx.mjs` 再删掉：关缓存、URL 带时间戳（只改 hash 不会重新加载文档）、注入
`transition:none`（无焦点 headless 不推进动画，`getComputedStyle` 会返回上一拍的值）、
`--fresh` 清 localStorage（否则上一轮存的 `mh-theme: dark` 会让 `--light` 失效）、
`--inject` 在文档执行前补 IPC 桩（模块求值就定型的判断，事后补已经晚了）、
`--hover` / `--active` 强推伪类（截图验悬停与按下态）。

剩下三件还得人记：

1. **Chrome headless 在本机静默失败**（进程起来、图不落地）→ 用 **Edge**。工具默认调
   `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，加 `--launch` 自己起。
2. **伪类分两种验法**：只看样式用 `--hover` / `--active`（`CSS.forcePseudoState`，真挂在目标
   元素上）；要连带触发 JS 行为（`mouseenter` 预载、拖动）才用 `Input.dispatchMouseEvent` 真移
   鼠标。js 派发 DOM 事件不会激活 `:hover`，拿那个截图是自欺。指针残留还会让上一枚按钮
   一直保持 hover，截「常态」前先挪开。
3. **Git Bash 会把 `#/dev` 吃掉**：MSYS 把 `/dev` 当路径转成 `C:/…/dev`，页面于是走兜底
   重定向落到设置页——**量出来的是另一页的数据**。用 `MSYS_NO_PATHCONV=1` 跑探针。

`curl` 在本机默认走 FlClash 代理，连 127.0.0.1 会被代理吞掉 → **一律加 `--noproxy '*'`**。

## 六、红线（改代码前必须知道）

1. **数据目录固定 `%APPDATA%\mh-tool-v2`**（`src-tauri/src/lib.rs` 的 `data_dir()`），与旧版共用。
   Tauri 默认写到 `%APPDATA%\<identifier>`，必须显式指回，否则朋友升级后数据「消失」。
2. **identifier `com.zhijian.mhtoolbox.rs` 不能改**，且必须与旧版 appId 不同，否则 Windows
   会把两个安装包当成同一个应用互相覆盖。
3. **渲染层只有 `src/services/` 能碰系统**。ESLint 已拦 `@tauri-apps/api/core` 出现在
   `components/`、`views/`、`composables/` 里。
4. **令牌只有一份真源**：`src/styles/` 下的 `tokens.css` / `base.css` / `blocks.css`。
   `design/` 下**不再有副本**（2026-10-30 已删），`design/income.html` 直接引 `../src/styles/*.css`。
   以后做设计稿也引同一份文件，不要复制。
5. **卸载不删数据**（`deleteAppDataOnUninstall` 保持 false）。
6. 数据层落地后必须做 **SQLite → JSON 反向镜像**，否则一旦转换就退不回旧版。

## 七、明确不做的事

写下来是为了不再每次重新讨论。

| 事项                | 决定     | 理由                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| husky / lint-staged | 不装     | 沙箱对带管道的子进程不稳定，钩子容易误报。校验放 `npm run check`                                                                     |
| ESLint 风格规则     | 不开     | 风格一律 Prettier。`eslint-plugin-vue` 用 `flat/essential` 而不是 `flat/recommended`——后者带 584 条格式化告警，与 4 空格缩进直接冲突 |
| 组件单测全覆盖      | 不做     | 组件靠 CDP 截图 + 几何断言验；单测只覆盖纯逻辑与 composable                                                                          |
| CSS 框架            | 不引入   | 账簿语言是手写令牌体系，引入框架会带来第二套命名与优先级                                                                             |
| 状态管理库（现在）  | 暂不引入 | 四个状态用 composable 够。**触发条件**：出现跨三个以上组件的共享业务状态时再上 Pinia，并把决定写进 `docs/ARCHITECTURE.md`            |
| 大改现有命名        | 不做     | 改名冲掉 git blame。用「新代码守新规」渐进收敛                                                                                       |
| 一次性的探针脚本    | 不做     | 每轮现写再删，那几条前提（关缓存 / 时间戳 / 禁动画 / 清存储）每次重踩；改用 `tools/probe/cdp.mjs`                                    |
| 全量令牌化间距      | 不做     | 现有裸值多、收益低。新代码遵守，旧代码遇到再换                                                                                       |
| CHANGELOG           | 不维护   | 改动原因写在提交正文，再养一份必然漂移                                                                                               |
