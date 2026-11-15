# 架构

回答目录归属、数据流与系统边界。样式与控件契约见 [工程规范](CONVENTIONS.md)，本机操作及红线见 [协作约定](../AGENTS.md)。

## 1. 分层与目录

| 目录              | 职责                                            |
| ----------------- | ----------------------------------------------- |
| src/views/<领域>/ | 页面编排、业务组件、模型与数据层；测试放模块旁  |
| src/components/   | 跨页面视觉组件与无业务归属的展示逻辑            |
| src/composables/  | 可复用状态与副作用；单例放模块作用域            |
| src/services/     | 系统能力唯一出口、持久化骨架与生成 IPC 绑定     |
| src/import/       | 旧版数据集中转换，页面只接收当前结构            |
| src/styles/       | tokens 设计令牌、base 元素基座、blocks 组合排版 |
| src/types/        | 全局声明与模块增强；业务类型留在所属领域        |
| src-tauri/src/    | 窗口、IPC、SQLite、备份、截图与 OCR             |
| public/game/      | 游戏资源与事实规则；不放进 src/ 参与哈希改名    |
| tools/            | 烟测、探针与资源加工工具                        |
| scripts/          | 工程检查、分区测试与打包脚本                    |
| docs/archive/     | 历史快照，不参与现行规则维护                    |

业务功能在原领域内聚，出现第二个真实调用方才提取公共实现；不建立空目录或为尚未出现的多宿主需求拆 Rust crates。

### 启动与按需加载

先绘制标题栏与加载页，再加载规则、业务数据与历史对账，最后开放业务路由。单个领域读取失败保留恢复与写入保护；
启动失败保留重试入口。首屏完成再通知后台预热 OCR，提前识别仍使用同一 OnceLock。
编辑器与历史弹窗经 components/lazy-dialog.ts 首次打开时加载，复用请求、组件及原焦点契约，支持取消和重试。

## 2. 数据流

```
页面 ──调用──▶ composable / services ──invoke──▶ Rust 命令 ──▶ 领域层 ──▶ 磁盘
  ▲                                                        │
  └────────────────── 返回值（camelCase）◀──────────────────┘
```

- **契约是一处真源：`tauri-specta` 生成的 `src/services/bindings.ts`**。命令表在 `lib.rs`，
  字段名、参数与返回类型都由 Rust 的 `specta::Type` 派生**生成**到 TS，
  不再两边手抄、也不再靠 `#[serde(rename_all = "camelCase")]` 加上记忆力对齐。
  `bindings.ts` 是**生成物**：每次 debug 启动重写，别手改；`prettier` 与 `eslint` 都把它排除在外。
  `collect_commands!` **按平台写了两份**（`#[cfg(windows)]` / `#[cfg(not(windows))]`）：加命令
  必须两份都加，漏掉非 Windows 那份在本机完全看不出来——`ipc-contract.test.ts` 会红。
- **数据进出走 `backup.rs`**：`data_export` / `data_import` / `data_clear` 管的是「离开这台机器
  的那个文件」——`format` + `app` + `exportedAt` 的信封、`backups/` 下的自动备份、导入前校验；
  `quick_prices_export` / `quick_prices_import` 是同一套信封的窄口径，只装速记单价。
  **它不碰 SQL**：读写库一律回落 `store.rs` 的普通函数，不在那里写第二份查询。两条语义：
  **导入 = 整体替换**（动手前把当前数据导一份到 `<数据目录>\backups\`，路径随回执给用户）；
  **清除 = 清掉全部业务表**，`meta` 一个字不动（`schemaVersion` 在那儿）。旧版 `data.json`
  （`schemaVersion: 10`，角色结构完全不同）**不在这个入口范围内**：常规导入不做转换或反向镜像；
  这里只认自己的信封，不认识就拒绝、不猜。旧版专用入口通过 `src/import/legacy.ts` 集中转换 v10 数据，页面只消费当前结构；文件读取和原件留存由 `backup.rs` 负责，提交复用同一备份与事务替换函数。
- **首次旧版导入**：启动先调用 `legacy_startup_read`，仅在首次检测且全部业务表为空时读取 `%APPDATA%\mh-tool-v2\data.json`；有旧数据才加载转换模块，复用设置页的转换与导入服务。`meta.legacyStartup` 保留检测结果，清空后不重复检测；自动导入在立即事务中再次判空，数据与成功标记一并提交。全部领域随后读取导入结果，再开启日常对账；业务页面绘制后弹出成功或失败提示，失败仍可从设置页手动导入。旧文件不修改、不回写。
- **日常备份与恢复**：主窗口创建后启动独立备份线程，使用独立数据库连接，每五分钟检查一次，按至少 24 小时间隔保留最近 14 份；取数复用 `store::backup` 的同一读事务。`backups_list` 只列出本地日常和替换前 JSON，`backup_restore` 校验文件后复用整份替换路径。失败在恢复窗口显示，不阻断正常读写。
- **成长历史**：记录位于角色 JSON 的可选 `growthHistory`，由 `roster.update` 统一比较保存前后值生成，目标回写使用同一入口；草稿不覆盖已有历史。旧版历史只在专用转换模块归一，随角色备份与恢复。
- **检查更新**：`services/updates.ts` 仅在用户点击时查询 GitHub 正式 Release，处理无版本、限流与网络失败，下载通过已有外链服务打开本仓 Release 页面。CSP 仅放行 `https://api.github.com`，不引入自动安装器。
- **前端状态**：业务与偏好使用模块级状态（主题、字体、字号、应用信息、路由、开发者模式、角色名册、物价表、收益
  账、账号账、目标），另有两个瞬时 UI 单例（`use-confirm` / `use-notify`）写法相同但不落盘。
  **不引 Pinia**——触发条件见 `AGENTS.md` §七。名册与物价表都已跨三个组件（页面、卡片、弹窗），
  但用的是与主题、字号同一套「模块级 `ref` + `useXxx()`」，没有第二套机制。
