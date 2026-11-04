# 本仓库协作约定（开工前先读）

> 这些不是建议，是本机实测过的现象与对应的固定做法。**不要重新发现。**
> 工程规范见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)，本文只讲「这台机器上怎么干活」。

## 一、验证分三档，日常一档是「不跑」

页面改动的真值在用户的眼睛和手指上，不在测试套件里——他自己点测，有问题直接说。

| 档                    | 什么时候                         | 跑什么                                                        |
| --------------------- | -------------------------------- | ------------------------------------------------------------- |
| **日常**（默认）      | 改页面、调样式、加字段、重构     | **什么都不跑**。改完直接交付，说明改了哪几个文件              |
| **提交前**            | 用户说「提交」「Review 一下」    | `npm run check`（六项全绿才提交）+ 需要时 `npm run build`     |
| **Review / 视觉验收** | 用户明确要看效果，或改动动了排版 | 上一档 + `npm run build` + `tools/probe/cdp.mjs` 截图与量几何 |

`npm run check` = format:check + lint + typecheck + test + check:version + lint:commits，
人跑的和 CI 的 `web` job 是同一条。它只在第二、三档出现。

**不要自作主张「顺手跑一下」**——包括只跑 test、只 typecheck、只 build 一次看看。
这些正是耗时的地方，答案在提交前那一次就已经覆盖了。

**唯一例外：动了 `src-tauri/`**。Rust 不编译就起不来窗口，用户没法点测——那不是「验证」，
是「能不能启动」。此时按 §三 设好环境后 `cargo check` 一次，`cargo test` / `clippy` 仍留到提交前。

**执行动作**：收到「改页面 / 调样式 / 加字段 / 重构 / 修小 bug」这类需求时，回复第一行直接标档位
（如 `档位：日常 · 不跑验证`），然后**立刻改文件**，不要先去跑任何命令。交付只写「改了哪些文件、
改了什么、你该点哪里看」。**没跑就别说「已验证」**。这条优先于本文其余「怎么验证」的内容。

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

**提交信息只要一行**（细则在 `CONVENTIONS.md` §2.1）：`type:中文短语`，**不写正文**。
别分段、别列条目、别论证「为什么」——想写为什么就写 `docs/RECORD.md` 那一批。
一行装不下 = 这批改动该拆成两次提交。

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
- crates 走中科大镜像（`~/.cargo/config.toml` 的 source replace，直连与代理在本机均不通）。
- 日常不用手敲这些——根目录 `start.bat` 全封装了（含端口与实例预检）。

## 四、启动与窗口

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222
start.bat --check    只做环境自检
start.bat --force    遇到占用直接处理，不询问
```

`start.bat` 做四件事，每件对应一个真踩过的坑，改脚本时别删：

1. **按目录探测 MSVC 与 Windows SDK 的最新版本**，不写死版本号——装了新 BuildTools 之后脚本不用改。
2. **`System32` 显式提到 PATH 前段**：从 Git Bash 调用时 PATH 里混着 Git 的 `usr/bin`，
   同名的 `timeout.exe` 会抢在 Windows 的 `timeout` 前面被调用。
3. **独占资源预检：窗口实例 + 5173 端口**。`strictPort` 开着，5173 被占时 Vite 不换端口、
   直接退出。脚本会打出占用者 PID 并询问是否结束，**只结束 `node.exe`**，结束之后还要
   **轮询等端口真正释放**（最多 10 秒），避免 kill 完立刻 bind 的偶发失败。
4. 启动失败时不再只丢一个退出码，而是列出三条排查方向（谁抢了 5173 / rustc 报错 /
   target 目录被占用）。

- **`start.bat` 必须存成 GBK(936) + CRLF。** 存 UTF-8 时 cmd 按双字节切行，中文注释被拆成
  命令，报一串「xxx 不是内部或外部命令」，且报错行号与真实问题完全无关。
  `.gitattributes` 与 `.editorconfig` 已声明 `*.bat` 为 CRLF 双保险。
  在 Git Bash 里用 `cmd //c start.bat`；直接跑会显示乱码（不影响功能）。非交互终端下无法
  弹询问，脚本会提示改用 `--force`。
- **启动失败时 tauri 只会说 `Error The "beforeDevCommand" terminated with a non-zero status code.`**
  ——一个字不提真正原因。已知两种，别一看到这句就认定是端口：
    1. **5173 被占**（多半是另一个会话在跑 `npm run dev`）；
    2. **Vite 监视器撞上构建产物** → `EBUSY`，见下一条。
