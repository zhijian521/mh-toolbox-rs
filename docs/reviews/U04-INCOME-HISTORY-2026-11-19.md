# 历史收益与全局弹窗开关：指定小批次

日期：2026-11-19。档位：日常 · 不跑验证。关联 U03／U04，仅处理用户明确指定的动画、角色汇总筛选和表格滚动，不代表整包审查完成。

本轮反馈：角色滑块名称与金额改为同行居中，缩减纵向留白，保留金额完整展示和多角色横向滚动；维护同行几何断言，未运行。业务筛选与公共滑块保持原契约。

## 已确认事实与改动

| 范围 | 证据与处理 |
| ---- | ---------- |
| 弹窗开关 | 原 ModalShell 只有 mask-in／panel-in 入场 CSS，卸载即消失。新增 useModalMotion，以既有时长与曲线淡显、短位移，取消文字缩放。遮罩 VNode 的 Vue 移除钩子保留真实 DOM 至退场结束，避免父级 v-if 同时卸载内部 Transition 而跳过 leave；不复制表单／Canvas、不推迟业务关闭事件。 |
| 动画生命周期 | 入场中关闭读取当前透明度与位置，取消旧动画后接续退场；动画 Promise 的取消被接住。降动效将开关均缩至 1ms，无动画 API 时直接清理。useModalSize 卸载时保存动画当前高度，避免先跳到最终内容高度。 |
| 栈与焦点 | useModal 在卸载时停止面板操作、标记 inert 与 aria-hidden，退场完成再移出栈、解锁背景及恢复焦点。只允许栈顶处理 Esc；退出期间拦截 Esc／Tab；旧窗口退场时不抢后来窗口焦点。栈变为响应式列表，底层离开后存活的面板可接管遮罩。 |
| 筛选与汇总 | IncomeHistoryDialog 原角色下拉和 sum-tag 删除。history-summary.ts 先从整个日期区间汇总，再由 who 过滤明细；总计、未指定、现存角色及有记录的已删角色分别呈现，当前旧选项在空区间仍保留。无记录金额为占位，筛选状态不被静默清空。 |
| 公共选择器 | SteppedSlider 只扩展 #option 插槽，保持原单选、单 Tab 停靠点、方向键及印面落格；名称与金额使用同一按钮。角色多时横向滚动，选中项自动保持可见，长名称省略但保留完整 title。开发页说明同步。 |
| 表格 | 原 border 在 table 本体，随滚动内容离开可视区。新增页面私有 history-table-frame 持有外框及裁剪，内部容器滚动、thead sticky；仍为一张原生表，保留列宽计算、斑马纹、图标、编辑和删除。无需为单个调用提取新通用表组件。 |
| 日期、分页、回看 | 仍使用 DateRangeField、RecordFilters、useRecordScroll 和 usePagination；筛选重置页码及滚动，同上下文重开保留状态。没有修改日期包含边界、排序或每页条数。 |
| 业务、数据与服务 | 历史明细仍经 income-store → createPersist／storage.ts → bindings → lib.rs → store/income.rs → SQLite；角色名册沿原 roster 读取链。编辑与删除仍经原保存队列、确认及 daily-sync 自动分账。现有数据足够派生新摘要，无需新增 IPC、Rust、迁移或账本字段；本批未逐行重审后端事务。 |
| 资源 | 继续使用 itemIconOf 与已有图标，无新增游戏事实、OCR、字体或图像资源。无需改 public/game。 |
| 断言 | 新增区间收支、未指定、已删角色、空区间和角色切换不缩减汇总断言；新增真实 Vue 卸载路径的动画节点保留、快速关闭、降动效及无 API 清理断言。历史烟测改用滑块，维护重开保留、总计还原、单 Tab、固定外框／表头及退出后焦点断言；临时滚动尺寸在 finally 还原。全部未执行。 |
| 文档 | 更新规范、架构、RECORD 与计划。TESTING 已覆盖公共 composable 及收益窗口场景，无需新增重复测试分类。 |

## 未验证与遗留

仅阅读源码、Vue 当前版本的卸载实现、引用与 Git 差异。未运行测试、format、lint、typecheck、build、Rust 检查、CDP、视觉或性能采样；未启动应用、未接触真实账本、未提交。

