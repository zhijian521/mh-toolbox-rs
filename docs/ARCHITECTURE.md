# 架构

> 这份文件回答「东西该放哪、数据怎么流、哪些边界不能破」。
> 视觉与规范不在这里（见 [`CONVENTIONS.md`](CONVENTIONS.md)），本机环境不在这里（见 [`AGENTS.md`](../AGENTS.md)）。
>
> **现状说明**：前端已成型，领域层（SQLite / 差分 harness）**还没开始**。
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
│        mh-store    SQLite 读写、迁移、JSON 镜像     │
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

- **契约只有一处真源（计划）**：现在 `AppInfo` 在 Rust 与 TS 各写一份，靠
  `#[serde(rename_all = "camelCase")]` 对齐。命令到 5 个以上之前必须上
  `tauri-specta` 由 Rust 类型生成 TS，否则「两边字段名对得上」会退化成记忆力问题。
- **前端状态**：目前 5 个（主题、字号、应用信息、路由、角色名册）。**不引 Pinia**——
  触发条件是「出现跨三个以上组件的共享业务状态」，届时再上，并在此处记录决定。
  角色名册（`views/characters/roster.ts`）已经跨三个组件（名册页、卡片、编辑器），
  但它用的是与主题、字号同一套「模块级 `ref` + `useXxx()` 导出」，没有引入第二套状态机制。
- **写盘时机（计划）**：领域层的写操作一律「先写内存模型，再落 SQLite，再写 JSON 镜像」，
  三步由 `mh-store` 一个函数包住，调用方不需要知道顺序。
  在那之前，**角色名册落在 `localStorage`（`mh-roster`）**：它是这一页唯一的真数据，
  而 `mh-store` 还没起来。这一层被刻意压成「读 / 写各一个函数」，换存储只改那两处。

## 3. 磁盘与兼容红线

| 项         | 事实                                                                   | 为什么不能改                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据目录   | `%APPDATA%\mh-tool-v2`（`lib.rs` 的 `data_dir()`）                     | 与旧版 Electron 共用；改成 Tauri 默认的 `%APPDATA%\<identifier>` 等于让朋友的数据「消失」                                                                   |
| identifier | `com.zhijian.mhtoolbox.rs`                                             | 必须与旧版 appId 不同，否则 Windows 把两个安装包当一个应用互相覆盖                                                                                          |
| 卸载       | `deleteAppDataOnUninstall: false`                                      | 卸载重装不该丢账                                                                                                                                            |
| 镜像       | 数据层落地时必须做 SQLite → JSON 反向镜像                              | 一旦转换就退不回旧版；镜像是在旧版仍能打开同一份数据的唯一保证                                                                                              |
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
- 差分 harness 的形态（Node 侧跑旧实现落 JSON / Rust 侧逐字段比）只定了方向，没定文件布局。
- 事件通道（Rust → 前端推送，如长任务进度）还没用上；用之前在这里补一节。
