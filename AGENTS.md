# 本仓库协作约定（开工前先读）

> 这些不是建议，是本机实测过的现象与对应的固定做法。**不要重新发现。**
> 工程规范见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)，本文只讲「这台机器上怎么干活」。

## 一、验证分档：默认日常，仅明确要求全量检查时运行

**用户 2026-11-07 定：默认按日常开发交付，只有用户明确说「全量检查」或同义指令时，
才运行整套检查与测试。** 新增功能、功能完成、提交、Review、改 Rust 都不自动触发全量，
也不把「提交一下」「看一下」理解成要求验证。

**必要排错可直接执行（用户 2026-11-07 补充）：以下是不顺手跑无关验证的默认建议，
不限制解决当前问题所必需的环节。** 定向复现、读取实际返回、必要的编译 / 启动、
临时切换 debug 窗口可直接执行，不需要单独询问。只覆盖当前问题，不自动扩大为整套测试；
涉及真实账本时先快照，保持数据不变，排错产生的数据按快照还原。

- **日常**（默认）：开发、修复、重构、新增功能、功能完成、提交、Review，不例行跑验证；必要排错直接做。
- **全量检查**：用户明确要求「全量检查」「跑全套测试」等，执行下述全量清单。
- **指定验证**：用户明确指定单项测试、检查或视觉验收，仅执行指定范围，不自行扩成全量。

**日常不顺手跑单项**：不自动运行 format 检查、lint、typecheck、test、e2e、Rust 测试、
fmt 或 Clippy，也不为了「验证一下」单独 build。读代码、搜索、查看差异照常；
用户要求启动、看效果，或定位问题必须启动时，只做完成该请求所必需的编译、启动、展示与定向复现，
不借机附带无关测试。必要排错不受上面「不顺手跑单项」的建议限制。

**写断言与跑断言分开**：新增功能同步补与改动相关的逻辑或烟测断言，删除功能同步删断言；
编写断言不代表允许自动运行。日常交付可以说明断言已补、尚未执行，不以未跑全量为由拖住交付。
用例和断言数量以实际运行末尾的汇总为准，文档不写死。

**用户要求全量检查时**：

- `npm run check`：format:check + lint + typecheck + test + check:version + lint:commits。
- 真 Tauri 窗口 `npm run e2e`：先 `start.bat --force debug`，按 §五快照并还原真实账本。
- Rust：按 §三设环境，运行 `cargo fmt --check`、`cargo test --lib`、
  `cargo clippy --all-targets -- -D warnings`。`cargo check` 不替代 Rust 测试。
- 涉及排版或用户要求视觉验收时，再按 §五执行 `npm run build` 与统一 CDP 探针截图、量几何。

`check` 只覆盖前端逻辑与类型，烟测覆盖真窗口交互和重载持久化，Rust 检查覆盖后端，
不能互相冒充。**同一份代码的结果可复用，不因提交或 Review 重复跑。**
后续改动仍默认日常，不沿用上一轮「全量检查」的指令自动运行测试。

**执行动作**：日常第一行标 `档位：日常 · 不跑验证`，然后直接处理需求；
只有用户要求全量时标 `档位：全量检查`。日常交付写改了哪些文件、改了什么、到哪里看；
没跑不说「已验证」。用户要求的验证跑不了时，明确哪项未跑及原因。

### 一·补 执行效率：慢在哪里（2026-11-10 实测，别重新发现）

装备版心摘要那次「只改六行 CSS」的任务跑了 **91 分钟**。解压会话日志
（`~/.dsh/sessions/<proj>/<session>/session.v4.jsonl.zstd`，node `zlib.zstdDecompressSync`
按 `28 b5 2f fd` 魔数切帧后拼接）逐事件算：

| 环节 | 耗时 | 占比 |
| --- | --- | --- |
| 模型往返（思考 + 生成） | 64.6 min | **81%** |
| 工具执行 | 15.8 min | 20% |
| 等用户答问题 | ~11 min | — |

279 个步骤、单步 p50 **6.6s** —— 单步不慢，**是步数太多**。缓存命中 97.2%、模型延迟正常，
都不是原因，别往那上面查。

**五条放大器（按危害排序，每条都有实测数字）**

