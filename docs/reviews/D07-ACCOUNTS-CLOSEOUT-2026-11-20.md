# D07 账号页面静态审查收口

日期：2026-11-20。档位：日常 · 不跑验证。范围为本轮账号主界面、历史、记账、仓库与穿戴交易改动及直接依赖；依据 AGENTS、CONVENTIONS、ARCHITECTURE、TESTING 和执行方案审查，不进入下一工作包、不提交。

## 问题与处理

[P2][高置信度][已修复] 旧档穿戴物品正常出售可能被误判为快照过期。

位置：src-tauri/src/store/character_assets.rs 的 detach_sales。旧档允许省略 points、attrs、quality 等默认字段，前端 normalizePet／normalizeGearDetail 在读取和组装成交快照时补齐空数组或零值；原实现将这些快照直接与 Rust 从原始 JSON 组装的当前物品比较。即使实际属性未改也会拒绝出售，并让账号交易停留在待重试状态。已增加只用于比较的 snapshot_content：缺省和零／空默认字段等价，编号、有值属性和数组内容／顺序仍参与比较，原库存和成交资料不据此改写。补 Rust 回归断言，既覆盖旧档成功成交，也覆盖成长改变及技能顺序改变时拒绝；未执行。

概览和历史原先各维护一份币种标题、笔数、金额与方向色派生，已提取 account-summary.ts 的 accountSummaryBooks，两个页面只提供各自的筛选结果。没有增加新的公共组件或样式副本；StatStrip、FoldedCard、PaperTag、NumTag 继续复用既有组件。补双币种隔离、负差额、零值与格式化的逻辑断言，未执行。

本轮静态审查没有再确认其他阻塞问题。该结论不代表动态流程、视觉、性能或全量检查通过。

## 依赖链与已确认事实

| 功能 | 路径与边界 |
| ---- | ---------- |
| 页面统计 | AccountsView → rangeOf／filterAccounts → accountSummaryBooks → accountStatsByCurrency／accountValueText → StatStrip／FoldedCard。历史以自己的 filtered 调同一生成函数；人民币元与梦幻币万分开，不合成总额。 |
| 快捷记账 | SHORTCUTS → shortcutTotals（按分类和方向跨渠道、排除自动账）→ PaperTag → AccountEditor → usePersistedSubmit → accounts-store。自然换行和单卡限宽保留，三项统计及日期文字按用户最终选择保留。 |
| 历史 | 主页面 useRecordFilters → AccountRecords 的日期、搜索、细分条件 → filtered → 公共统计和 usePagination → 固定外框／sticky 表头。折叠只影响展示，重开保留条件；删除仍经 useConfirmedRemoval 和原 flush／retry。 |
| 仓库浏览 | WarehouseDialog → useWarehouse／useAccounts → soldWarehouseItems → warehouseItemsByState → filterWarehouse → 分页 → WarehouseItems／GearTip／PetTip。全部包含成交快照但售出只读；装备仅部位筛选、召唤兽关键词独立，隐藏关键词不影响装备。 |
| 识别草稿 | WarehouseEditor → 现有 GearScreenshot／PetScreenshot 与解析结果 → 归一／预览 → 确认后回传 AccountEditor，或由仓库保存。取消不入仓、不记账；本轮不改 OCR 算法和游戏词典。 |
| 四种交易 | AccountEditor.assetSource → EntryInput → planAssetTrade。录入买入新增、选择买入只关联原编号；选择卖出移出、录入卖出只留成交快照。买卖选择均允许穿戴／携带物品；既有交易关联保持只读。 |
| 穿戴出售 | stageWarehouseTrade → stageSoldRosterAssets → detachSoldCharacterAssets，按编号清空装备位／移除宠物，其余档案保留，不新增成长记录。待保存时锁住仓库及名册，失败保留状态供账号队列重试；删除卖出只回仓，不自动重新穿戴。 |
| 桌面落盘 | accounts-store → persist → services/storage.accountTradeSave → 现有生成绑定／store::account_trade_save → save_account_trade → detach_sales／check_worn → 同一 SQLite 事务保存角色、账号和库存。IPC 签名、两张命令表和 Schema 没变，无须改生成绑定；普通仓库删除仍不能移除穿戴物品。 |
| 浏览器恢复 | asset-trade-local 日志保存账号、库存及可选名册；中断后保留日志，角色／仓库／账号读取前恢复。旧的两份数据日志仍可读，恢复测试维护第三份名册写入中断的场景。 |
| 手续费／同步 | account-fees 从 services/gameplay 的游戏规则取得费率，按整数分向上收取，仅藏宝阁人民币卖出扣费；旧账修改默认实得。daily-sync 仍按稳定 ID 从收益与点卡单向同步，来源加载失败／恢复和原重试逻辑不改。 |
| 公共样式／资源 | 材质只来自 styles 入口。共享柱色 65% 不透明度、220px 图高、横滚隐藏条及开发说明只核对引用与改动，不再调整用户已确认效果；游戏规则／图标与字体资源不新增、不搬动。 |

## 覆盖台账