- **写盘时机**：先更新内存，再排队整份写 SQLite；保存回执与收表单等待本领域的 `flush()`，失败保留错误与重试入口。导出、导入、清除和系统关窗等待 `flushPendingWrites()`，关窗失败时由用户选择保留窗口或放弃改动退出。
- **六份数据层的落盘是同一份实现**（`src/services/persist.ts`）：`createPersist` 管「读失败
  拒绝写 / 浏览器写本地 / 桌面异步写库 / 连续写排队 / 可等待结果与 pending 状态」。各领域共用队列，避免连续写入覆盖。
  **归一、排序、种子数据、`storage` 事件仍归各页的 store**，骨架只回答「怎么落地」。
- **日期**：页面范围、目标期限与日历共享 `useToday()`，午夜更新，在焦点、可见性或页面恢复时重新对时；最后一个消费者卸载时清理计时器和监听。
- **业务数据的 `localStorage` 路径仅用于浏览器**（`npm run dev`、探针）——没有 Tauri 宿主，
  `hasDesktop()` 为假，六个 store 直接走本地分支。主题、字体、字号、闹钟和首页快捷入口属于本机偏好，桌面版也使用 `localStorage`，不随账本导出。

字体独立选择由 `use-font-family.ts` 单例维护，挂载前恢复 `mh-font-family` 并设置根属性 `data-font`；缺失或非法值使用原有文楷。字体族只在 `tokens.css` 中定义，界面与 Canvas 共用 `--font-ui`，字体加载完成后地图重绘。三种字体随包提供，固定来源、许可与子集生成方式见 [assets/fonts/README.md](../assets/fonts/README.md)。

### 业务联动

- 首页只读角色、收益、账号、上线和目标摘要，不新增账本或表单；快捷入口通过一次性路由 action 打开原页面功能。
- 收益记录产出，账号分别按元、万记钱包收支；展示最多两位小数，历史与自动计算保留原精度。
- accounts/daily-sync.ts 单向将收益净额与分摊点卡同步到账号；稳定 ID 保证幂等，修改只更新受影响日期，启动全量对账，关闭前排空队列。
- 每段上线属于一个角色，cardCost 保存当时口径。旧多人段仅兼容读取，时长不分摊，点卡按人数分摊。
- 目标养成读角色档案，手动目标累计流水；更新养成回写同一 roster.update 入口并生成成长历史。
- 提交使用 usePersistedSubmit：业务变更一次，失败保留草稿，重试只落盘；删除使用 useConfirmedRemoval。
- 历史窗口共用 RecordPager 与分页逻辑；角色选项统一由 character-options.ts 生成。

## 3. 数据与打包边界

数据目录、identifier、卸载保留数据和单向升级以 [AGENTS.md §六](../AGENTS.md#六红线改代码前必须知道) 为准。
旧版导入是独立、集中、单向的转换入口，常规导入只认新版信封，不猜格式，不回写旧文件。
打包必须保留 custom-protocol；否则安装后的应用仍依赖开发服务。发布流程见 [RELEASE.md](RELEASE.md)。

## 4. 扩展入口

- 主导航登记 src/navigation.ts，路由从 NAV_ITEMS 派生；工具子页在现有工具目录登记。
- 系统能力先在 Rust 定义命令和类型，登记两张 collect_commands!，debug 生成绑定后由 services/ 封装调用。
- 资源维护见 GAME-ASSETS.md；测试归属及最小联动范围见 TESTING.md。
- 新事件推送或多宿主领域复用确有需求时，再补协议与模块，不预建占位实现。

## 5. 追溯

[改动记录](RECORD.md) 保留近期结果及历史索引。旧项目用作业务参考；测试以新版业务期望为准，不维护两代运行结果的差分框架。
