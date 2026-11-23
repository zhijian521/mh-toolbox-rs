# Liquid Glass 分支开发指南

`codex/liquid-glass-shell` 在现有 Windows 桌面应用内重做界面，采用 mac 风格的玻璃表面、底部 Dock 和明暗壁纸。玻璃界面和账簿界面共用业务模型、保存服务与本地 SQLite 账本。桌面窗口里的记价、导入和恢复都会操作当前账本。

## 从哪里看效果

- **物价**：在本分支运行 `npm run dev`，打开 `http://127.0.0.1:5173/#/prices`。这里可以看业务卡片、分类筛选、记价与历史弹窗怎样组合。
- **组件目录**：打开 `#/components`，或在 Dock 上连续快速点击五次「设置」。目录里可以试用输入框、日期、价格、菜单、弹层和空状态。物价示例使用内存数据。顶部「玻璃材质对照 → 全局材质」可在清透折射（默认）和经典玻璃之间切换，选择作为本机偏好保存。两侧样例始终固定；旁边的浅色／深色壁纸只影响对照区。
- **桌面能力**：用 `start.bat` 打开 Tauri 窗口，在「设置」查看账本和备份。浏览器预览中的本地账本操作会禁用。
- **对照旧界面**：浏览器开发服务可用 `npm run dev -- --mode legacy` 启动。同一端口只能运行一个服务。模式切换在 [entry.ts](../src/entry.ts)，与设置页的明暗切换相互独立。

## 页面迁移进度

截至 2026-11-23。Dock 的名称和顺序来自[导航定义](../src/navigation.ts)，玻璃页面的实际挂载位置见[玻璃路由](../src/liquid-main.ts)。

| 页面 | 分支现状 |
| --- | --- |
| [物价](../src/views/prices/LiquidPricesView.vue) | 已接入。含物品维护、记价、历史明细、趋势和保存失败重试。 |
| [设置](../src/views/LiquidSettingsView.vue) | 已接入。含外观、壁纸、账本导入导出、备份恢复和关于。 |
| [组件目录](../src/views/LiquidComponentsView.vue) | 已接入隐藏路由，供组件开发时对照。 |
| 总览、收益、账号、角色、目标、工具 | 已有 Dock 入口，正文待迁移。默认打开的 `#/overview` 当前只显示外壳。 |

## 改动放在哪里

| 要改的内容 | 维护位置与用法 |
| --- | --- |
| 窗口与外观 | [LiquidApp.vue](../src/LiquidApp.vue) 管标题栏、Dock、滚动区域以及前景色、焦点色和轮廓色。明暗和壁纸选择由 [use-liquid-preferences.ts](../src/composables/use-liquid-preferences.ts) 管理；在线壁纸读取失败时有内置背景可用。 |
| 字体与字号 | [liquid-main.ts](../src/liquid-main.ts) 加载资源圆体和[共享字号](../src/styles/token-typography.css)。标题、正文和辅助文字沿用现有字号档位。 |
| 玻璃材质与控件 | 从[项目封装](../src/components/liquid-glass/index.ts)引入组件。正文卡片用 `GlassCard`，操作用 `GlassButton`。要调整同类表面的填充、高光或模糊，改封装里的材质预设；跨页面的控件样式归[公共样式](../src/components/liquid-glass/style.css)。滚动条占位、弹窗文字和图标分页见[工程规范 §2.4 第 51、52 条](CONVENTIONS.md#24-样式)。 |
| 表单与弹窗 | 参考[物价编辑器](../src/views/prices/LiquidPriceEditor.vue)组合玻璃输入、日期和价格字段。[GlassDialog](../src/components/liquid-glass/GlassDialog.vue) 在打开时按窗口宽度选用居中对话框或底部面板。标题由 `label` 提供，使用 `lazy` 时内容会保留到退场结束。 |
| 页面与数据 | 玻璃视图负责排版和交互。查询、校验和写入沿用对应领域的 store；桌面调用统一走 `src/services/`。共享字段或保存逻辑有改动时，同时核对账簿界面的调用方。 |

## 迁移一个页面

1. 从旧页列出用户能完成的动作，沿按钮追到编辑器、确认框和保存方法。例如收益页的「上线」涉及角色选择、开始或结束计时及记录保存，这些入口应一起对照。
2. 在对应领域目录编排玻璃视图，在 `liquid-main.ts` 的 `views` 注册现有导航键。公共控件先查组件目录；本次新增可复用控件时，同步补一个可操作的演示。
3. 带编辑的页面参考物价页处理取消、草稿离开确认和保存失败重试。启动时的旧账检测、关窗时的草稿确认与待写入数据由玻璃入口统一协调。
4. 更新上面的进度表，写清已接入的功能和仍待接入的入口。需要验收时，按[测试与验证范围](TESTING.md)选择对应场景。