本表以本轮工作区的（路径、Git 状态）标识逐项记录，包含未跟踪文件；已审查表示已阅读相应改动和必要上下文。不是逐行审遍全仓，也不是测试通过率。

台账 40 项，已审查 40 项，跳过 0 项；文件条目覆盖 100%，不代表动态验证覆盖。

| 路径 | 状态 | 审查结果 |
| ---- | ---- | -------- |
| docs/ARCHITECTURE.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/CONVENTIONS.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/OPTIMIZATION-PLAN-2026-11-18.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/RECORD.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/TESTING.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/reviews/D07-ACCOUNTS-REVIEW-2026-11-19.md | M · 已审查 | 现行规范、进度与历史指向 |
| docs/reviews/U02-OVERVIEW-REVIEW-2026-11-19.md | M · 已审查 | 核对公共柱色及联动说明；本轮不改效果 |
| src-tauri/src/store.rs | M · 已审查 | 穿戴保护、快照核对与事务边界 |
| src-tauri/src/store/character_assets.rs | M · 已审查 | 穿戴保护、快照核对与事务边界 |
| src-tauri/src/store/tests.rs | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/components/chart-style.ts | M · 已审查 | 核对公共柱色及联动说明；本轮不改效果 |
| src/services/asset-trade-local.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/services/asset-trade-local.ts | M · 已审查 | 恢复日志、落盘与错误边界 |
| src/views/accounts/AccountEditor.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/AccountRecords.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/AccountsView.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/account-analysis.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/views/accounts/account-assets-store.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/views/accounts/account-assets.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/views/accounts/account-assets.ts | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/accounts-page.css | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/accounts-store.ts | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/characters/roster.ts | M · 已审查 | 售出解除归属及名册写入保护 |
| src/views/dev/AtomsSection.vue | M · 已审查 | 核对已登记的共用外壳示例，无新业务原子 |
| src/views/warehouse/WarehouseDialog.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/WarehouseEditor.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/WarehouseItems.vue | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/character-assets.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/views/warehouse/character-assets.ts | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/warehouse-store.ts | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/warehouse.css | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/warehouse/warehouse.test.ts | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| src/views/warehouse/warehouse.ts | M · 已审查 | 账号／仓库呈现、状态与领域契约 |
| tools/e2e/sections/01-nav.mjs | M · 已审查 | 核对公共柱色及联动说明；本轮不改效果 |
| tools/e2e/sections/05-accounts.mjs | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| tools/e2e/sections/characters/assets.mjs | M · 已审查 | 成功／取消／失败／重载或回归断言，未执行 |
| docs/reviews/D07-ACCOUNTS-STYLE-2026-11-20.md | ?? · 已审查 | 现行规范、进度与历史指向 |
| src/views/accounts/AccountRecentRecords.vue | ?? · 已审查 | 账号／仓库呈现、状态与领域契约 |
| src/views/accounts/account-summary.ts | ?? · 已审查 | 双币种展示生成共用 |
| docs/reviews/D07-ACCOUNTS-CLOSEOUT-2026-11-20.md | ?? · 已审查 | 本轮结论、覆盖与未验收项 |

附加只读依赖：accounts.ts、account-analysis.ts、account-fees.ts／测试、daily-sync.ts、AccountCharts／AccountFlowCard／AccountBarChart、warehouse-store 既有测试、characters/details.ts、load-data.ts、persist.ts、storage.ts、startup.ts／App.vue、记录筛选／分页／提交 composable。首屏加载有 AppStartup 门控，因此未把“启动时先显示空账”列为缺陷；写入、读取和恢复仍按领域原入口承接。

## 保留现状与理由

- 保留用户已确认的布局、按钮位置、三种状态签与纸卡材质，不再提出新视觉方案。
- 历史的筛选、关键字、页码、滚动由原父级状态管理；新增折叠状态不落盘。金额、手续费与自动账口径不改。
- 近期记录已有单领域组合，仓库图标／属性浮层已有真实复用；不再拆出只有一处用途的同义组件。公共原子演示已包含四类外壳与控件，业务统计生成函数无需新增原子演示。
- 不改 Rust 命令签名、数据目录、identifier、备份格式、原子交易或真实账本；后端修复限定于快照比较，不增加迁移。
- 既有已提交代码的全部并发、跨窗口、迁移与外部故障不由本轮静态审查兜底；未据此扩大工作包。

## 断言、未验证部分与下一步

本轮新增账号展示生成断言和 Rust 旧档快照回归断言；前批账号／角色仓库烟测、三域回滚／重试和浏览器日志断言已审查。没有运行 format、lint、typecheck、test、e2e、build、Rust 编译／测试／Clippy、CDP、视觉或性能采样，没有启动窗口、读写真实账本、提交或推送。

后续需用户指定范围后再执行：一是桌面穿戴装备／召唤兽买卖、旧档出售、保存失败重试、删除回仓与重载；二是明暗主题、大字号、窄宽、长金额、历史展开与表格滚动。D07 深审和整包动态验收仍未完成，不自动进入下一工作包。
