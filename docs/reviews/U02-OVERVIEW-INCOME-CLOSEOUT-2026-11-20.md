# 总览与收益本轮收口审查

日期：2026-11-20。档位：日常，不跑验证。审查后用户已授权将当前版本本地归档，最终状态以 Git 为准，不推送。范围为本次总览／收益界面变更、相关公共组件与直接数据依赖，不代表全项目或 D06／D07／U04 整包验收。

## 问题与处理

**[P2，已修复] 同键结束烟测假定短时计时一定留存。** `tools/e2e/sections/income/online.mjs` 的新流程开始后立即结束，仍断言新增记录数为 1；`online-store.ts` 的既有规则则会移除不足一分钟的时段。正常操作会使烟测失败。现改为核对本次 ID、结束时长与原在线名单：短段移除、满一分钟保留已结束记录，同拍连点均不得重新开始。不改业务规则，也不等待一分钟或篡改真实计时时间。断言未执行。

静态范围内未发现其他尚未处理的高置信度阻塞问题。没有运行检查、测试、应用或视觉探针，因此不将此结论表述为“全流程通过”。

## 收敛与清理

1. **纸脊留白只有一份计算。** FoldedCard 统一处理纸脊占位，调用方仅传 `--folded-pad-block`／`--folded-pad-inline`。删除 StatStrip、TeamCard 的重复左右计算，原内边距和方向保持。embedded 的票口公式只作用于 TicketCard 模式，不再让 folded 携带无用变量。
2. **清理已无业务引用的旧侧签。** 搜索确认 side-tab 唯一调用是开发页示例。移除 PressTile 的 surface 分支、blocks／materials 旧配方、紫檀／水晶排除特判及开发页示例，保留普通 PressTile／PressButton 的材质与行为。旧 HTML 方案作为历史稿保留，不作为现行 API。
3. **组件演示跟随最终方案。** 账号 embedded 示例、左右 FoldedCard 外壳、总览右脊和收益左脊统计、PaperTag、弧面瓷键单键切换／保存中／禁用态均可查看。瓷键样例恢复内容自适应宽、34px 最小高度；TicketCard 演示使用公共压痕，去掉错误的固定件数注释。
4. **文档区分当前与历史。** 更新 CONVENTIONS、ARCHITECTURE、TESTING 和文档索引；两份领域报告指向本报告。优化计划顶部只保留本轮当前状态，将此前连续调整折叠为历史，保留可追溯内容。

## 当前界面与组件归属

| 场景                         | 最终约定                                                                | 数据与交互所有者                                            |
| ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 总览周月统计                 | StatStrip folded，右侧纸脊，纯色面纸                                    | OverviewView／overview.ts，金额和日期先派生再传入           |
| 队伍记录                     | FoldedCard 左侧纸脊，身份与三类记录，固定卡高／内部滚动                 | TeamCard／team-activity.ts；角色档案链接保留                |
| 常用功能与账号快捷记账       | PaperTag 双孔纸签；首页与排序共用 ShortcutFace                          | 页面负责点击、偏好及排序，外壳不持有业务字段                |
| 自定义、补记、记录等辅助入口 | TextButton，无重复底板                                                  | 原弹窗／页面操作，取消与保存链不改                          |
| 收益在线点卡                 | 今日在线／今日收益共用 StatStrip folded 左侧纸脊                        | online-summary／IncomeView 派生；历史单价和昨日对比保留     |
| 角色计时键                   | 弧面瓷键 KeycapButton，同键开始／结束；自适应宽，不按排数拉高           | OnlineBar 在点击时判断当前会话，原同步保存锁阻止同拍反转    |
| 图表                         | 完整绘图区默认 CHART_HEIGHT，隐藏条的原生横滚；保留固定纵轴、悬停和键盘 | TrendChart／AccountBarChart；按日期／角色的数值仍由领域派生 |
| 账号票据                     | 保留 StatStrip embedded／TicketCard 侧缺口                              | 账号自己的汇总口径，未为样式统一迁移为侧折                  |

## 已追踪的依赖与事实