1. **工具串行**：278 个有工具的步骤里 **238 步只发 1 个调用**。读三个文件 = 三次模型往返。
   → 无依赖的 `read` / `grep` / `pwsh` **一条消息里全部发出**。
2. **小块碎改 + 反复整读**：85 次 `edit` 里 **26 次改同一个 `gear-pane.css`**、16 次同一 ts、
   15 次同一 vue；117 次 `read` 里同一文件重读 **12–16 遍**。这是用昂贵的往返支付「我记不住
   刚写了什么」。→ 动手前**一次读齐**目标区段，**一个文件一轮改完**再落盘；改完不要立刻回读
   整个文件确认。
3. **日常档跑验证**：7 次 `npm run build`（358s，含一次 **304s 挂死**）、15 次探针（125s）、
   13 次 prettier，而档位明确是「日常 · 不跑验证」。→ 改样式期间不 build、不探针；必须看几何
   时**一次探针取全所有数字**（宽度/行高/溢出/颜色放进同一个 evaluate）；**绝不把
   `npm run build` 和探针串成一条命令**（端口撞车 = 挂死）。必须 build 时带
   `sandbox_permissions: danger-full-access`（否则 `spawn EPERM ... esbuild`）。
4. **需求分批追问**：3 次 `ask_user_question` 共 **357s**（最长一次 215s），前两次本可合并。
   → 歧义**一次问完**（一次调用里放多个 `questions`）。
5. **杂项**：4 次 `ReplaceFileW EIO` 编辑失败、2 次 EPERM、1 次上游流中断重试 62s。

**停止线**：**20 分钟没有拿得出手的交付物就停下汇报现状**，不要在链路里继续补。
交付「能用的一部分 + 说清状态」永远优于「一次做完但一小时」。

**中断信号（看到任意一条就立刻改节奏）**：同一文件第三次 `edit`、同一文件第三次 `read`、
本轮第二次 `build`、心里冒出「再量一次确认」。

## 二、沙箱与工具限制

| 现象                                               | 事实                                                               | 正确做法                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| PowerShell `Get-Content` 读中文源码乱码            | 5.1 按 GBK 解码无 BOM 的 UTF-8                                     | **读文件一律用 read 工具**，搜内容用 grep，不要 `Get-Content`/`Select-String`                      |
| `git commit -m "…"` 被安全策略拒绝                 | 消息里出现「用 shell 调 cmd / start」这类字样时被判绕过校验        | 用 `git commit -F <消息文件>`，文件放 `.runtime/`（已忽略），提交后删                              |
| `git checkout` / `git add` 报 `index.lock` 存在    | 并行 git 进程（编辑器集成、AI 会话）会留下锁                       | 确认无活跃 git 进程后 `rm -f .git/index.lock` 重试，**不要**删整个 `.git`                          |
| `rm -rf` 报权限错误                                | 沙箱对递归删除有额外限制                                           | 不要绕过。逐个 `rm`，或 PowerShell `Remove-Item -Recurse -Force -Confirm:$false`（会触发升级授权） |
| `Rename-Item` / `Remove-Item` 对刚建的文件报 EPERM | 子进程写不了 write 工具刚创建的文件                                | 不要重试同一种写法。留给人或换一次会话处理                                                         |
| `npx <工具> --write <新文件>` 可能 EPERM           | 同上                                                               | 先 `--check` 定位，再用 edit 工具按格式手改；或对所有文件统一跑一次                                |
| 后台任务被回收后 vite 的 node 子进程残留           | 占用 5173，下次 `npm run desktop` 报 `beforeDevCommand terminated` | `netstat -ano \| grep ":5173.*LISTENING"` 找 PID → `taskkill //F //PID <pid>`                      |

**提交信息只要一行**（细则在 `CONVENTIONS.md` §2.1）：`type:中文短语`，**不写正文**。别分段、
别列条目、别论证「为什么」——想写为什么就写 `docs/RECORD.md` 那一批。一行装不下 = 该拆成两次提交。

## 三、Windows 上编译必须先设环境（本机实测）

