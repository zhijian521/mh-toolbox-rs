# U02 总览审查与参考约定

日期：2026-11-19。范围为当前工作区的总览页面及其直接依赖，不代表其他页面或整个仓库已完成审查。档位：日常，不跑验证、不提交；不进入下一工作包。

## 结果与本批改动

静态阅读中未发现需要阻塞本批交付的确定性统计或保存缺陷。下列展示和维护问题已处理，实际界面与交互尚未动态验收。

1. **队伍底部模糊**：队伍与周月票据只以纸色露出 2px 底边；纸面高光仍由公共材质提供。没有滤镜或斜投影，也不通过裁切外壳隐藏阴影，保留链接焦点空间。
2. **纯色外卡依赖页面覆盖**：原 overview.css 的 `.overview :deep(.board)` 会同时作用于未来添加的嵌套卡片。改为 PaperCard 的可选 plain 模式，LedgerSection 透传，总览五处外卡显式启用；默认卡面行为保持。base.css 只关闭背景图，不复制或替换公共阴影。开发页嵌入趋势样例同步启用 plain。
3. **侧签面板重复**：OverviewShortcuts 和 ShortcutSortTile 两处实际调用提取为领域组件 ShortcutFace，共用图标、名称、主题配色、圆角和文字截断，尾部用插槽区分箭头与删除。尺寸仍由调用方传 CSS 变量；原生按钮语义和 sortable 生命周期不搬入展示组件。
4. **编辑器加载边界不一致**：ShortcutEditor 改用既有 lazyDialog，与仓库等弹窗共用首次加载、取消、重试和焦点恢复。排序依赖随编辑器加载；未引入第二套弹窗加载机制，也未做体积或性能收益声明。
5. **同日反馈：统一两类票据**：以周月统计风格提取公共 TicketCard，StatStrip 的 embedded 模式与 TeamCard 均使用同一外壳，保留各自内部布局。纸面、顶部高光、侧缺口、小圆角和清晰底边只有一份实现；删除原两套纸面伪元素、队伍装饰节点及零引用材质变量。缺口高度由调用方现有单行标题的行高计算，不新增 DOM 测量或业务状态。开发页补任意内容样例，烟测补同纸面／底边断言，未运行。
6. **最新反馈：队伍身份同行**：最近记录／编号仍独占首行，名称、等级和门派放在下一行，均位于分隔线上方。名称不再省略，可完整换行；等级和门派保持首行，门派过长保留悬停全文。为满足可变签头高度，TicketCard 增加 header 插槽，以 ResizeObserver 替代该调用方上一批的固定行高公式，票口跟随实际分隔线。固定周月签头继续使用原变量，不受影响。观察器由组件内 watcher 的 onCleanup 释放，仅更新装饰坐标，不回写尺寸或业务状态。

相关烟测更新了队伍无模糊底影的约束，以及排序卡片名称定位；既有周月源记录对比、纯色外壳、侧签、不位移、排序取消、保存重载及仓库焦点断言保留，均未执行。

## 本轮整体复核：身份同行与可变签头

按下方既有 13 个审查单元复核总览，重点重读页面聚合、队伍、目标、快捷入口、排序草稿与共用展示组件；统计纯函数、日期边界、偏好保存、启动顺序和 IPC 入口均与既有证据一致。未修改的领域后端沿用上一批读取链结论，不重新声称已审完整 Rust 领域，也不扩大到仓库／OCR 内部流程。

本轮未发现新增、未处理的确定性静态缺陷。变更风险集中于换行后的几何与原生 ResizeObserver 时序，以下仅是静态结论：

- 名称的 flex 收缩与 anywhere 换行不会要求卡片横向扩展；等级和门派不折行，下面的记录区仍可缩小并滚动。
- 两行身份信息整体位于分隔线上方；票口计算读取 header 相对纸面的真实底部，避免继续假定名称单行。
- ResizeObserver 只注册在实际存在的签头上；切换签头或卸载会 disconnect。更新的 CSS 变量仅影响遮罩，不改变被观察元素的尺寸，因此没有尺寸回写循环。
- 默认 StatStrip、固定周月签头、卡片材质、目标和快捷入口的业务契约保持；空名称的链接与记录区读屏提示统一使用“未命名”。

本轮直接改动文件共 10 项，静态核对 10 项、跳过 0 项；这是本轮变更覆盖率 100%，不表示运行验证通过或全仓覆盖。下表之外的既有审查范围与跳过理由继续见后文。