- **`EBUSY: resource busy or locked, watch '…\*.o'`**（2026-11-02 实际崩过）：
  Vite 默认只忽略 `node_modules` 与 `.git`，于是会去 watch `.runtime/target-lab` 这类
  独立 cargo target 目录（1.4GB，含 `.o` 中间产物）。rustc 正锁着某个 `.o` 时就抛 EBUSY。
  `vite.config.ts` 的 `server.watch.ignored` 已排掉 `.runtime/`、`src-tauri/target/`、`dist/`、`map/` 等。
  **注意它是整体覆盖默认列表而非追加**：加新项时 `node_modules` 与 `.git` 必须自己写回去。
- **WebView2 `HRESULT(0x8007139F)`「组或资源状态不正确」**：上一次实例留下的
  `msedgewebview2.exe --type=crashpad-handler`（`--user-data-dir=…\com.zhijian.mhtoolbox.rs\EBWebView`）
  还占着用户数据目录。杀掉那个 crashpad 即可。**不要**动 SearchHost 的 webview2，那是系统搜索。
- **调试端口必须由代码递进去**：Tauri 建 webview 时会用 `additional_browser_args` 盖掉
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 环境变量，所以窗口建在 `lib.rs` 的
  `create_main_window()` 里，只有 debug 构建才读 `MH_CDP_PORT`（发布版不含调试端口）。

## 五、怎么验（第二、三档才用）

| 要验什么              | 怎么做                                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码质量              | `npm run check`                                                                                                                                                                                                                                                                                                             |
| 界面观感              | `npm run build` → `node tools/probe/cdp.mjs --root dist --hash '#/settings' --shot x.png`（自带静态服务与截图）                                                                                                                                                                                                             |
| IPC / 外链 / 窗口操作 | **必须回 Tauri 真窗口**。`MH_CDP_PORT=9223 npm run desktop`，连 `http://127.0.0.1:9223/json/list`                                                                                                                                                                                                                           |
| 整条交互路径          | `start.bat --force debug` → `npm run e2e`（八页导航 + 角色增改删 + 记价 + 速记连点 + **重载后仍在** + 弹窗 Esc + 字号主题，64 条断言；`node tools/e2e/smoke.mjs --only=物价` 只跑一节）。**会写真实数据**：脚本开头自己快照一份库，测试条目自己删，剩下的用 `node tools/e2e/db.mjs restore <id> --yes` 还原（应用要先关掉） |
| CSP / 安全策略        | **`tauri dev` 走的是 `devCsp`，验不到生产的 `csp`**：要验就出包 `npm run tauri build -- --debug --no-bundle`，再 `MH_CDP_PORT=9224 ./src-tauri/target/debug/mh-toolbox-rs.exe`。判据：设置页 3 个 section + 开发页 7 张卡在、字体 `loaded`、`appInfo` IPC 通、零 CSP 拦截                                                   |
| 降动效                | CDP `Emulation.setEmulatedMedia` 传 `features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]`，再读 `getComputedStyle(el).transitionDuration`，应为 `0.001s`                                                                                                                                                        |
| 几何是否对齐          | 读 `getBoundingClientRect()` 断言，不要靠眼看截图                                                                                                                                                                                                                                                                           |

**截图与量几何一律走 `tools/probe/cdp.mjs`。** 它把踩过的前提写死在代码里，别每轮现写一个
`probe-xxx.mjs` 再删：关缓存、URL 带时间戳（只改 hash 不会重新加载文档）、注入
`transition:none`（无焦点 headless 不推进动画，`getComputedStyle` 会返回上一拍的值）、
`--fresh` 清 localStorage（否则上一轮存的 `mh-theme: dark` 会让 `--light` 失效）、
`--inject` 在文档执行前补 IPC 桩（模块求值就定型的判断，事后补已经晚了）、
`--hover` / `--active` 强推伪类。

剩下三件还得人记：

1. **Chrome headless 在本机静默失败**（进程起来、图不落地）→ 用 **Edge**。工具默认调
   `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，加 `--launch` 自己起。
2. **伪类分两种验法**：只看样式用 `--hover` / `--active`（`CSS.forcePseudoState`，真挂在目标
   元素上）；要连带触发 JS 行为（`mouseenter` 预载、拖动）才用 `Input.dispatchMouseEvent` 真移
   鼠标。js 派发 DOM 事件不会激活 `:hover`，拿那个截图是自欺。指针残留会让上一枚按钮一直
   保持 hover，截「常态」前先挪开。
3. **Git Bash 会把 `#/dev` 吃掉**：MSYS 把 `/dev` 当路径转成 `C:/…/dev`，页面于是走兜底
   重定向落到设置页——**量出来的是另一页的数据**。用 `MSYS_NO_PATHCONV=1` 跑探针。