`vcvars64.bat` 依赖 `reg.exe`，而它在沙箱黑名单里，LIB 补不全 → 链接报
`LNK1181: 无法打开 kernel32.lib`。另外 Git Bash 自带的 `usr/bin/link.exe` 是 Unix 的 `link`，
会抢在 MSVC 前面被调用。

```bash
MSVC="C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDK="C:/Program Files (x86)/Windows Kits/10"; SDKVER=10.0.26100.0
export LIB="$MSVC/lib/x64;$SDK/Lib/$SDKVER/um/x64;$SDK/Lib/$SDKVER/ucrt/x64"
export PATH="$HOME/.cargo/bin:$MSVC/bin/Hostx64/x64:$PATH"
export CARGO_BUILD_JOBS=4
```

- **`~/.cargo/bin` 不在默认 PATH 里**，必须显式加，否则 `cargo` 不存在。
- **并行度压到 4**：本机 rustc 高并发时崩过 `0xc0000005`（编译器进程崩，不是代码错）。
  `Cargo.toml` 的 `[profile.dev] debug = 0` 也是为此。
- crates 走中科大镜像（`~/.cargo/config.toml` 的 source replace，直连与代理本机均不通）。
- 日常不用手敲——`start.bat` 全封装了（含端口与实例预检）。

## 四、启动与窗口

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222
start.bat --check    只做环境自检
start.bat --force    遇到占用直接处理，不询问
```

`start.bat` 做四件事，每件对应一个踩过的坑，改脚本时别删：**① 按目录探测 MSVC 与 SDK 的
最新版本**（装了新 BuildTools 不用改脚本）；**② 把 `System32` 提到 PATH 前段**（从 Git Bash
调用时 Git 的 `usr/bin` 里同名 `timeout.exe` 会抢先）；**③ 独占资源预检**（窗口实例 + 5173，
`strictPort` 开着，被占时 Vite 不换端口直接退出；脚本打出占用者 PID 并只结束 `node.exe`，
之后**轮询等端口真正释放**，最多 10 秒）；**④ 失败时列出三条排查方向**，不只丢退出码。

- **必须存成 GBK(936) + CRLF。** 存 UTF-8 时 cmd 按双字节切行，中文注释被拆成命令，报一串
  「不是内部或外部命令」且行号与真问题无关。`.gitattributes` 与 `.editorconfig` 已声明
  `*.bat` 为 CRLF 双保险。Git Bash 里用 `cmd //c start.bat`（直接跑显示乱码，不影响功能）；
  非交互终端下弹不出询问，脚本会提示改用 `--force`。
- **启动失败时 tauri 只会说 `Error The "beforeDevCommand" terminated with a non-zero status code.`**
  ——一个字不提真正原因。已知两种，别一看这句就认定是端口：① 5173 被占（多半另一个会话在跑
  `npm run dev`）；② Vite 监视器撞上构建产物 → `EBUSY`，见下条。
- **`EBUSY: resource busy or locked, watch '…\*.o'`**（2026-11-02 实际崩过）：Vite 默认只忽略
  `node_modules` 与 `.git`，于是会去 watch `.runtime/target-lab` 这类独立 cargo target 目录
  （1.4GB，含 `.o`），rustc 正锁着某个 `.o` 时就抛 EBUSY。`vite.config.ts` 的
  `server.watch.ignored` 已排掉 `.runtime/`、`src-tauri/target/`、`dist/`、`map/`。**它是整体
  覆盖默认列表而非追加**：加新项时 `node_modules` 与 `.git` 必须自己写回去。
- **WebView2 `HRESULT(0x8007139F)`「组或资源状态不正确」**：上次实例留下的
  `msedgewebview2.exe --type=crashpad-handler`（`--user-data-dir=…\EBWebView`）还占着用户数据
  目录。杀掉那个 crashpad 即可，**不要**动 SearchHost 的 webview2（那是系统搜索）。