| 功能链     | 本轮确认                                                                                                                                                  | 边界                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 总览摘要   | OverviewView → overview／team-activity → roster、goals、income、online、accounts 的只读状态；周数据来自收益与上线，月收支只从账号读取，避免自动账重复累加 | 聚合算法保持；未重新深审全部角色／目标领域                                          |
| 首页入口   | OverviewShortcuts → 一次性路由 action；仓库 emit 交由 OverviewView 的唯一 lazy WarehouseDialog；偏好经 home-shortcuts 服务保存                            | 检查唯一宿主、空偏好、取消、排序实例释放；仓库内部与 OCR 本批不改                   |
| 单键计时   | OnlineBar → startOne／stopOne → online-store → createPersist → services/storage → online 命令 → store/online.rs 的 SQLite 事务                            | 开始前查重／重叠，保存失败保留 writeError；旧多人按完整名单结束，名册外保留结束入口 |
| 点卡与收益 | online-summary／onlineTotalsOf → sessionSlices、历史单价快照；收益 statRowsOf／totalsOf 继续作为统一口径                                                  | 检查超过 32 天的切片改动与相关断言；不重新计算旧单价                                |
| 自动账     | daily-sync 监听三域读取就绪，恢复后补历史，分钟变化只排入经过日期；applyAutoEntries 不替换手记                                                            | 读取恢复／重读空账／时钟回拨相关断言已读，未执行；未做故障注入或睡眠采样            |
| 共享展示   | FoldedCard／PaperTag／KeycapButton → materials；图表 → chart-style／chart-scroll                                                                          | API 不碰服务／Rust；主题和降动效沿现有公共基座                                      |

Rust 只读取直接关联的 online 存取实现以核对载荷和事务边界，没有修改后端命令、Schema 或绑定，不声称完成全部 Rust 领域审查。公共样式兼容读取延伸至账号纸签／分类图与物价历史图；不扩大为这两个领域的完整业务验收。

## 保留而未重构的部分

- 不合并 TicketCard 与 FoldedCard：缺口跟随签头和固定折脊的几何、生命周期不同；StatStrip 已共用内容模板，增加万能纸卡会扩大条件分支。
- 不抽取“通用统计业务卡”：两页的日期、币种、昨日对比和错误来源不同，共享外壳即可，金额与日期计算仍留在原领域。
- 不抽出三类队伍记录行：语义和空态不同，当前无第二处相同业务复用。
- 不把 startOne／stopOne 合成通用提交框架：分支校验和回执不同，现有同步锁与持久化队列已能表达操作边界。
- 不更改提醒、OCR、资源加载、字体及全局弹窗：本轮没有对应功能变化；此前的独立工作区改动明确列为跳过，不在此报告代替其专项结论。

## 未执行与遗留

未运行 format、lint、typecheck、测试、e2e、build、Rust、CDP、性能采样或视觉验收；未启动应用、未改账本。审查后已获本地提交授权，不因归档扩大审查范围或追加验证。

如后续指定视觉验收，范围应为总览／收益及共享组件开发页：主题明暗与最大字号、左右纸脊留白、长角色名、两排／三排自然高度、密集日期横滚、焦点与图表轴线。动态流程另覆盖计时开始／同键结束／重载／保存失败重试，以及不足一分钟记录的移除。本报告不安排自动执行，也不把用户认可样式视为动态验收已通过。

## 工作区覆盖台账

以下按 `(路径, Git 状态)` 登记本轮交付时的工作区快照。已审查表示读到本次相关差异与足够上下文，不等于逐行阅读整个未改领域。跳过条目保留原样，原因明确列出；不是遗漏或已通过。未变更的依赖阅读证据已在上表说明，不计入变更条目分母。

快照共 71 项：本轮目标 46 项已审查（目标覆盖 100%），25 项明确跳过；不是全工作区审查通过。