`curl` 在本机默认走 FlClash 代理，连 127.0.0.1 会被代理吞掉 → **一律加 `--noproxy '*'`**。

## 六、红线（改代码前必须知道）

1. **数据目录固定 `%APPDATA%\mh-tool-v2`**（`src-tauri/src/lib.rs` 的 `data_dir_path()` / `data_dir()`），与旧版共用。
   Tauri 默认写到 `%APPDATA%\<identifier>`，必须显式指回，否则朋友升级后数据「消失」。
   `store.rs` 经 `data_dir_path()` 取目录（`open_at(base)` 只认目录），**不要再用 `app_data_dir()` 直连**——
   2026-11-03 之前它就是这么写的，库文件落在 `%APPDATA%\com.zhijian.mhtoolbox.rs\mh-toolbox.db`，
   修的时候带了一次性迁移（WAL 三件套一起复制，旧文件留底不删）。
2. **identifier `com.zhijian.mhtoolbox.rs` 不能改**，且必须与旧版 appId 不同，否则 Windows
   会把两个安装包当成同一个应用互相覆盖。
3. **渲染层只有 `src/services/` 能碰系统**。ESLint 已拦 `@tauri-apps/api/core` 出现在
   `components/`、`views/`、`composables/` 里。
4. **令牌只有一份真源**：`src/styles/` 下的 `tokens.css` / `base.css` / `blocks.css`。
   全仓**没有任何样式表副本**——以后要做设计稿也引同一份文件，不要复制。
5. **卸载不删数据**（`deleteAppDataOnUninstall` 保持 false）。
6. **新版数据不回落旧版**（2026-11-04 用户定）。数据层在 SQLite，导出是 JSON 信封
   （`format: 1` + `app: mh-toolbox-rs`，见 `src-tauri/src/backup.rs`），**旧版 Electron
   打不开这份账**；也**不做** SQLite → 旧 `data.json` 的反向镜像。
   代价说清楚：升级是**单向**的，退回旧版就看不到新版记的账。
   换来的是「一份数据只有一个真源」——不必维护两代结构之间的双向转换，那正是
   `backup.rs` 头注释里否掉「顺手也认一下旧格式」的同一个理由（猜错的后果是把用户的
   角色导成半截，而这些猜测无法验证）。

## 七、明确不做的事

写下来是为了不再每次重新讨论。**这是唯一一份**，`CONVENTIONS.md` §4 只留指针。

| 事项                | 决定     | 理由                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| husky / lint-staged | 不装     | 沙箱对带管道的子进程不稳定，钩子容易误报。校验放 `npm run check`                                                                     |
| ESLint 风格规则     | 不开     | 风格一律 Prettier。`eslint-plugin-vue` 用 `flat/essential` 而不是 `flat/recommended`——后者带 584 条格式化告警，与 4 空格缩进直接冲突 |
| 组件单测全覆盖      | 不做     | 组件靠 CDP 截图 + 几何断言验；单测只覆盖纯逻辑、composable 与页面数据层                                                              |
| CSS 框架            | 不引入   | 账簿语言是手写令牌体系，引入框架会带来第二套命名与优先级                                                                             |
| 状态管理库（现在）  | 暂不引入 | 六个状态用 composable 够。**触发条件**：出现跨三个以上组件的共享业务状态时再上 Pinia，并把决定写进 `docs/ARCHITECTURE.md`            |
| 大改现有命名        | 不做     | 改名冲掉 git blame。用「新代码守新规」渐进收敛                                                                                       |
| 间距刻度令牌        | 不做     | 2026-11-01 删掉 `--sp-1…10`（十档只用过 2 档）。间距就地写 px；旧代码里的裸值也不做全量令牌化，遇到再换                              |
| 一次性的探针脚本    | 不做     | 每轮现写再删，那几条前提（关缓存 / 时间戳 / 禁动画 / 清存储）每次重踩；改用 `tools/probe/cdp.mjs`                                    |
| CHANGELOG           | 不维护   | 改动原因按批记在 `docs/RECORD.md`，再养一份必然漂移                                                                                  |
