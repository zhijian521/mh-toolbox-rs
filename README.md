# 梦幻养老助手 · Rust 版

> **这是 Rust 重写版，稳定版在 [`zhijian521/mh-toolbox`](https://github.com/zhijian521/mh-toolbox)。**
> 那个仓库冻结保留，继续给朋友用；它是本项目的差分测试基准与数据兼容基准。

梦幻西游端游的养成记账工具。技术栈 Rust + Tauri 2 + Vue 3 + SQLite，
界面走「账簿」方向：宣纸底、墨字、朱红作记、结构靠线不靠阴影。
全站唯一字体是霞鹜文楷（GB2312 子集），六档字号全部乘 `--fs-scale`，设置页的三档滑块只改这一个变量。

## 当前状态（2026-11-04）

八个导航页都有路由，**设置 / 工具 / 角色 / 物价 / 收益**五页有内容，其余三页是占位；
工具页下挂捉鬼助手（`/tools/ghost`）。另有一张不进导航的开发页 `#/dev`，
入口是三连击左栏顶部的牌记。

| 已完成   | 说明                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| 窗口     | 1280×820，最小 1024×780，居中；productName `梦幻养老助手`，identifier `com.zhijian.mhtoolbox.rs` |
| IPC      | 17 个 `#[tauri::command]`；前端只经 `src/services/` 调用，命令表按平台分两份                     |
| 路由     | hash 模式；`src/navigation.ts` 是真源，路由与左栏都从它派生；`/equipment` 重定向到 `/characters` |
| 设置页   | 外观 / 数据（导入导出清除）/ 关于，三张卡，够宽时两列排                                          |
| 工具页   | 桌面图标式启动器：92px 格子、56px 压印图标块，没有副标题                                         |
| 捉鬼助手 | 截屏 + 本地 OCR（PP-OCRv4，缺模型退回系统 OCR）读任务栏的假坐标，在底图上画该往哪找              |
| 角色页   | 名册增删改 + 编辑器；卡 450×620，六分区属性读数                                                  |
| 物价页   | 物品卡 + 历史价 + 走势图；一级 / 二级筛选与五种排序；四个弹窗                                    |
| 收益页   | 速记格 + 今日清单 + 历史表；一笔可记给多个号，按币平分、尾差可复现                               |
| 数据层   | `%APPDATA%\mh-tool-v2\mh-toolbox.db`（rusqlite `bundled` + WAL），物价、名册、收益共用           |

未开始：`tauri-specta`（命令已 17 个，早越过当初定的 5 个阈值）、
三个业务页（总览 / 账号 / 目标）、e2e。差分 harness 不做（2026-11-04 定，见 `docs/ARCHITECTURE.md` §5）。

## 目录

只列一级、不列文件名——逐个抄清单必然漂，各目录的职责写在文件头。

```
src/
  components/   有视觉语义的 UI 单元，不调 services
  composables/  跨组件状态与副作用
  services/     系统能力的唯一出口，一个能力一个文件
  styles/       tokens / base / blocks 三张表，令牌唯一真源
  views/        路由目标，每页一个目录，页面自己的数据层也在里面
src-tauri/      Rust 壳：窗口、命令、截屏、OCR、SQLite
public/game/    游戏资源：底图、图标、事实表（规则见 docs/GAME-ASSETS.md）
docs/           五份工程文档
scripts/        质量门小工具（版本号 / 提交信息）+ 图标与字体生成脚本
tools/probe/    CDP 探针：截图、量几何，内置静态服务
assets/         字体（霞鹜文楷 GB2312 子集 + 全量原件，OFL 1.1）、牌记、应用图标源图
```

## 启动

双击根目录的 **`start.bat`**。它自己补齐 MSVC 的 `LIB` 与 `PATH`、做端口与实例预检，然后起窗口。

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222（供 e2e / 实拍）
start.bat --check    只做环境自检，不启动
start.bat --force    遇到占用或残留实例时直接处理，不询问
```

**这个文件必须存成 GBK(936) + CRLF**（存 UTF-8 时 cmd 按双字节切行，报错与真实问题毫无关系）；
在 Git Bash 里要用 `cmd //c start.bat`；启动失败时 tauri 只会说
`beforeDevCommand terminated`，已知原因有三条。这些都记在
[`AGENTS.md` §四](AGENTS.md#四启动与窗口)，不在这里复述。

## 开发

```bash
npm install
npm run dev            # 只跑前端（浏览器里可看 UI，但没有 Rust 侧）
npm run desktop        # 起 Tauri 窗口（vite + cargo run）
npm run build          # 类型检查 + 构建前端
npm run desktop:build  # 打包
npm run check          # 唯一质量门：format / lint / typecheck / test / 版本 / 提交信息
```

直接跑 `npm run desktop` 要先按 [`AGENTS.md` §三](AGENTS.md#三windows-上编译必须先设环境本机实测)
设好 MSVC 环境；`start.bat` 就是这一步的封装。

CI 另有 `rust`（`cargo fmt --check`）与 `rust-test`（`cargo test --lib`）两个 job，
**不在** `npm run check` 里——本机绿不等于能推。

要连调试端口或截真窗口的图，看 `AGENTS.md` §五（CDP 探针与降动效的验法都在那里）。

## 开工前读

| 文件                                           | 回答什么                                                     |
| ---------------------------------------------- | ------------------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                       | 这台机器上怎么干活：验证分档、沙箱限制、编译环境、启动、红线 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 分层、数据流、IPC 边界、目录归属                             |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)   | 现在该怎么写：命名、分层、样式语言、控件契约                 |
| [`docs/RECORD.md`](docs/RECORD.md)             | 每个阶段改了什么、否掉了什么（查「当初为什么」）             |
| [`docs/GAME-ASSETS.md`](docs/GAME-ASSETS.md)   | 游戏资源放哪、怎么命名、怎么替换                             |
| [`docs/GHOST-HUNT.md`](docs/GHOST-HUNT.md)     | 捉鬼助手：坐标系、ROI、OCR、渲染模式                         |

**红线只有一份，在 [`AGENTS.md` §六](AGENTS.md#六红线改代码前必须知道)。** 本文件不抄——
同一份规矩写两处，改一处忘一处就变成两条互相矛盾的规矩。

## 许可

PolyForm Noncommercial 1.0.0（沿用旧版）。字体为 SIL OFL 1.1，`assets/fonts/OFL.txt` 随字体保留。
