# 总览、收益、账号：跨页面规范复核

日期：2026-11-19。档位：日常 · 不跑验证。

本轮按用户要求 Review 当前工作区，包含前几轮尚未提交的账号、历史和仓库布局修改。先审查三页的展示及直接交互依赖，后按用户“都优化一下”授权实施全部八项；不将本报告视为 D06／D07／D08 业务深审完成。

## 结论

主卡片、统计票据、图表外壳、分页和弹窗基座已基本统一。仍有两项 P2 状态／恢复问题、四项 P3 规范收敛项，以及两项可选整理建议。下列结论来自源码条件与调用关系；未做动态复现、截图或几何测量，不声称已经观察到特定窗口中的溢出或性能问题。

R01—R06 与 S01／S02 均已修改，等待用户查看和指定动态验收。下文问题段保留实施前证据；本轮没有执行测试、构建、截图或应用启动，也未提交。

## 原审查问题（实施前证据）

### R01 · P2 · 收益读取失败未传递到今日速记和走势图

- **位置**：[TodayDump.vue](../../src/views/income/TodayDump.vue#L17)、[OnlinePanel.vue](../../src/views/income/OnlinePanel.vue#L15)、[IncomeView.vue](../../src/views/income/IncomeView.vue#L265)。
- **触发与结果**：收益或上线账读取失败时，父页面仍挂载今日速记和每日走势。TodayDump 只取 entries；OnlinePanel 只取 sessions／entries，两者没有判断各自 loadError。首次失败且数组为空时，今日速记仍显示“今天还没有记账”和零净额；走势图按空数组生成零线或正常空图。同步失败保留旧数据时，这些区域仍按旧数据绘制，局部没有说明其状态。同页 OnlineBar 的今日在线票据已经显示“未读取”，总览及账号图表也会区分错误，形成同一数据源的不同解释。
- **依据**：CONVENTIONS §2.4-28，优化计划 §2.2 状态完整性及 §3 读取失败边界。读取失败不能表达为正常空账或已确认零值。
- **建议**：TodayDump 区分未读取和成功空账，失败时不显示正常净额与笔数，也不提供可执行撤回；OnlinePanel 按各自数据源分别显示未读取，在线失败不必隐藏仍有效的收益图，反之亦然。沿用父页 LoadNotice 恢复入口，不重复增加整套错误宿主。
- **后续断言**：分别令收益、上线源失败，检查对应区块的状态；成功空账仍展示正常空态；恢复后重用原数据和交互。只补定向场景，不新增全套运行要求。
- **边界**：现有领域写保护不因本项被否定；本项发现的是展示和交互状态遗漏，没有发现此处绕过写保护的证据。

### R02 · P2 · 总览聚合错误只有说明，没有明确恢复入口

- **位置**：[OverviewView.vue](../../src/views/overview/OverviewView.vue#L44)、[OverviewView.vue](../../src/views/overview/OverviewView.vue#L134)。
- **触发与结果**：角色、收益、账号、目标、上线或自动记账错误被放入 sourceErrors，模板仅渲染文本。只有上线保存失败另有 SaveNotice。停留在总览时没有对应的重新读取、重试自动记账或前往来源页面处理入口；用户需要自行判断错误归属并寻找入口。收益和账号页面已经使用 LoadNotice／SaveNotice，恢复路径未统一。
- **依据**：CONVENTIONS §2.3 的失败恢复与原有 LoadNotice／SaveNotice 契约；优化计划 §4.1 读取／保存异常要求显示恢复动作。
- **建议**：为每一错误来源提供明确恢复路径。总览直接恢复时复用现有恢复组件，并尊重 pending／writeError 和编辑保护；若继续保持总览只读，则至少提供准确的“前往收益／账号／角色等页面处理”入口。自动记账错误应指向收益页现有 retrySync 路径，不把所有错误都处理为刷新窗口。
- **后续断言**：每一来源错误均有可达动作；重试期间不能重复读取或覆盖待保存状态；成功后该来源提示消失，其他来源不受影响。

### R03 · P3 · 总览仍以窗口宽度控制卡片收列

- **位置**：[overview.css](../../src/views/overview/overview.css#L83)。对照 [accounts-page.css](../../src/views/accounts/accounts-page.css#L201)、[IncomeView.vue](../../src/views/income/IncomeView.vue#L328)。
- **事实**：总览使用 900／500px 的 viewport media query；账号和收益已通过命名容器按实际内容宽度收列。应用左栏和页面留白占据窗口宽度，总览的触发口径尚未与其他两页一致。
- **依据**：CONVENTIONS §2.4-20 按内容宽度决定并排，优化计划 §4.2 统一页面边界及响应规则。
- **建议**：在 overview 内容根节点建立命名容器，按卡片实际可用宽度转换现有收列规则；保留工作台、目标和票据自己的合理阈值，不机械复制其他页面的阈值。
- **后续验收**：指定视觉验收时再测窗口缩放、最大字号及阈值两侧几何；本轮不据源码推断已经发生溢出。

### R04 · P3 · 上线记录的重置仍使用立体按钮

- **位置**：[OnlineRecords.vue](../../src/views/income/OnlineRecords.vue#L195)。对照 [AccountRecords.vue](../../src/views/accounts/AccountRecords.vue#L202) 及仓库筛选重置。
- **事实**：相同的筛选重置操作，上线记录仍为 PressButton sm，账号历史与仓库为 TextButton；因此高度、底板和视觉层级不同。
- **依据**：CONVENTIONS §2.4-49 的低频辅助操作，以及本批历史／仓库筛选的 TextButton 约定。
- **建议**：只将上线记录的重置改为 TextButton，保留原 reset 回调、aria-label 和出现条件。用户明确保留的页头“历史”“仓库”普通按钮不在迁移范围。
- **后续断言**：维护同类重置外观与筛选恢复断言；不改收益历史本来没有重置按钮的业务设计。

### R05 · P3 · 编辑表单仍有多份普通字段布局

- **位置**：[AccountEditor.vue](../../src/views/accounts/AccountEditor.vue#L514)、[EntryEditDialog.vue](../../src/views/income/EntryEditDialog.vue#L92)、[OnlineDialog.vue](../../src/views/income/OnlineDialog.vue#L333)。公共定义在 [blocks.css](../../src/styles/blocks.css#L713)。
- **事实**：account-field、entry-field、online-field 分别实现标签在上、控件在下的普通字段布局，基础 gap 为 4／6／6px；账号的普通双列组也保留局部 pair。已有 form-field／form-pair 能承担这部分公共职责，后续修改标签留白仍需要逐窗维护。
- **依据**：CONVENTIONS §2.4-26，普通垂直字段和双列组复用 form-field／form-pair。
- **建议**：仅迁移普通字段和普通配对组；金额居中、手续费／资产开关、结束时刻等特殊排版保留局部修饰。不能将 grid 机械换成 flex 后丢失 amount-row 的居中规则。
- **后续验收**：复用现有编辑场景，维护金额居中、日期配对、长角色名、保存失败草稿和页脚定位断言，无需为纯布局建立镜像单测。

### R06 · P3 · 上线编辑的结束时刻仍借用输入框样式

- **位置**：[OnlineDialog.vue](../../src/views/income/OnlineDialog.vue#L275)、[OnlineDialog.vue](../../src/views/income/OnlineDialog.vue#L354)。
- **事实**：不可编辑的结束时刻／“计时中”虽使用 output 语义，却仍带 field 类，继承与可编辑输入相同的凹槽和边缘；用户在开始、结束两格之间难以直接判断哪一格可操作。
- **依据**：CONVENTIONS §2.4-33，派生字段展示为文字，不伪装成可编辑输入。
- **建议**：保留 output 及可读标签，改为文字读数或明确的只读状态展示；高度与开始时刻对齐，结束编辑能力及日期／时间计算保持原逻辑。
- **后续验收**：分别查看进行中、已结束及允许编辑结束时间的分支；只有真正可编辑的分支保留 TimeField。

## 同步整理项（实施前证据）

### S01 · 侧签薄片材质存在两处实现

[OnlineBar.vue](../../src/views/income/OnlineBar.vue#L469) 的 role-item 自绘纸面、薄底边和短签；账号和总览入口已经使用 PressTile side-tab，材质在 materials.css。在线角色是“上线＋独立结束”的复合操作，并有用户明确选定的 C 方案，因此不将结构差异判为功能缺陷，也不直接用一个按钮包住两个操作。

如果继续收敛，可让公共材质同时供 PressTile 与复合容器引用，保留原 C 方案、在线状态色、独立结束按钮、156px 宽度及三行高度适配。先确认复用能减少维护，再实施，避免为了统一引入万能组件。

### S02 · 历史弹窗的空态外框策略不同

[AccountRecords.vue](../../src/views/accounts/AccountRecords.vue#L247) 始终保留内容外框，空态在框内；[IncomeHistoryDialog.vue](../../src/views/income/IncomeHistoryDialog.vue#L161) 和 [OnlineRecords.vue](../../src/views/income/OnlineRecords.vue#L224) 无数据时将空态放在框外。结果是同类历史在无匹配／读取失败时的内容边界不同。

现行规范既要求固定内容外框，也要求不留下无意义白框，不能直接据此认定某一种实现全部错误。建议先约定“正常有数据、筛选无匹配、首次无数据、读取失败”四种状态的统一排法，再小范围实施；保留各业务自己的提示文字、汇总和筛选含义。

## 已收敛并保留的内容

- 三页使用 PageShell，内容外卡显式 PaperCard／LedgerSection plain，没有在本范围发现页面后代统一覆盖所有 board 的旧做法。
- 主摘要复用 StatStrip embedded／TicketCard。账号历史是紧凑流水汇总，不要求再塞主页面的大票据，避免为外观一致增加重复内容。
- 趋势及账号柱图外卡复用 chart-section，底部留白为公共 8px；绘图使用 chart-in-card 和现有图表令牌。已检查的绘图区为 180px，各图数据单位仍由业务负责。
- 历史使用原生表、sticky 表头和内部滚动；分页共用 RecordPager。不同表格按列数使用不同宽度，不应机械统一为同一个数字。
- 编辑器使用 ModalShell／FormActions，日期及时间使用 DateField／TimeField／DateRangeField；保存、重试及确认宿主沿原路径。
- 账号主页面不再恢复角色筛选；页头历史和仓库使用用户指定的普通／主操作按钮；收益物品速记与总览导航保留各自适合的密度和操作语义。

## 阅读范围与证据限制

阅读三页主入口、布局样式，及直接使用的总览快捷／目标／队伍、收益在线／速记／走势／历史／编辑弹窗、账号图表／历史／编辑器相关区段；核对 PageShell、LedgerSection、PressTile、PressButton、LoadNotice、SaveNotice、公共 form／record 样式和现行材料定义。抽查启动加载、收益／上线错误状态及恢复入口，搜索相关烟测归属。并非这些依赖全文件、全部 store 或后端的完整业务审计。

未修改产品代码或断言，未运行测试、format、lint、typecheck、build、Rust、CDP、截图或性能采样；未启动应用、未接触真实账本、未提交。主题实际观感、窄宽几何、键盘／焦点、错误注入与恢复仍需后续明确指定的验收。

## 实施映射与交付状态

| 项目 | 本轮实施 | 文件 |
| ---- | -------- | ---- |
| R01 | 收益与上线 store 只读暴露 loaded；今日速记区分读取中、失败及成功空账，失败隐藏笔数、净额和撤回，保存期间或保存失败禁用撤回。两图按各自来源降级，失败来源的旧角色不再混入另一图；恢复沿父页面 LoadNotice | income-store.ts、online-store.ts、TodayDump.vue、OnlinePanel.vue |
| R02 | 每个聚合错误旁显示 TextButton，直达角色／收益／账号／目标的原恢复入口；上线和自动记账明确前往收益页。总览只导航，不执行跨域重载，不触碰待保存草稿 | OverviewView.vue |
| R03 | 总览命名容器按实际内容宽度在 900／500px 收列，与收益和账号的响应口径一致 | overview.css |
| R04 | 上线记录筛选重置迁移 TextButton，保留出现条件、标签和回调 | OnlineRecords.vue |
| R05 | 三个编辑窗的普通字段、配对组复用 form-field／form-pair，移除重复布局；账号金额继续居中，长角色名保留局部换行规则 | AccountEditor.vue、EntryEditDialog.vue、OnlineDialog.vue |
| R06 | 只读结束时刻保留 output 与可读标签，移除 field 凹槽，读数高度仍与开始时间对齐；可编辑分支继续使用 TimeField | OnlineDialog.vue |
| S01 | PressTile side-tab 与角色复合容器共用 side-tab-surface；材质变量集中于 materials.css，结构在 blocks.css。保留 C 方案短签、2px 底边、在线色、156px 宽、三行高度和独立结束按钮，沿用明暗主题优先级 | PressTile.vue、OnlineBar.vue、materials.css、blocks.css |
| S02 | 三类历史均保留固定外框与同一滚动宿主；有数据和筛选无匹配保留边界，首次无数据／读取失败仅将边框和底板透明化。失败不继续绘制旧表格，空态在剩余内容区居中 | AccountRecords.vue、IncomeHistoryDialog.vue、OnlineRecords.vue、blocks.css |

维护原导航、收益和账号烟测：收益／上线独立失败与恢复、全部来源恢复入口、总览内容宽度收列、历史失败保留滚动宿主、无匹配外框及文字重置，并同步表单选择器。断言只编写，未执行；不新增测试分区或组件镜像单测。未读取或修改真实账本。

静态查看改动与调用关系后，本轮未发现需要继续扩大修改范围的确定性问题；动态行为仍待验收。重点查看三页窄宽／最大字号／明暗主题、金额居中、只读时刻、三行角色适配、历史四种状态及真实读取恢复。D06／D07／D08 的业务事务深审和其他专项仍开放，未提交推送。