| 文件 | 状态 | 本轮核对 |
| ---- | ---- | -------- |
| src/views/overview/TeamCard.vue | 已审查 | 同行结构、换行、语义链接、签头和记录滚动。 |
| src/components/TicketCard.vue | 已审查 | 可选插槽、引用时序、观察器清理、装饰与内容边界。 |
| src/views/dev/AtomsSection.vue | 已审查 | header 插槽样例及正确说明。 |
| src/views/dev/atoms-section.css | 已审查 | 清理样例固定票口公式，线后间距归内容。 |
| tools/e2e/sections/01-nav.mjs | 已审查 | 同行／长名称／票口几何断言；只暂改展示文字，finally 还原，不写名册。未运行。 |
| docs/CONVENTIONS.md | 已审查 | 固定与可变签头各自契约。 |
| docs/ARCHITECTURE.md | 已审查 | 组件职责及观察器生命周期。 |
| docs/RECORD.md | 已审查 | 最新行为与未执行范围。 |
| docs/OPTIMIZATION-PLAN-2026-11-18.md | 已审查 | 仅更新 U02 当前批次，不推进其他包。 |
| docs/reviews/U02-OVERVIEW-REVIEW-2026-11-19.md | 已审查 | 更新覆盖、结论与待验项，保留既有证据。 |

新增烟测会暂改真实签头的 DOM 文字，使原生观察器响应长名称，再读取换行、等级／门派、票口及记录区几何，最后恢复文字和装饰节点；不调用名册修改或保存。日常档未执行该断言，也未运行任何其他测试、检查、构建、截图或性能采样。

## 覆盖台账

按下列审查单元登记：13 项已静态审查，3 项明确跳过。表中的依赖审查仅指首页直接使用的入口和相关区段，不等于整个依赖文件或领域的全面审查。

| 单元 | 状态 | 范围与结论 |
| ---- | ---- | ---------- |
| OverviewView.vue、overview.css | 已审查 | 数据源、错误映射、区块次序、周月读数、上线按钮状态、横滚及响应布局；保留页面聚合与编排职责。 |
| overview.ts、overview.test.ts | 已审查 | 七天连续趋势、日历月回退、月末处理、双币汇总与边界断言；不改变统计口径。 |
| TeamCard.vue、team-activity.ts 及测试 | 已审查 | 按业务发生日期选最近记录，账号收支独立、名册次序不变、缺失值与错误分开；底影与名称／等级／门派同行调整如上。 |
| shortcuts.ts、shortcuts.test.ts | 已审查 | 目录、路由、默认入口、去重、失效项、明确清空和移动边界；已有自定义顺序不强插仓库。 |
| OverviewShortcuts.vue、ShortcutFace.vue | 已审查 | 页面入口、角色选择、外链错误、仓库弹窗、保存失败保留草稿，以及本批展示提取。 |
| ShortcutEditor.vue、ShortcutSortTile.vue、shortcut-editor.css | 已审查 | 独立草稿、添加移除、搜索分类、管理器销毁、指针与键盘、取消与保存边界；未认定未复现的拖动手感为功能缺陷。 |
| PaperCard.vue、LedgerSection.vue、TicketCard.vue | 已审查 | 标签与属性透传、plain 默认值、标题操作插槽、固定高度与滚动边界；卡内票据的可变签头与观察器由组件管理，内容与焦点不参与遮罩。 |
| PressTile、StatStrip、TrendChart、GoalProgress | 已审查 | 首页使用模式及相关变更：侧签不位移、统计只展示、图表一层外壳、主题刻度。图表既有监听清理与键盘入口保留。 |
| token-core、base、materials、theme-materials | 已审查 | 首页关联的圆角、配色、卡面、票据及主题覆盖；维持唯一真源，不复制到页面或预览。 |
| startup、五领域 store、daily-sync、共享时钟 | 已审查 | 启动先加载，首页读同一状态；日期和分钟来自共享时钟；日同步保留原入口及错误展示，无新增写入链。 |
| home-shortcuts 及测试、storage、desktop、lazy-dialog | 已审查 | 偏好读写失败、IPC 返回失败、外链打开结果、加载取消及失败重试；系统能力仍仅由 services 暴露。 |
| bindings、Rust 命令与 store 读取实现 | 已审查 | 核对角色、收益、账号、目标、上线五条读取命令、两张命令登记及字段；本批不改命令、库结构与事务。 |
| package.json／lock、开发样例、01-nav、现行文档 | 已审查 | dnd-kit Vue／DOM 固定 0.5.3，Vue peer 范围兼容，lock 指向 npm 且有完整性记录，无新增安装脚本；样例及相关断言、规范同步。 |
| 仓库／角色／目标等被打开页面的内部编辑和 OCR 全流程 | 已跳过 | 本批只追踪入口与现有加载链，未改内部表单、识别或保存；这些领域仍按对应工作包审查。 |
| 游戏规则、图集生成、字体制作及打包流水线 | 已跳过 | 本批没有新资源或业务规则，沿用既有图标与游戏规则加载。未审资源真实性和再生成过程。 |
| 未选 HTML 提案及其余页面 | 已跳过 | 历史提案不参与正式首页运行；未改其余页面，不宣称全仓覆盖。 |

## 数据、服务与 Rust 证据链