| 路径                                                    | Git 状态 | 本轮状态 |
| ------------------------------------------------------- | -------- | -------- |
| docs/ARCHITECTURE.md                                    | M        | 已审查   |
| docs/CONVENTIONS.md                                     | M        | 已审查   |
| docs/OPTIMIZATION-PLAN-2026-11-18.md                    | M        | 已审查   |
| docs/README.md                                          | M        | 已审查   |
| docs/RECORD.md                                          | M        | 已审查   |
| docs/TESTING.md                                         | M        | 已审查   |
| docs/reviews/U02-INCOME-REVIEW-2026-11-19.md            | M        | 已审查   |
| docs/reviews/U02-OVERVIEW-REVIEW-2026-11-19.md          | M        | 已审查   |
| src/components/PressTile.vue                            | M        | 已审查   |
| src/components/StatStrip.vue                            | M        | 已审查   |
| src/components/TicketCard.vue                           | M        | 已审查   |
| src/components/TrendChart.vue                           | M        | 已审查   |
| src/components/chart-style.ts                           | M        | 已审查   |
| src/styles/base.css                                     | M        | 已审查   |
| src/styles/blocks.css                                   | M        | 已审查   |
| src/styles/materials.css                                | M        | 已审查   |
| src/styles/theme-materials.css                          | M        | 已审查   |
| src/views/accounts/AccountBarChart.vue                  | M        | 已审查   |
| src/views/accounts/AccountCharts.vue                    | M        | 已审查   |
| src/views/accounts/AccountsView.vue                     | M        | 已审查   |
| src/views/accounts/accounts-page.css                    | M        | 已审查   |
| src/views/accounts/daily-sync.test.ts                   | M        | 已审查   |
| src/views/accounts/daily-sync.ts                        | M        | 已审查   |
| src/views/dev/AtomsSection.vue                          | M        | 已审查   |
| src/views/dev/atoms-section.css                         | M        | 已审查   |
| src/views/income/IncomeView.vue                         | M        | 已审查   |
| src/views/income/OnlineBar.vue                          | M        | 已审查   |
| src/views/income/OnlinePanel.vue                        | M        | 已审查   |
| src/views/income/online.test.ts                         | M        | 已审查   |
| src/views/income/online.ts                              | M        | 已审查   |
| src/views/overview/OverviewGoals.vue                    | M        | 已审查   |
| src/views/overview/OverviewShortcuts.vue                | M        | 已审查   |
| src/views/overview/OverviewView.vue                     | M        | 已审查   |
| src/views/overview/ShortcutFace.vue                     | M        | 已审查   |
| src/views/overview/ShortcutSortTile.vue                 | M        | 已审查   |
| src/views/overview/TeamCard.vue                         | M        | 已审查   |
| src/views/prices/PriceChart.vue                         | M        | 已审查   |
| src/views/prices/PriceHistoryDialog.vue                 | M        | 已审查   |
| tools/e2e/sections/01-nav.mjs                           | M        | 已审查   |
| tools/e2e/sections/05-accounts.mjs                      | M        | 已审查   |
| tools/e2e/sections/income/online.mjs                    | M        | 已审查   |
| tools/e2e/sections/income/quick.mjs                     | M        | 已审查   |
| docs/reviews/U02-OVERVIEW-INCOME-CLOSEOUT-2026-11-20.md | ??       | 已审查   |
| src/components/FoldedCard.vue                           | ??       | 已审查   |
| src/components/KeycapButton.vue                         | ??       | 已审查   |
| src/components/PaperTag.vue                             | ??       | 已审查   |

| 路径                                                  | Git 状态 | 本轮状态与原因                                                             |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| assets/fonts/MHHei.woff2                              | D        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| assets/fonts/README.md                                | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| assets/fonts/SourceHanSans-OFL.txt                    | D        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| docs/previews/home-style-options.html                 | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/online-card-options.html                | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/online-role-options.html                | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/shortcut-button-options.html            | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/shortcut-editor-options.html            | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/team-receipt-options-v2.html            | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/previews/team-receipt-options.html               | M        | 已跳过：历史候选稿，仅字体选项等前批改动，不作为现行组件真源。             |
| docs/reviews/U04-INCOME-HISTORY-2026-11-19.md         | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/components/ModalShell.vue                         | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/components/lazy-dialog.test.ts                    | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/components/lazy-dialog.ts                         | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/composables/use-font-family.test.ts               | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| src/composables/use-font-family.ts                    | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| src/composables/use-modal-motion.test.ts              | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/composables/use-modal-motion.ts                   | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/composables/use-modal-size.ts                     | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/composables/use-modal.ts                          | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/styles/token-core.css                             | M        | 已跳过：全局弹窗／字体独立变更；仅读其调用或令牌前提，未重做整条专项审查。 |
| src/views/settings/AboutSection.vue                   | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| tools/e2e/sections/07-settings.mjs                    | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| tools/font/import-ui-fonts.py                         | M        | 已跳过：字体调整独立批次，未纳入本轮两页收口。                             |
| docs/reviews/U02-THREE-PAGES-FOUNDATION-2026-11-20.md | ??       | 已跳过：前批独立报告，本轮仅引用相关事实，未重新审查全文。                 |