- **调试端口必须由代码递进去**：Tauri 建 webview 时用 `additional_browser_args` 盖掉
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`，所以窗口建在 `lib.rs` 的 `create_main_window()` 里，
  只有 debug 构建才读 `MH_CDP_PORT`（发布版不含调试端口）。

## 五、怎么验（明确要求验证或必要排错时按范围使用）

| 要验什么              | 怎么做                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码质量              | `npm run check`                                                                                                                                                                                                                                                                                                                                   |
| 界面观感              | `npm run build` → `node tools/probe/cdp.mjs --root dist --hash '#/settings' --shot x.png`                                                                                                                                                                                                                                                         |
| IPC / 外链 / 窗口操作 | **必须回 Tauri 真窗口**：`MH_CDP_PORT=9223 npm run desktop`，连 `127.0.0.1:9223/json/list`                                                                                                                                                                                                                                                        |
| 整条交互路径          | `start.bat --force debug` → `npm run e2e`（八页导航 + 角色增改删 + 记价 + 速记连点 + 重载后仍在 + 弹窗 Esc + 字号主题 + 单价导出→导入 + 导出→导入整份替换；断言条数不写死，看运行末尾的汇总）。**会写真实数据**：开头自己快照一份库，测试条目自己删，剩下的用 `node tools/e2e/db.mjs restore <id> --yes` 还原（应用先关）；`--only=物价` 只跑一节 |
| IPC 契约              | `npm run test`（`src/services/ipc-contract.test.ts`）：三份清单对账——Rust 两张 `collect_commands!`、生成的 `bindings.ts`、前端 `commands.xxx()` 的调用点，**命令名与字段名都算**。改名 / 只加一张表 / 注册了没人用 / 生成的类型落后于 Rust，四种都红                                                                                              |
| CSP / 安全策略        | **`tauri dev` 走 `devCsp`，验不到生产的 `csp`**：出包 `npm run tauri build -- --debug --no-bundle`，再 `MH_CDP_PORT=9224 ./src-tauri/target/debug/mh-toolbox-rs.exe`。判据：设置页 4 个 section + 开发页 7 张卡在、字体 `loaded`、`appInfo` IPC 通、零 CSP 拦截                                                                                   |
| 降动效                | CDP `Emulation.setEmulatedMedia` 传 `prefers-reduced-motion: reduce`，读 `getComputedStyle(el).transitionDuration`，应为 `0.001s`                                                                                                                                                                                                                 |
| 几何是否对齐          | 读 `getBoundingClientRect()` 断言，不要靠眼看截图                                                                                                                                                                                                                                                                                                 |

**测「导出 / 导入」不用人点系统对话框**：数据目录下的 `e2e-dialog.json`（`{"save":"…"}` 或
`{"open":"…"}`）会被 `backup.rs` 的 `dialog_override` 读走，**读到就删、只生效一次**。这段代码
**只在 debug 构建里存在**（`cfg!` 是编译期常量），发布版根本没有——留着它等于给任何能写数据
目录的程序一条「把账本悄悄导出、或用一份文件顶掉」的路。`app_info` 的 `debug` 字段就是给测试
判断「钩子在不在」的，预检先断言它。

**截图与量几何一律走 `tools/probe/cdp.mjs`。** 它把踩过的前提写死在代码里，别每轮现写一个
`probe-xxx.mjs` 再删：关缓存、URL 带时间戳（只改 hash 不会重新加载文档）、注入
`transition:none`（无焦点 headless 不推进动画，`getComputedStyle` 会返回上一拍的值）、
`--fresh` 清 localStorage（否则上一轮存的 `mh-theme: dark` 会让 `--light` 失效）、`--inject`
在文档执行前补 IPC 桩（模块求值就定型的判断，事后补已经晚了）、`--hover` / `--active` 强推伪类。

剩下三件还得人记：

1. **Chrome headless 在本机静默失败**（进程起来、图不落地）→ 用 **Edge**。工具默认调
   `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，加 `--launch` 自己起。
2. **伪类分两种验法**：只看样式用 `--hover` / `--active`（`CSS.forcePseudoState`，真挂在元素上）；
   要连带触发 JS 行为（`mouseenter` 预载、拖动）才用 `Input.dispatchMouseEvent` 真移鼠标。
   js 派发 DOM 事件不会激活 `:hover`，拿那个截图是自欺。指针残留会让上一枚按钮一直 hover，
   截「常态」前先挪开。
3. **Git Bash 会把 `#/dev` 吃掉**：MSYS 把 `/dev` 当路径转成 `C:/…/dev`，页面走兜底重定向落到
   设置页——**量出来的是另一页的数据**。用 `MSYS_NO_PATHCONV=1` 跑探针。

