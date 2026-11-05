# 架构

> 回答「东西该放哪、数据怎么流、哪些边界不能破」。视觉与规范不在这里（见
> [`CONVENTIONS.md`](CONVENTIONS.md)），本机环境不在这里（见 [`AGENTS.md`](../AGENTS.md)）。
>
> **现状**：前端已成型，SQLite 数据层已落地（`src-tauri/src/store.rs`），账本进出在
> `src-tauri/src/backup.rs`（导出 / 导入 / 清除）；八页**都有内容**（目标页是第 115 批补上的
> 最后一块）。
> 总览页（2026-11-05）不产生新数据：它读 `income_entries` 与名册现算，是「读一眼」而不是
> 「另一份账」——同一件事存两处，迟早有一处忘了更新。
> 账号页（2026-11-05，第 112 批）是**第二本账**：它记钱包进出（人民币按元、梦幻币按万），
> 与收益页的「打金产出」分开两张表（`account_entries` / `income_entries`）。两张表而不是
> 加一列：共表就要在每一行上猜「这行是万还是元、有没有渠道」，猜错一次汇总就错。
> 目标页（2026-11-05，第 115 批）是**第三种读法**：它不存进度，只存「许了什么」——手动目标
> 的进度来自自己的流水，养成目标的进度**现算**自身角色档案。所以它是账本的读者，不是第四本账。
> **全站卡片只有一种材质**（2026-11-05，第 116 批）：内容区的卡一律是 `components/PaperCard.vue`
> → `base.css` 的 `.board`（台面上的一张纸），页面由 `PageShell` 的 `surface` 铺台面托住。
> `.frame` 那套文武线收窄成**浮层专用**（角色编辑器、捉鬼测试面板）。这不是纯样式约定：
> 「卡片」从此是一个组件而不是一段 class，新页要一块内容区时不该自己拼 `border + background`。
> 带「计划」字样的段落是动手前定好的边界，不是对现状的描述——写在这里的意义是第一次写
> 领域代码的人不用自己发明一套。

## 1. 分层

```
┌──────────────────────────────────────────────┐
│ views/        路由目标。拉数据、拼区块、读路由参数  │
│ components/   有视觉语义的 UI 单元。不调 services  │
│ composables/  跨组件状态与副作用。单例放模块作用域  │
│ services/     系统能力的唯一出口（一个能力一个文件）│
└───────────────────────┬──────────────────────┘
                        │ invoke（只有这里能过界）
┌───────────────────────┴──────────────────────┐
│ src-tauri/    Tauri 壳：窗口、命令、能力配置       │
│   └─ crates/  （计划）领域层，与壳解耦             │
│        mh-domain   纯逻辑，无 IO，可被 #[test] 全覆盖 │
│        mh-store    SQLite 读写与迁移              │
└──────────────────────────────────────────────┘
```

规则只有一条真正硬：**渲染层不直接引 `@tauri-apps/*`**。ESLint 的 `no-restricted-imports`
拦住 `components/`、`views/`、`composables/`，要系统能力就往 `services/` 加一个函数。窗口三键
在这条线上，截屏与 OCR 也是。

**一个能力一个文件**，不堆进 `desktop.ts`：那个文件管「应用外壳」（版本信息、外链、窗口三键），
`ghost.ts` 管「读游戏画面」，两者唯一的共同点是都过 invoke。堆一起就看不出「哪些命令服务于
哪块界面」。

## 2. 数据流

```
页面 ──调用──▶ composable / services ──invoke──▶ Rust 命令 ──▶ 领域层 ──▶ 磁盘
  ▲                                                        │
  └────────────────── 返回值（camelCase）◀──────────────────┘
```

- **契约还没收成一处真源（欠账）**：`AppInfo` / `PriceItem` / `PricePoint` / `ImportSummary` /
  `ClearSummary` 在 Rust 与 TS 各写一份，靠 `#[serde(rename_all = "camelCase")]` 对齐。命令**已经
  17 个**（`lib.rs` 的 `generate_handler!`：`app_info`、`open_external`、`ghost_*` 两个、`backup::`
  三个、`store::` 十个），早越过当初定的「5 个以上就上 `tauri-specta`」那条阈值，**而它还没接**
  ——「两边字段名对得上」现在靠记忆力，靠 `ipc-contract.test.ts` 兜住命令名这一层。
  `generate_handler!` **按平台写了两份**（`#[cfg(windows)]` / `#[cfg(not(windows))]`）：加命令
  必须两份都加，漏掉非 Windows 那份在本机完全看不出来。