待用户指定验收的范围：全局快速开关与嵌套确认、首次懒加载交接、保存／草稿关闭守卫、焦点回退、降动效；历史窗大量角色、长名称、长金额、最大字号、窄宽、翻页及滚动到末尾的外框和表头。动画依赖 Vue 提供的 VNode 移除钩子，未来升级 Vue 时应保留对应生命周期断言。

其他弹窗的表单布局、全部保存失败路径和 Rust 数据完整性审查仍属于后续 U03／U04／D06／D07。当前批次完成后等待用户查看，不自动进入下一包。

## 本轮提交前静态复核

用户本轮明确要求 Review 后提交并推送。复核覆盖当前全部 34 个变更文件，没有跳过文件；未发现需要阻塞本批提交的确定性问题。本节记录本轮归档范围，上文及其他批次的“未提交”保留实施当时状态，最终提交与推送状态以 Git 记录为准。

| 文件（仓库相对路径） | 数量 | 已审查内容 |
| ------------------ | ---- | ---------- |
| `docs/ARCHITECTURE.md`、`docs/CONVENTIONS.md`、`docs/OPTIMIZATION-PLAN-2026-11-18.md`、`docs/RECORD.md` | 4 | 实现、规范和计划一致，区分静态审查与未执行的验收，不将局部批次标为整包完成。 |
| `docs/reviews/U02-INCOME-REVIEW-2026-11-19.md`、本报告 | 2 | 收益口径、依赖证据、未逐行重审的后端范围与动态验收遗留明确。 |
| `docs/previews/online-card-options.html`、`.css`、`.js`；`docs/previews/online-role-options.html`、`.css`、`.js` | 6 | 历史方案仅操作演示内存，不调用业务或保存；正式采用的 C 方案与未采用的一键演示有说明。 |
| `src/components/ModalShell.vue`、`SteppedSlider.vue`、`TextButton.vue` | 3 | 关闭事件与卸载交接、单选插槽和键盘契约、文字按钮的原生禁用与说明。 |
| `src/composables/use-modal.ts`、`use-modal-size.ts`、`use-modal-motion.ts`、`use-modal-motion.test.ts` | 4 | 阅读当前 Vue 卸载实现确认移除钩子路径；检查入场取消、退场清理、栈顶、焦点、锁滚动、尺寸中断和降动效。断言已写，未运行。 |
| `src/views/dev/AtomsSection.vue` | 1 | 公共文字按钮和滑块插槽说明与正式调用一致。 |
| `src/views/income/IncomeView.vue`、`OnlineBar.vue`、`OnlinePanel.vue`、`QuickPanel.vue`、`TodayDump.vue` | 5 | 统计和保存链未改口径；快速上下线复用 store 校验与持久化，保留旧多人、名册外结束及失败恢复；观察器和动画帧随生命周期清理。 |
| `src/views/income/IncomeHistoryDialog.vue`、`history-summary.ts`、`history-summary.test.ts` | 3 | 日期全集汇总与明细筛选分离，未指定及已删角色保留，滚动外框、原生表头及编辑删除链保持。断言未运行。 |
| `src/views/income/online-summary.ts`、`online-summary.test.ts` | 2 | 复用按日切分及历史单价，只派生今日／昨日展示，不写账本。边界断言未运行。 |
| `tools/e2e/sections/income/history.mjs`、`online.mjs`、`quick.mjs`、`shared.mjs` | 4 | 定位与新布局一致，覆盖筛选、焦点、几何及快速操作；临时样式在 finally 移除。烟测未运行。 |

历史 HTML 方案依赖本机预览服务从 Vue 源文件提供 `/preview-components.css`，并非可直接双击的独立页面；服务位于被忽略的 `.runtime/online-card-preview-server.cjs`，本轮只读、不纳入正式应用。该限制只影响设计稿重开，不影响收益页运行；需要跨机器复用预览时再单独整理预览工具。

本轮未改业务代码，不为审查额外拆组件。服务、Rust、资源和数据结构维持原链路，理由见两份专项报告；未宣称完成全量后端审查。未运行测试、格式、lint、类型、构建、Rust 或视觉检查，未启动正式应用、未接触真实账本。重点遗留仍为全局嵌套／懒加载交接与焦点、真实保存失败恢复、主题／字号／窄宽的指定动态验收。