`curl` 在本机默认走 FlClash 代理，连 127.0.0.1 会被吞 → **一律加 `--noproxy '*'`**。

## 六、红线（改代码前必须知道）

1. **数据目录固定 `%APPDATA%\mh-tool-rs`**（`lib.rs` 的 `data_dir_path()`），**不要落到 identifier 目录**。
   Tauri 默认写 `%APPDATA%\<identifier>`，必须显式指定。2026-11-04 之前它与旧版 Electron 共用
   `mh-tool-v2`，两代应用的 `data.json` / `.bak` / `logs` 与 `mh-toolbox.db` / `backups/` 混在一处；
   换名时**没有**写搬迁逻辑——新应用不接老数据（老版本只贡献「有哪些功能、长什么样」），
   新目录从空库开始。`store.rs` 经 `data_dir_path()` 取目录（`open_at(base)` 只认目录），
   **不要再用 `app_data_dir()` 直连**——2026-11-03 之前它就这么写，库落在
   `%APPDATA%\com.zhijian.mhtoolbox.rs\`。
2. **identifier `com.zhijian.mhtoolbox.rs` 不能改**，且必须与旧版 appId 不同，否则 Windows 会把
   两个安装包当成同一个应用互相覆盖。
3. **渲染层只有 `src/services/` 能碰系统**。ESLint 已拦 `@tauri-apps/api/core` 出现在
   `components/`、`views/`、`composables/` 里。
4. **令牌只有一份真源**：`src/styles/` 的 `tokens.css` / `base.css` / `blocks.css`。全仓**没有
   任何样式表副本**——以后做设计稿也引同一份，不要复制。
5. **卸载不删数据**（`deleteAppDataOnUninstall` 保持 false）。
6. **新版数据不回落旧版**（2026-11-04 用户定）。数据层在 SQLite，导出是 JSON 信封
   （`format: 1` + `app: mh-toolbox-rs`，见 `backup.rs`），旧版 Electron 打不开这份账；也**不做**
   SQLite → 旧 `data.json` 的反向镜像。代价说清楚：升级是**单向**的，退回旧版就看不到新版记的账。
   换来「一份数据只有一个真源」，不必维护两代结构的双向转换——那正是 `backup.rs` 头注释里
   否掉「顺手也认一下旧格式」的同一个理由（猜错的后果是把用户的角色导成半截，且无法验证）。

## 七、明确不做的事

写下来是为了不再每次重新讨论。**这是唯一一份**，`CONVENTIONS.md` §4 只留指针。

| 事项                | 决定     | 理由                                                                                                                  |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| husky / lint-staged | 不装     | 沙箱对带管道的子进程不稳定，钩子容易误报。校验放 `npm run check`                                                      |
| ESLint 风格规则     | 不开     | 风格一律 Prettier。`eslint-plugin-vue` 用 `flat/essential` 而非 `recommended`（后者 584 条格式化告警，与 4 空格冲突） |
| 组件单测全覆盖      | 不做     | 组件靠 CDP 截图 + 几何断言；单测只覆盖纯逻辑、composable 与页面数据层                                                 |
| CSS 框架            | 不引入   | 账簿语言是手写令牌体系，引入框架会带来第二套命名与优先级                                                              |
| 状态管理库（现在）  | 暂不引入 | 六个状态用 composable 够。**触发条件**：跨三个以上组件的共享业务状态时上 Pinia，并把决定写进 `ARCHITECTURE.md`        |
| 大改现有命名        | 不做     | 改名冲掉 git blame。用「新代码守新规」渐进收敛                                                                        |
| 间距刻度令牌        | 不做     | 2026-11-01 删掉 `--sp-1…10`（十档只用过 2 档）。间距就地写 px；旧代码的裸值不做全量令牌化，遇到再换                   |
| 一次性的探针脚本    | 不做     | 每轮现写再删，那几条前提（关缓存 / 时间戳 / 禁动画 / 清存储）每次重踩；改用 `tools/probe/cdp.mjs`                     |
| CHANGELOG           | 不维护   | 改动原因按批记在 `docs/RECORD.md`，再养一份必然漂移                                                                   |