| 展示 | 从页面到数据源 | 已确认的边界 |
| ---- | -------------- | ------------ |
| 近一周净额、收益趋势 | OverviewView → weekSeries → income-store → storage.incomeLoad → bindings.incomeLoad → store::income_load → store/income.rs::load_income → income_entries | 今天及此前六天、支出为负；按业务日期筛选，不按创建时间跨入区间。 |
| 周在线时长与点卡 | OverviewView → rangeOf('week')／onlineTotalsOf → online-store → storage.onlineLoad → online_load → store/online.rs::load_online → online_sessions／online_settings | 用同一切天口径计算，存储分钟与消费单价来自原领域。cardCost 控制是否自动记账号支出，关闭不会让已发生的点卡消耗消失。 |
| 近一个月双币收支 | OverviewView → workbenchSummary → filterAccounts／accountStatsByCurrency → accounts-store → storage.accountLoad → account_load → store/accounts.rs::load_accounts → account_entries | 近一月按日历回退、月末夹取；区间含两端；人民币与梦幻币独立汇总，只读取账号账，不再次加收益或点卡。 |
| 目标进度 | OverviewGoals → activeGoals → goals-store + roster → storage.goalLoad／charactersLoad → goals_load／characters_load → load_records | 使用原目标摘要和排序，不另存一套首页进度；角色与目标读取失败有提示，不显示为零目标。 |
| 队伍最近记录 | TeamCard → teamActivity → roster／income／online／accounts 的现有只读状态 | 每个角色分别选最近记录，账号收入与支出各一条，金额保留记录本身币种。 |
| 自定义快捷入口 | OverviewShortcuts → normalizeShortcutIds／moveShortcut → services/home-shortcuts → localStorage | 只在保存时写本机偏好；取消不写，保存失败不关闭或丢草稿，不写 SQLite，也不随账本导出。 |
| 仓库和截图入口 | OverviewShortcuts → lazyDialog(WarehouseDialog)；截图入口 → characters 路由 | 共用原模块，不复制识别与物品状态；启动链先加载规则、名册和库存，内部编辑链本轮未全审。 |

storage 对命令异常返回失败结果，由 store 的 loadData 与写保护处理；Rust 查询保留失败信息。角色与目标的 load_records 对损坏 JSON 报错，未把损坏数据静默视为空表。首页不直接调用 invoke，不新增数据库读写或改变固定数据目录。

## 保留现状的理由

- **不继续拆 OverviewView**：当前跨领域 computed 与区块编排放在同一入口，纯计算已经位于 overview.ts 和 team-activity.ts。没有第二处真实复用，不为缩短文件再引入一层 props 转发。
- **不拆队伍三类记录为公共组件**：结构、空态、日期和币种语义不同，当前只服务队伍小票；抽一个万能记录行会增加条件分支。
- **不把 ShortcutFace 提升为全站控件**：两个调用都属于首页常用功能，仍依赖 HomeShortcut。公共材质继续使用 PressTile，业务展示留在领域内。
- **不改账本、服务或 Rust**：现有读取契约满足首页，未发现需要新查询、新统计表或结构迁移的证据。
- **不重写拖动**：官方传感器、排序和自动滚动已经接入；手感问题应在指定交互验收后按证据处理。

## 未验证与后续范围

本批仅静态审查和维护断言，没有运行测试、format、lint、typecheck、build、Rust 检查、应用启动、截图、几何测量或性能采样；未改真实账本、未提交。

以下为验收空缺，不能当作已复现缺陷：

- 六主题明暗、三字体、最大字号与窄宽下的纸边清晰度、长名称换行、身份同行和焦点可见性；签头变高后的票口位置及 ResizeObserver 时序尚未动态验收。
- 首次加载自定义弹窗、加载失败重试与取消后的焦点；快捷入口和编辑器共享面板后的实际布局。
- 真指针连续拖动、滚动边缘、键盘排序、Esc 只取消拖动、保存失败保留草稿、保存后重载。
- 日期跨午夜、运行中计时刷新、部分读取失败与自动同步失败的实际展示，以及仓库打开／关闭联动。

规范已固化于 CONVENTIONS.md §2.4，组件职责写入 ARCHITECTURE.md。下一步先由用户查看正式总览效果；如要验收，建议先指定“仅总览”的视觉与交互范围，再执行上述对应项。U02 其他页面及其他工作包继续保持未完成。

## 自定义弹窗加载排错（2026-11-19）

用户报告打开自定义报错。对当前开发服务定向读取，ShortcutEditor.vue 返回 HTTP 500，具体为无法解析 @dnd-kit/dom；本机 node_modules 缺少 @dnd-kit/dom／vue，项目清单及锁文件中已声明 0.5.3。按现有锁文件补齐缺失依赖，没有改写拖拽实现、清单或锁定版本。随后编辑器、排序项及 dom／vue／sortable 三条依赖请求均返回 HTTP 200。已失败的浏览器模块可能仍缓存错误，刷新应用后重新打开。未运行测试或构建、未进行真实弹窗交互验收、未改真实账本、未提交。
