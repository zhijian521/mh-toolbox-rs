# 架构

> 这份文件回答「东西该放哪、数据怎么流、哪些边界不能破」。
> 视觉与规范不在这里（见 [`CONVENTIONS.md`](CONVENTIONS.md)），本机环境不在这里（见 [`AGENTS.md`](../AGENTS.md)）。
>
> **现状说明**：前端已成型，SQLite 数据层已落地（`src-tauri/src/store.rs`：物价与角色名册
> 共用 `%APPDATA%\mh-tool-v2\mh-toolbox.db`），账本的进出落地在 `src-tauri/src/backup.rs`
> （导出 / 导入 / 清除，见 §2）；还剩总览 / 账号 / 目标三页。
> **不做 SQLite → JSON 反向镜像**（2026-11-04 用户定，见 `AGENTS.md` 红线 6）：升级单向，
> 旧版 Electron 不再读新版的数据。
> **也不做差分 harness**（同日定，见 §5）：旧仓是参考读物，不是兼容目标。
> 下面带「计划」字样的段落是动手前就定好的边界，不是对现状的描述——
> 它们写在这里的意义是：第一次写领域代码的人不用自己发明一套。

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
│        mh-store    SQLite 读写与迁移（无 JSON 镜像，见红线 6） │
└──────────────────────────────────────────────┘
```

规则只有一条真正硬：**渲染层不直接引 `@tauri-apps/*`**。由 ESLint 的
`no-restricted-imports` 拦住 `components/`、`views/`、`composables/`，要系统能力就往
`services/` 加一个函数。窗口控制（最小化 / 最大化 / 关闭）在这条线上，
捕捉任务栏的截屏与 OCR 也是。

**一个能力一个文件**，不再全部堆进 `desktop.ts`：那个文件管的是「应用外壳」
（版本信息、外链、窗口三键），捉鬼的 `ghost.ts` 管的是「读游戏画面」，
两者唯一的共同点是都过 invoke。堆在一起会让「哪些命令服务于哪块界面」看不出来。

## 2. 数据流

```
页面 ──调用──▶ composable / services ──invoke──▶ Rust 命令 ──▶ 领域层 ──▶ 磁盘
  ▲                                                        │
  └────────────────── 返回值（camelCase）◀──────────────────┘
```

- **契约只有一处真源（计划）**：现在 `AppInfo` / `PriceItem` / `PricePoint` / `ImportSummary` /
  `ClearSummary` 在 Rust 与 TS 各写一份，靠 `#[serde(rename_all = "camelCase")]` 对齐。命令**已经 15 个**
  （`lib.rs` 的 `generate_handler!`：`app_info`、`open_external`、`ghost_*` 两个、`backup::` 三个、
  `store::` 八个），
  早已越过当初定的「5 个以上就必须上 `tauri-specta`」那条阈值，**而 `tauri-specta` 还没接**——
  这不再是「以后再说」，是当前最大的一处欠账：「两边字段名对得上」现在真的靠记忆力。
  注意 `generate_handler!` 那份表**按平台写了两份**（`#[cfg(windows)]` / `#[cfg(not(windows))]`）：
  加命令必须两份都加，漏掉非 Windows 那份在本机完全看不出来。
- **数据进出走 `src-tauri/src/backup.rs`**：三个命令 `data_export` / `data_import` / `data_clear`
  管的是「离开这台机器的那个文件」——`format` + `app` + `exportedAt` 的信封、`backups/` 下的自动备份、
  导入前那几条校验。**它不碰 SQL**：读写库一律回落到 `store.rs` 的普通函数，不在那里再写第二份查询。
  两条语义要记住：**导入 = 整体替换**（动手前把当前数据导一份到 `<数据目录>\backups\`，
  路径随回执显示给用户）；**清除 = 只清角色与物价**，`meta` 一个字不动——迁移标记清掉了，
  下次启动会从旧 `localStorage` 又搬一遍，等于把用户刚清掉的再搬回来。
  旧版 Electron 的 `data.json`（`schemaVersion: 10`，角色结构完全不同）**不在这个入口的范围内**：
  它会另做一个一次性转换入口，这里的导入只认自己的信封，不认识就拒绝、不猜。
- **前端状态**：7 个持久状态（主题、字号、应用信息、路由、开发者模式、角色名册、物价表），
  另有两个瞬时 UI 单例（`use-confirm` / `use-notify`）写法相同但不落盘。**不引 Pinia**——
  触发条件是「出现跨三个以上组件的共享业务状态」，届时再上，并在此处记录决定。
  角色名册（`views/characters/roster.ts`）与物价表（`views/prices/prices-store.ts`）都已经
  跨三个组件（页面、卡片、弹窗），但它们用的是与主题、字号同一套「模块级 `ref` + `useXxx()`
  导出」，没有引入第二套状态机制。
- **写盘时机**：口径是「先改内存模型，再整份写 SQLite」，两步都在这条命令里完成，
  调用方不需要知道顺序。**JSON 反向镜像不做**（2026-11-04 用户定，见 `AGENTS.md` 红线 6）：
  旧版 Electron 不再读新版的数据，库文件是唯一真源。要带走 / 恢复时用设置页的
  「导出账本」（`backup.rs` 的 JSON 信封），那是**手动**的、面向人的，不是自动镜像。
- **桌面版以 SQLite 为主，`localStorage` 退成两条窄用途**：物价（`mh-prices`）与角色名册
  （`mh-roster`）都已搬进 SQLite，第一次启动时搬一次、搬成功才把老键改名为 `*.migrated` 留底，
  并在库的 `meta` 表打标记。之后 `localStorage` 只在两处还活着：① 浏览器（`npm run dev`、
  探针）——那里没有 Tauri 宿主，`hasDesktop()` 为假，`prices-store.ts` / `roster.ts` 直接走
  `localStorage` 分支；② 迁移来源，「库坏了还能捞一把」的底。

## 3. 磁盘与兼容红线

| 项         | 事实                                                                   | 为什么不能改                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据目录   | `%APPDATA%\mh-tool-v2`（`lib.rs` 的 `data_dir()`）                     | 与旧版 Electron 共用；改成 Tauri 默认的 `%APPDATA%\<identifier>` 等于让朋友的数据「消失」                                                                   |
| identifier | `com.zhijian.mhtoolbox.rs`                                             | 必须与旧版 appId 不同，否则 Windows 把两个安装包当一个应用互相覆盖                                                                                          |
| 卸载       | `deleteAppDataOnUninstall: false`                                      | 卸载重装不该丢账                                                                                                                                            |
| 镜像       | **不做** SQLite → JSON 反向镜像（2026-11-04 用户定）                   | 升级单向：旧版 Electron 打不开新版的账。换来「一份数据只有一个真源」，不必维护两代结构的双向转换；要带走数据用设置页的手动导出                              |
| 本地开发   | `vite.config.ts` 的 `server.host` 与 `devUrl` **都必须写 `127.0.0.1`** | Node 把 `localhost` 解析成 `::1`，Vite 于是只监听 `[::1]:5173`；WebView2 走 IPv4，报 `net::ERR_CONNECTION_REFUSED` → 白屏，而浏览器打开却是好的             |
| 打包       | `Cargo.toml` 的 `[features] custom-protocol` 不能删                    | `tauri dev` 用 `--no-default-features` 关掉它才连 devUrl；缺了它两种构建产物一模一样，`tauri build` 的包仍去连 devUrl，装到没起 dev server 的机器上就是白屏 |

## 4. 目录归属速查

| 要加的东西       | 放哪                                                                                                | 不该放哪                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 新页面           | `src/views/`，然后在 `src/navigation.ts` 加一项                                                     | 不要改 `router.ts` 的数组——它从 `NAV_ITEMS` 生成           |
| 工具的子页       | `src/views/tools/`，然后在 `src/tools.ts` 加一项                                                    | 不要进 `NAV_ITEMS`——工具越加越多，一件一格会把左栏撑成一列 |
| 新控件           | `src/components/`，先加进 `views/dev/AtomsSection.vue` 验收                                         | 不要为一次性用途新开组件                                   |
| 新系统能力       | `src/services/<能力>.ts` 一个函数 + Rust 一个 `#[tauri::command]`                                   | 不要在组件里 `invoke`；也不要全塞进 `desktop.ts`           |
| 业务逻辑（计划） | `crates/mh-domain`，纯函数、无 IO                                                                   | 不要塞进 `src-tauri/src/`——塞进去就再也拆不出来            |
| 前端的纯规则     | `src/services/`（如 `ghost-parse.ts`、`ghost-model.ts`），不碰 IO                                   | 不要塞进 composable——那里一有 ref 就不好单测了             |
| 页面自己的数据层 | `src/views/<页>/<名字>.ts`（如 `characters/roster.ts`）：单例状态 + 纯函数 + 单测                   | 不要塞进 `services/`——那不是系统能力；也不要写进 `.vue`    |
| 开发期工具       | 页面内的放 `views/dev/` 旁边（如 `tokens.ts`）；跨页面的放 `scripts/`                               | 不要放进 `src/components/`                                 |
| 图标源图         | `assets/icon/app-icon-1024.png` 是 `tauri icon` 的输入；生成脚本在 `scripts/icon/`（`out/` 已忽略） | 不要手改 `src-tauri/icons/` 里的产物                       |
| 游戏资源         | `public/game/`（`maps/` 底图、`icons/` 图标、`data/` 数据表），规则见 `docs/GAME-ASSETS.md`         | 不要放 `src/`——会被改名加哈希，清单里的文件名就对不上了    |

## 5. 还没定的

- `crates/` 尚未建立。**第一次写领域代码时必须同时建目录**，否则边界只会留在文档里。
- 事件通道（Rust → 前端推送，如长任务进度）还没用上；用之前在这里补一节。

**不做差分 harness**（2026-11-04 用户定：「可以参考旧项目，但不用兼容旧项目」）。

旧仓 `E:\zhijian\mh-tool` 是**参考读物**，不是兼容目标：字段清单、口径上的坑（`splitAmount`
的尾差给谁、跨天的账怎么归日）、文案与交互可以照着抄，但新仓的输出不必与旧实现逐位一致，
也不为它写兼容层、不读它的 `data.json`（`backup.rs` 的模块注释已按这条写）。

于是领域测试写**新版自己的期望**——`100 万平分 3 人 = 34 / 33 / 33`，而不是「与旧实现结果相同」。
差别在改的时候才看得出来：哪天决定尾差给最后一个人，改一条测试即可，不算违约；
而差分 harness 会把每一次有意改口径都判成回归。

判据：两边答案不一样时，要问的是「**哪个对**」，不是「旧的是多少」。
