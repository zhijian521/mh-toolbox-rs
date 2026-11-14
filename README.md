# 梦幻养老助手 · Rust 版

> **这是 Rust 重写版，稳定版在 [`zhijian521/mh-toolbox`](https://github.com/zhijian521/mh-toolbox)。**
> 那个仓库冻结保留，继续给朋友用；它只作为功能与视觉参考，新版不接入旧版数据。

梦幻西游端游的养成记账工具。Rust + Tauri 2 + Vue 3 + SQLite，界面走「账簿」方向：宣纸底、墨字、
朱红作记、结构靠线不靠阴影。字体可独立选择霞鹜文楷（默认）、思源黑体、思源宋体、朱雀仿宋与资源圆体，均随包提供常用字子集。六档字号都乘 `--fs-scale`，设置页那三档滑块只改这一个变量。

## 当前状态（2026-11-07）

八个导航页**都有内容**，没有占位页了；工具页下挂捉鬼助手（`/tools/ghost`）。另有一张不进导航
的开发页 `#/dev`，入口是三连击左栏顶部的牌记。

| 已完成   | 说明                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 窗口     | 1280×860，最小 1024×848；identifier `com.zhijian.mhtoolbox.rs`          |
| IPC      | 由 Rust 生成类型契约；前端只经 `src/services/` 调用，命令表按平台分两份 |
| 路由     | hash 模式，`src/navigation.ts` 是真源，左栏与路由都从它派生             |
| 总览页   | 统计条 + 七日柱状图 + 各号卡                                            |
| 收益页   | 速记格 + 今日清单 + 历史表；一笔可记给多个号，按币平分、尾差可复现      |
| 物价页   | 物品卡 + 历史价 + 走势图；两级筛选与五种排序；四个弹窗                  |
| 角色页   | 名册增删改 + 编辑器；六分区读数，支持属性 / 师门 / 辅助 / 修炼截图识别  |
| 账号页   | 两本账（点卡 / 梦幻币）+ 快捷入口 + 全部记录                            |
| 目标页   | 目标卡 + 新建 / 更新养成 / 流水；未记录项计「待补录」                   |
| 设置页   | 外观 / 数据（导入导出清除）/ 关于，三张卡                               |
| 工具页   | 桌面图标式启动器：92px 格、56px 压印块，没有副标题                      |
| 捉鬼助手 | 截屏 + PP-OCRv4 读任务栏的假坐标，画在底图上告诉你往哪找                |
| 数据层   | `%APPDATA%\mh-tool-rs\mh-toolbox.db`（rusqlite `bundled` + WAL）        |

差分 harness 不做（2026-11-04 定，见 `docs/ARCHITECTURE.md` §5）。

## 目录

只列一级、不列文件名——逐个抄清单必然漂，各目录的职责写在文件头。

```
src/           components（不调 Tauri）/ composables / services（系统能力唯一出口）
               styles（tokens base blocks）/ views（路由目标，页面数据层也在里面）
src-tauri/     Rust 壳：窗口、命令、截屏、OCR、SQLite
public/game/   游戏资源：底图、图标、事实表（规则见 docs/GAME-ASSETS.md）
docs/          工程规范、架构与阶段记录
scripts/       质量门小工具（版本号 / 提交信息）+ 图标与字体生成脚本
tools/probe/   CDP 探针：截图、量几何，内置静态服务
tools/e2e/     真窗口烟测：真鼠标键盘走完整路径，自带库快照与还原
assets/        字体（五种常用字子集与 OFL 1.1 许可）、牌记、图标源图
```

## 启动

双击根目录的 **`start.bat`**。它自己补齐 MSVC 的 `LIB` 与 `PATH`、做端口与实例预检，然后起窗口。

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222（供 e2e / 实拍）
start.bat --check    只做环境自检，不启动
start.bat --force    遇到占用或残留实例时直接处理，不询问
```

这个文件必须存成 **GBK(936) + CRLF**，Git Bash 里要 `cmd //c start.bat`；启动失败的四种已知
原因（5173 被占 / `EBUSY` / WebView2 残留 / 环境没设）都在
[`AGENTS.md` §四](AGENTS.md#四启动与窗口)，这里不复述。

## 开发

```bash
npm install
npm run dev            # 只跑前端（浏览器里可看 UI，没有 Rust 侧）
npm run desktop        # 起 Tauri 窗口（vite + cargo run）
npm run build          # 类型检查 + 构建前端
npm run desktop:build  # 打包
npm run check          # 唯一质量门：format / lint / typecheck / test / 版本 / 提交信息
npm run e2e            # 真窗口烟测：先 start.bat --force debug，再跑这个
```

**默认日常开发，不例行运行检查或测试。** 新增功能、功能完成、提交与 Review 均不触发全量；
定位当前问题所必需的定向复现、读取实际返回、编译 / 启动及切换 debug 窗口可直接执行，无需单独询问。
只有用户明确要求「全量检查」时才执行整套前端、真窗口与 Rust 检查。用户指定单项验证时，
只跑指定范围；同一份代码的结果可复用，不因提交重复跑。完整口径见
[`AGENTS.md` §一](AGENTS.md#一验证分档默认日常仅明确要求全量检查时运行)。

三层测试各管一段（「动了什么补哪层」的清单在 [`docs/CONVENTIONS.md` §2.1](docs/CONVENTIONS.md#21-工程基线)）：
单元覆盖纯逻辑、归一与写队列；集成覆盖 Rust 真库与备份；e2e 在真窗口走交互并重载核对。
**用例数与断言数以各测试命令末尾的汇总为准。**
**新增功能要同时补断言，但不自动运行**，功能与断言同一份提交；新加 IPC 命令不用改注册表测试——
`ipc-contract.test.ts` 会自己把前端调用与 Rust 的两张表对上，字段名也一并对账。

直接跑 `npm run desktop` 要先按 [`AGENTS.md` §三](AGENTS.md#三windows-上编译必须先设环境本机实测)
设好 MSVC 环境；`start.bat` 就是这一步的封装。CI 另有 `rust`（`cargo fmt --check`）与
`rust-test`（`cargo test --lib`）两个 job，**不在** `npm run check` 里——本机绿不等于能推。

烟测会写真实数据但自己收尾：开头快照一份库，结尾把还原命令打出来
（`node tools/e2e/db.mjs restore <id> --yes`，应用要先关掉）。

## 开工前读

| 文件                                           | 回答什么                                                     |
| ---------------------------------------------- | ------------------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                       | 这台机器上怎么干活：验证分档、沙箱限制、编译环境、启动、红线 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 分层、数据流、磁盘红线、目录归属                             |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)   | 现在该怎么写：命名、分层、样式语言、控件契约                 |
| [`docs/RECORD.md`](docs/RECORD.md)             | 每个阶段改了什么、否掉了什么（查「当初为什么」）             |
| [`docs/GAME-ASSETS.md`](docs/GAME-ASSETS.md)   | 游戏资源放哪、怎么命名、怎么替换                             |
| [`docs/GHOST-HUNT.md`](docs/GHOST-HUNT.md)     | 捉鬼助手：坐标系、ROI、OCR、渲染模式                         |

**红线只有一份，在 [`AGENTS.md` §六](AGENTS.md#六红线改代码前必须知道)。** 本文件不抄——
同一份规矩写两处，改一处忘一处就变成两条互相矛盾的规矩。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)（沿用旧版）——免费使用，可自行运行、修改与再发布，
**不得用于任何以营利为目的的用途**。设置页「许可」卡上是同一套口径。
字体为 SIL OFL 1.1，来源、许可与生成方法见 [assets/fonts/README.md](assets/fonts/README.md)。