- **数据进出走 `backup.rs`**：`data_export` / `data_import` / `data_clear` 管的是「离开这台机器
  的那个文件」——`format` + `app` + `exportedAt` 的信封、`backups/` 下的自动备份、导入前校验。
  **它不碰 SQL**：读写库一律回落 `store.rs` 的普通函数，不在那里写第二份查询。两条语义：
  **导入 = 整体替换**（动手前把当前数据导一份到 `<数据目录>\backups\`，路径随回执给用户）；
  **清除 = 只清角色与物价**，`meta` 一个字不动——迁移标记清掉了，下次启动会从旧 `localStorage`
  又搬一遍，等于把用户刚清掉的再搬回来。旧版 `data.json`（`schemaVersion: 10`，角色结构完全
  不同）**不在这个入口范围内**：另做一次性转换入口，这里只认自己的信封，不认识就拒绝、不猜。
- **前端状态**：8 个持久状态（主题、字号、应用信息、路由、开发者模式、角色名册、物价表、收益
  账），另有两个瞬时 UI 单例（`use-confirm` / `use-notify`）写法相同但不落盘。**不引 Pinia**——
  触发条件见 `AGENTS.md` §七。名册与物价表都已跨三个组件（页面、卡片、弹窗），但用的是与主题、
  字号同一套「模块级 `ref` + `useXxx()`」，没有第二套机制。
- **写盘时机**：「先改内存模型，再整份写 SQLite」，两步都在这条命令里完成，调用方不用知道顺序。
- **三份数据层的落盘是同一份实现**（`src/services/persist.ts`）：`createPersist` 管「读失败
  拒绝写 / 浏览器写本地 / 桌面异步写库 / 连续写排队」。第 100 批从三份手抄收拢成一份——此前只有
  收益账做了写队列，物价与名册连点两次会丢后一笔。**归一、排序、种子数据、`storage` 事件仍归
  各页的 store**，骨架只回答「怎么落地」。
- **`localStorage` 只剩一条窄用途**：浏览器（`npm run dev`、探针）——没有 Tauri 宿主，
  `hasDesktop()` 为假，三个 store 直接走本地分支。早先它还是「旧版 Electron 数据的来源」
  （`migrateLegacy` 搬一次、老键改名 `*.migrated` 留底）；2026-11-04 起不接老数据，
  整套迁移连命令一起删了，见 §3 数据目录。

## 3. 磁盘与兼容红线

| 项         | 事实                                                                   | 为什么不能改                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据目录   | `%APPDATA%\mh-tool-rs`（`lib.rs` 的 `data_dir_path()`）                | 全局唯一真源。2026-11-04 与旧版 Electron 分家（原共用 `mh-tool-v2`）；换名靠一次性迁移，不是直接指过去                                                  |
| identifier | `com.zhijian.mhtoolbox.rs`                                             | 必须与旧版 appId 不同，否则 Windows 把两个安装包当一个应用互相覆盖                                                                                      |
| 卸载       | `deleteAppDataOnUninstall: false`                                      | 卸载重装不该丢账                                                                                                                                        |
| 镜像       | **不做** SQLite → JSON 反向镜像（2026-11-04 用户定）                   | 升级单向：旧版打不开新版的账。换来「一份数据只有一个真源」，不必维护双向转换；要带走数据用设置页的手动导出                                              |
| 本地开发   | `vite.config.ts` 的 `server.host` 与 `devUrl` **都必须写 `127.0.0.1`** | Node 把 `localhost` 解析成 `::1`，Vite 只监听 `[::1]:5173`；WebView2 走 IPv4，报 `ERR_CONNECTION_REFUSED` → 白屏，而浏览器打开是好的                    |
| 打包       | `Cargo.toml` 的 `[features] custom-protocol` 不能删                    | `tauri dev` 用 `--no-default-features` 关掉它才连 devUrl；缺了它两种构建产物一模一样，`tauri build` 的包仍去连 devUrl，装到没起 dev server 的机器就白屏 |

## 4. 目录归属速查

| 要加的东西       | 放哪                                                                                      | 不该放哪                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 新页面           | `src/views/`，然后在 `src/navigation.ts` 加一项                                           | 不要改 `router.ts` 的数组——它从 `NAV_ITEMS` 生成                                                                  |
| 工具的子页       | `src/views/tools/`，然后在 `src/tools.ts` 加一项                                          | 不要进 `NAV_ITEMS`——工具越加越多，一件一格会把左栏撑成一列                                                        |
| 新控件           | `src/components/`，先加进 `views/dev/AtomsSection.vue` 验收                               | 不要为一次性用途新开组件                                                                                          |
| 承载内容的卡片   | `components/PaperCard.vue`（`as` 定标签、`face` 定纸色），材质只在 `.board` 一份          | 不要自己写 `border + background + box-shadow` 拼一张卡：抄到第四份必然与 `.board` 漂移，厚度改一处也不跟着变      |
| 新系统能力       | `src/services/<能力>.ts` 一个函数 + Rust 一个 `#[tauri::command]`                         | 不要在组件里 `invoke`；也不要全塞进 `desktop.ts`                                                                  |
| 业务逻辑（计划） | `crates/mh-domain`，纯函数、无 IO                                                         | 不要塞进 `src-tauri/src/`——塞进去就再也拆不出来                                                                   |
| 前端的纯规则     | `src/services/`（如 `ghost-parse.ts`），不碰 IO                                           | 不要塞进 composable——那里一有 ref 就不好单测                                                                      |
| 跨页的数据层骨架 | `src/services/persist.ts`：`createPersist` 管落盘与排队                                   | 不要在每页的 store 里重抄——抄到第四份必然漂移                                                                     |
| 跨窗口同步       | `src/services/storage-sync.ts`：`onStorageSync` 只收「什么时候该重读」                    | 不要把 `event.key === null` 那套判断抄回 store——收益与物价各抄过一遍，边界迟早漏一处                              |
| 跨页的呈现口径   | `src/services/format.ts`：金额折万 / 日期文本（`moneyText`、`todayText`、`fromWan`…）     | 不要让一页去引另一页的模块；那是「记账口径」不是「物价」                                                          |
| 页面自己的数据层 | `src/views/<页>/<名字>.ts`（如 `characters/roster.ts`）：单例状态 + 纯函数 + 单测         | 不要塞进 `services/`——那不是系统能力；也不要写进 `.vue`                                                           |
| 开发期工具       | 页面内的放 `views/dev/` 旁边（如 `tokens.ts`）；跨页面的放 `scripts/`                     | 不要放进 `src/components/`                                                                                        |
| 真窗口烟测       | `tools/e2e/`：`cdp` 连窗口、`ui` 说人话的动作、`assert` 报告、`db` 库快照，用例在 `smoke` | 不要再写 `probe-xxx.mjs`；也别并进 `tools/probe/`——那边每轮从零导航。**新功能的断言加进 `smoke.mjs`，同一个提交** |
| 图标源图         | `assets/icon/app-icon-1024.png` 是 `tauri icon` 的输入；生成脚本在 `scripts/icon/`        | 不要手改 `src-tauri/icons/` 里的产物                                                                              |
| 游戏资源         | `public/game/`（`maps/` `icons/` `data/`），规则见 `docs/GAME-ASSETS.md`                  | 不要放 `src/`——会被改名加哈希，清单里的文件名就对不上                                                             |

## 5. 还没定的

- `crates/` 尚未建立。**第一次写领域代码时必须同时建目录**，否则边界只留在文档里。
- 事件通道（Rust → 前端推送，如长任务进度）还没用上；用之前在这里补一节。

**不做差分 harness**（2026-11-04 用户定：「可以参考旧项目，但不用兼容旧项目」）。旧仓
`E:\zhijian\mh-tool` 是**参考读物**：字段清单、口径上的坑（`splitAmount` 的尾差给谁、跨天的账
怎么归日）、文案与交互可以照抄，但新仓输出不必与旧实现逐位一致，也不为它写兼容层。

于是领域测试写**新版自己的期望**——`100 万平分 3 人 = 34 / 33 / 33`，而不是「与旧实现结果相同」。
判据：两边答案不一样时，要问「**哪个对**」，不是「旧的是多少」。
