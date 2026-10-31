# 工程规范与优化清单

> 2026-10-30 对全仓做的一次审查，2026-10-31 按 §3 落地并校准。
> **§1「审查发现」是那天的原始记录**（含当时的行号），已修项的标题后标了 ✅——
> 要读现状请看 §0 与 §3，不要把 §1 里的数字当成现在的数字。
> 结论仍然成立：设计语言已经很扎实，缺的是工程侧的护栏——静态检查、测试、CI；
> 领域层（SQLite + 6000 行逻辑 + OCR）动工前必须补齐。

---

## 0. 现状测绘（2026-10-31 实测）

| 项         | 数值                            | 备注                                                                                      |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 前端       | 3389 行 / 31 个文件             | `.vue` 20 个 + `.ts` 8 个 + `.css` 3 个                                                   |
| Rust       | 153 行 / 2 个文件               | 只有壳：`app_info` / `open_external`                                                      |
| 最大单文件 | `base.css` 562 行               | 组件最大 `VerticalSlider.vue`（297 行）；设置页 2 个 section，开发页 5 张卡 + `tokens.ts` |
| 提交       | 90 个                           | 前 45 个是旧项目历史，本仓实际 45 个（截至第 9 小批）                                     |
| 依赖       | 4 个运行时 / 11 个开发          | 极简，很好                                                                                |
| 测试       | **0**                           | 无 vitest，Rust 无 `#[test]`                                                              |
| 静态检查   | ESLint 9 + Prettier + `vue-tsc` | 外加 `check-version` 校验三处清单文件；`npm run check` 一条全绿                           |
| CI         | **0**                           | 无 `.github/`                                                                             |
| 文档       | README + AGENTS + 本文件        | 三份，数值都按实测校准过                                                                  |

---

## 1. 审查发现

按「会不会真的出事」排序，不按「改起来容易」排。

### 1.1 阻断级（现在不做，后面要付利息）

#### A. 一行静态检查都没有 —— ✅ 已修（第一批 1–3）

`ls` 实测：无 `.eslintrc*`、无 `eslint.config.js`、无 `.prettierrc*`、无 `.editorconfig`、
无 `rustfmt.toml`、无 `clippy.toml`。唯一的质量门是 `package.json:7` 的
`vue-tsc --noEmit && vite build`——它只查类型，不查「有没有写 `v-html`」「有没有用
`:any`」「Vue 属性顺序对不对」「有没有未使用的 ref」。

旧仓 `mh-tool` 有 `eslint.config.js`（含 renderer / main / tests 三组环境分离）。新仓连
`eslint-plugin-vue` 都没装。

**为什么必须现在做**：现在 21 个文件，接上 lint 大概是改十几处；等 100 个文件、几十个
页面时接，要么一次性改几百处，要么关掉规则假装通过。**规范的价值在于「从第一天就没有例外」**。

#### B. 零测试，而项目定位是「拿旧仓当 oracle 做差分」 —— ⏳ 待第三批

README 写着「6333 行领域逻辑是唯一可信规格」、`tests/fixtures/legacy-domain/` 要 vendor 进来
做逐字段对比。但：

- 没有 `vitest`（前端）
- `src-tauri` 下没有任何 `#[test]` / `tests/` 目录
- 没有 harness 骨架

现在 Rust 只有 135 行，`data_dir()` 这种纯函数已经可以测了。**harness 要在写第一行领域代码
之前就建好**——这是记忆里已经写下的结论，但还没落地。

#### C. 工具链版本没锁 —— ⚠️ 部分完成（`engines` 与 `rust-toolchain.toml` 已加，无 `.nvmrc`）

- `package.json` 无 `engines`、无 `packageManager`（实测 `node -e` 输出「无」）
- 无 `rust-toolchain.toml`；`src-tauri/Cargo.toml:6` 的 `rust-version = "1.77"` 只是**最低**
  声明，不锁实际版本
- 无 `.nvmrc` / `.node-version`

本机是 node 22.22.2 / npm 10.9.7。换机、重装、或者以后接 CI，只要 node 主版本跳一档，
`vite 6` / `vue-tsc` 的行为就可能变，而这种变化会伪装成「代码坏了」。

#### D. 提交信息无强制 —— ✅ 已有校验器（`npm run lint:commits`，未并进 `check`）

`git log` 实测：66 个提交里 21 个带 `type:` 前缀（前 45 个是旧项目历史，不算）。
最近 20 个**全部合规**，说明习惯已经养成。但这是自律，不是机制——旧仓有
`scripts/check-commits.mjs` + `npm run lint:commits`，本仓没有。

### 1.2 结构级（影响后续每一步）

#### E. 没有路由，8 个页面靠 `v-if` 硬编码 —— ✅ 已修（第二批 8）

```ts
// src/App.vue:25
const current = ref('settings');
// src/App.vue:38
<SettingsView v-if="current === 'settings'" />
```

加一个页面要同时改两处：`pages` 数组（`App.vue:14-23`）和模板里的 `v-if` 分支。
七个占位页共用一个 `PageHeader` + 占位块，这个 if-else 会长成 8 个分支的 switch。

Tauri 跑的是本地文件，`createWebHashHistory()` 零成本，不需要服务端配置。收益是
每页一个路由、可深链接（以后「从托盘直接打开收益页」）、浏览器前进后退可用、
`SettingsView` 的 667 行能被路由懒加载摊开。

#### F. `SettingsView.vue` 667 行 / 8 个 section —— ✅ 已拆（第二批 9）

`src/views/SettingsView.vue` 里：外观（86）、原子组件（107）、色板（148）、字号阶梯（161）、
控件（174）、图标（254）、结构（282）、关于（316），每个 section 都带一段 300–100 行的 scoped 样式。
（本节是拆分**前**的测绘。其中两张卡已删：「控件」于第 5 小批删掉——组件齐了之后它只是
`SlotButton` / `SegmentedPills` / `CostSwitch` / `BaseCheck` 的第二份演示；「结构」于第 6 小批删掉——
文武线与账线的实例就是每张卡自己的 `.frame`，不必再拿一张卡讲同一件事。第 7 小批起开发用的四张卡
搬到 `views/dev/`，现为 2 个 section——验收面在 `#/dev`，见 §2.4-19。）

这不是样式问题，是「一个文件承担了 8 件事」。而且它同时是**设计系统的验收面**——
`SettingsView.vue:20-22` 的注释写着「以后新增控件先加进这一块」。这意味着它只会继续变长。

#### G. 没有状态层

`current` 在 `App.vue`，`mode`/`scale` 在 composable（侧栏的 `collapsed` 已随竖向滑块一起删除，
50px 的栏不需要第二套宽度）。
到目前够用，但业务数据一进来（角色列表、流水、装备）就需要一个明确的答案：
Pinia 还是 provide/inject？现在没定，第一个做业务页的人会自己发明一套。

#### H. 设计令牌是双份，而且已经漂了 —— ✅ 已修（第二批 12）

`src/styles/tokens.css` 与 `design/tokens.css` 是两份手工维护的副本。
`diff` 实测已经出现 4 处差异（`@font-face` 路径、两处注释措辞、`base.css` 里
`.page-content` 只在 `src/` 有）。记忆里写着「改令牌两边都要改」——这句话本身就是问题：
**凡是需要「记得两边都改」的东西，迟早会不一致。**

#### I. IPC 契约是两份手抄

```ts
// src/services/desktop.ts:11-18
export interface AppInfo {
    productName: string;
    version: string; /* ... */
}
```

```rust
// src-tauri/src/lib.rs:10-16
pub struct AppInfo { product_name: String, version: String, /* ... */ }
```

`#[serde(rename_all = "camelCase")]` 让两边字段名对得上，靠的是人记得加这个属性。
命令只有 2 个时无所谓，20 个时必然出错。`tauri-specta` 未上（记忆里已列为计划）。

#### J. `crates/` 目录还不存在

规划里领域层要拆成独立 crate（`mh-domain` / `mh-store` …），但根目录没有 `crates/`。
现在不建也没事，但**第一次写领域代码时如果顺手塞进 `src-tauri/src/`，就再也拆不出来了**。
应该在建目录的同一刻把边界写进文档。

#### K. `design/icon/` 里躺着 3.9 MB 废弃产物 —— ✅ 已清（第二批 13）

```
design/icon/icon-lab.py          ← 账簿四方案（用户已否）
design/icon/icon-preview.html    ← 同上
design/icon/png/                 ← 32 张废弃 PNG
design/icon/make-preview.py      ← 同上
design/icon/ink/                 ← 定稿（水墨焦墨 + 耶印），保留
design/icon/old/                 ← 旧图标备份，保留
```

`grep` 全仓无任何代码或文档引用前四项（只有 `.workbuddy/memory` 提过）。它们是过程产物，
留着会让下一个人以为「有两个并行的图标方案」。

### 1.3 细节级（顺手改）

| #   | 位置                                      | 问题                                                                                                                                                                    | 建议                                                                                                                                                                |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/composables/use-font-scale.ts:22-36` | **每次调用都 `ref()` + `watch()` + `apply()`**。现在只有 `SettingsView.vue:25` 一处调用，所以没暴露；第二个组件一调，就是两份互不相干的 ref，且每次挂载重复注册 `watch` | 照 `use-theme.ts` 的做法改成模块级单例 + 惰性 `wire()`。**这是刚修过的同一个 bug，只是换了个文件**（`use-theme.ts:17` 的注释写明了原因）                            |
| 2   | `src-tauri/src/lib.rs:22`                 | `format!("{base}\\mh-tool-v2")` 手工拼反斜杠                                                                                                                            | 用 `PathBuf::from(base).join("mh-tool-v2")`。`APPDATA` 带尾斜杠时会拼出双斜杠                                                                                       |
| 3   | `src-tauri/src/lib.rs:52`                 | `url.starts_with("https://")` 只判前缀，`https://` 空 host 也能过                                                                                                       | 加 `url` crate 解析，校验 scheme + host 非空。这是安全边界，不该宽松                                                                                                |
| 4   | `src-tauri/tauri.conf.json:15`            | `"csp": null`                                                                                                                                                           | ✅ 已配（见 §3 第二批 14）。生产 `csp` 严格、开发 `devCsp` 另列；真窗口实测 IPC 通、零控制台报错                                                                    |
| 5   | 全局                                      | **无 `prefers-reduced-motion` 降级**（`grep` 无一处）。站内有 120/180/240ms 位移 + 回弹                                                                                 | ✅ 已加（`base.css` 末尾）。实测改成**通配 + `!important`**：位移时长有 140/200/220ms 几处写死在组件里，改令牌兜不住；且用 1ms 不用 0s，否则 `transitionend` 不触发 |
| 6   | `src/components/icons.ts`                 | 加一个图标要改 **4 处**：`IconName`（:53）、`ICONS`（:88）、`ICON_LABELS`（:139）、`ICON_GROUPS`（:176）                                                                | ✅ 已合并成 `ICON_META` 一张表，`IconName`/`ICONS`/`ICON_LABELS`/`ICON_GROUPS` 全部派生                                                                             |
| 7   | 版本号                                    | **4 处手写**：`package.json:4`、`src-tauri/tauri.conf.json:4`、`src-tauri/Cargo.toml:3`、`TitleBar.vue:47`（`RUST · V0.1`）+ `AppRail.vue:24`（`ref('0.1.0')` 兜底值）  | 定一个真源（`package.json`），其余由构建脚本注入或在 CI 里校验一致                                                                                                  |
| 8   | `src/components/`                         | 命名不统一：`BaseCheck` 带 `Base` 前缀，`SlotButton`/`SegmentedPills`/`AppIcon` 不带                                                                                    | 见 §2.2 的三条前缀规则                                                                                                                                              |
| 9   | `src/App.vue:3`                           | `import AppRail, { type RailPage } from './components/AppRail.vue'` —— 跨组件类型从 SFC 里导出，靠双 `<script>` 块才能做到                                              | 跨组件类型收进 `src/types/`                                                                                                                                         |
| 10  | `src/styles/base.css:101`                 | `border-radius: 10px` 是唯一硬编码圆角                                                                                                                                  | 滚动条滑块不是设计元素，可以保留，但加一行注释说明为什么例外                                                                                                        |
| 11  | `README.md`                               | ✅ 已修（2026-10-31）。原问题：目录清单缺 `AppRail`/`SlotButton`/`SegmentedPills`/`IconName` 体系，最小高度还写着 680（实际 780）                                       | 已按实测校准，并顺手改掉 `.cargo` 路径里写死的旧用户目录                                                                                                            |
| 12  | `docs/`                                   | 不存在。所有约定都靠代码注释承载（注释质量很高，但 456 行 `base.css` + 15 个组件，新人读不到全貌）                                                                      | 见 §2.6                                                                                                                                                             |

---

## 2. 规范条款

### 2.1 工程基线

**必须装**（全部是旧仓已验证过的组合，不需要重新选型）：

| 用途      | 依赖                                                                              | 配置要点                                                                                                                      |
| --------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 静态检查  | `eslint` 9 + `@eslint/js` + `eslint-plugin-vue` + `typescript-eslint` + `globals` | flat config；`vue/flat/recommended`；**不开风格类规则**（交给 Prettier，避免两套格式化打架）                                  |
| 格式化    | `prettier`                                                                        | `printWidth: 100`、`tabWidth: 4`、`singleQuote: true`、`trailingComma: "all"`、`semi: true`、`vueIndentScriptAndStyle: false` |
| 编辑器    | `.editorconfig`                                                                   | `indent_style = space`、`indent_size = 4`、`end_of_line = crlf`（.bat）、`charset = utf-8`                                    |
| Rust 格式 | `rustfmt.toml`                                                                    | `max_width = 100`、`edition = "2021"`                                                                                         |
| Rust 检查 | clippy                                                                            | `cargo clippy -- -D warnings`（`unwrap`/`expect` 由人工把关，不靠 lint 全禁）                                                 |

**依据**：现有代码实测 30 个文件（19 `.vue` + 8 `.ts` + 3 `.css`）全是 4 空格缩进、0 个 2 空格；最长行 96 字符
（`src/components/icons.ts:143`）。`printWidth: 100` 这一档不会折任何一行，可以接受。

**脚本约定**（照搬旧仓的命名，肌肉记忆不用改）。下面这段是**已落地**的实际内容，
与 `package.json` 一致：

```json
"format":       "prettier --write .",
"format:check": "prettier --check .",
"lint":         "eslint . --max-warnings 0",
"lint:fix":     "eslint . --fix",
"lint:commits": "git log -20 --no-merges --format=%s | node scripts/check-commits.mjs",
"typecheck":    "vue-tsc --noEmit",
"check":        "npm run format:check && npm run lint && npm run typecheck && npm run check:version && npm run lint:commits"
```

`npm run check` 是唯一入口，人跑的和 CI（`.github/workflows/check.yml`）跑的是同一条命令
——这个约定比规则本身重要，因为它意味着「本机绿 = CI 绿」。

两条都踩过，写在这里：

- **`--max-warnings 0`**：原先 `lint` 就是 `eslint .`，而 `attributes-order` /
  `define-macros-order` / `no-console` 三条是 `warn`。警告不影响退出码，等于这半条检查
  只打印不拦人。现在只要有噪音就是红的。
- **`lint:commits` 进 `check`**：它原先只作为独立脚本存在，于是「自己已经红了」这件事
  没人发现——正则要求冒号后带空格，而实际 8 条提交是紧贴写的。**没接进唯一入口的检查，
  等于没写。**

两处刻意的「不做」：

- **`check` 里暂时没有 `test`**。vitest 要等第三批（领域层地基）才接，现在放一条
  `vitest run` 会让命令直接失败；放 `exit 0` 的假通过更是骗人。接了测试再往这条链上加。
- **`check` 里没有 Rust**。`cargo clippy` 依赖 MSVC 的 `LIB` 与 `PATH`（见 `AGENTS.md` §三），
  混进 `check` 会让「一条命令全绿」在这台机器上不成立。Rust 侧单独跑：

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

**版本锁定**：

```json
"engines": { "node": ">=22.0.0 <23", "npm": ">=10" },
"packageManager": "npm@10.9.7"
```

`.nvmrc` 写 `22.22.2`（本机实测版本）。CI 用 `node-version-file: .nvmrc` 读它——
`engines` 只在大版本上拦人，`.nvmrc` 才能让 CI 与本机跑同一档。

**行尾由仓库说了算**：`.gitattributes` 里 `* text=auto eol=crlf`（仓库存 LF、工作区 CRLF），
`.editorconfig` 的 `end_of_line = crlf` 与它一致。

原先只有 `*.bat` / `*.cmd` 有声明，源文件全赖本机的 `core.autocrlf=true`——那是**用户级**
配置，不随仓库走。实测当时 64 个文本文件里混着 3 个 LF（被脚本按 `\n` 写出来的那几个）。
症状不是乱码，是**静默**：改一行而 `git status` 显示整篇 M、`git diff` 却是空的，
或者反过来漏掉真正的改动。换台机器、或在 Linux 上 clone，整套行尾预期都会变一次。

规范化只做一次：`git add --renormalize .`（索引本来就是 LF，实测 0 处变更），
再 `rm` 掉那几个 LF 文件、`git checkout --` 让它们按新属性重新落地。

```toml
# src-tauri/rust-toolchain.toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

**提交规范**：`<type>(<scope>):<中文摘要>`，type 白名单
`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`。
**冒号后不加空格**——中文摘要贴着冒号读是一行，加空格反而多一个断点；
校验器 `scripts/check-commits.mjs` 对两种写法都放行（`:\s*\S`），因为现有 45 条提交里
8 条是紧贴写成的，改习惯的成本高于放宽正则，而放宽的只是「一个空格」，不是格式本身。
正文写「为什么」，不写「改了什么」——`git show` 已经能看到改了什么。
`npm run lint:commits` 只看最近 20 条；更早的 45 条是旧仓历史（`[feat][20241225][…]` 那种），
不追溯、不改写历史。

**不用 husky**（沿用旧仓的判断）：本机沙箱对带管道的子进程不稳定，钩子容易误报。
校验放 `npm run check` + CI。

### 2.2 命名

三条前缀规则，覆盖 `src/` 全部：

| 前缀 / 形态 | 含义                                       | 例子                                           |
| ----------- | ------------------------------------------ | ---------------------------------------------- |
| `Base*`     | 通用控件基元，与业务无关，可被任何页面复用 | `BaseCheck`、`SegmentedPills`、`SlotButton`    |
| `App*`      | 应用外壳的一部分，全局唯一                 | `AppRail`、`AppIcon`、`PageHeader`、`TitleBar` |
| 业务名      | 只服务于某一页/某一域                      | `IncomeLedger`、`EquipmentCard`                |

现状里 `BaseCheck` 与 `SlotButton` 分属两套命名。**建议不重命名**（改名会冲掉 git blame），
而是在文档里明确：`Base*` 是历史遗留的基元前缀，新基元直接用功能名（`SlotButton` 这种），
不再新增 `Base*`。这样只需要一条规则，不需要一次大改。

其余约定：

- 组件文件 `PascalCase.vue`，一个文件一个组件
- composable `use-xxx.ts`，导出 `useXxx`
- 类型 / 接口 `PascalCase`，**不加 `I` 前缀**（现有 `AppInfo`、`RailPage` 已经是对的）
- CSS 类名 `kebab-case`，BEM 不强制；**层级靠块前缀**（`.rail-item`、`.rail-foot`）而不是嵌套选择器。
  **类名不要求等于组件名**：`.rail-mark`、`.size-slider`、`.vs-track` 都是块语义命名，与
  `AppRail` / `FontSizeSlider` / `VerticalSlider` 不同名。找组件靠 grep 模板里的标签名，不靠类名；
  反过来为了「对齐」而批量改名，会冲掉 git blame，收益低于成本。
- 设计令牌 `--<类别>-<语义>`：`--paper`、`--ink-2`、`--fs-base`、`--r-2`、`--sp-4`、`--t-quick`

### 2.3 组件分层

```
views/          页面 = 路由目标。只做编排：拉数据、拼区块、处理路由参数
components/     组件 = 有视觉语义的 UI 单元。不直接调 services/，不读路由
composables/    跨组件的状态与副作用。单例状态放模块作用域
services/       系统能力唯一出口（desktop.ts）。页面与组件都不许绕过它调 invoke
types/          （待建）跨组件共享的类型
```

四条硬规则：

1. **组件不调 `invoke`**。只有 `services/desktop.ts` 能碰系统——`desktop.ts` 头注释立了这条，
   ESLint 的 `no-restricted-imports` 把它变成可检查的约束：`components/`、`views/`、
   `composables/` 里出现 `@tauri-apps/api`、`@tauri-apps/api/*` 或 `@tauri-apps/*` 一律报错。
   早先只拦了 `@tauri-apps/api/core`（`paths` 只匹配一模一样的模块名），于是 `TitleBar.vue`
   直接引 `@tauri-apps/api/window` 管窗口按钮，lint 照样全绿——**规矩写着「只有 services 能碰
   系统」，检查却只管一个入口**。改成 `patterns` 后整族都拦，窗口控制也搬进了 `desktop.ts`。
2. **质感在组件内，布局在父级**。`SlotButton` 只认 `--slot-h`/`--slot-w`，不写死尺寸；
   父级用 `.rail-foot { --slot-w/--slot-h: calc(30px * var(--fs-scale)) }` 传。`VerticalSlider`
   同理：默认值是侧栏规格（轨道 34 / 格 62 / 图标 15 / 字 14），父级要换尺寸就覆写
   这五个 `--vs-*` 变量。图标一律走 `--icon-size`（见 §2.4-15）。
   原理：父组件 scoped 样式能命中子组件根元素。
3. **一个组件要么管状态，要么管样子，不要两个都管**。`SegmentedPills` 管「选一个」，
   格子的质感交给全局 `.bevel-pill` 类——这是范本。
   这里**不包一层 `BevelPill` 组件**：那枚胶囊自带 `aria-pressed`，是「独立开关」的语义，
   放进互斥组会与 `aria-checked` 打架；而一组格子还需要 roving tabindex，
   也不是单枚胶囊能表达的状态。全局类既能被组件用，也能被 `design/income.html` 直接用。
4. **新增控件先进开发页的「原子组件」卡**（`views/dev/AtomsSection.vue`），再进业务页。
   那一页（三连击左上角标进入，见 §2.4-19）是这套语言的验收面，不是给用户看的演示页。
5. **侧栏不滚动，窗口最小高度由它决定**。`AppRail.vue` 是 `overflow: hidden`——
   8 档一旦要滚，拇指就跑出视口，「第几档」的位置感失效。所以高度交给窗口兜底：
   `src-tauri/src/lib.rs` 的 `min_inner_size` 取「较大」字号（`--fs-scale: 1.1`）时的实测需求
   （侧栏 736.2 + 标题栏 39.6 = 775.8 → 取 **780**，默认窗口 1280×820；实测 776 仍不滚、
   772 开始裁底栏，所以 780 是硬下限）。加高侧栏里的东西（多一格、加大格高、底部再加
   一个按钮）必须同步抬这个数，否则最后一格会被裁掉。反过来说，想再压低最小高度只能
   动侧栏自己：格高（`--vs-cell: 62px`，是「图标 15 + 两字竖排 32.2 + 间距」的下限）、
   牌记高度、或底栏那两枚 30px 按钮。
   **注意「最小高度」不等于「默认档刚好填满」**：按 1.1 档定，默认档必然在槽与底栏之间
   留一段空白，那是留白，不是没排完——留白由 `.rail-foot` 的 `margin-top: auto` 吸收，
   底栏永远贴底。
   **栏顶牌记的高度与 `PageHeader` 等值**：两处都取 `--page-head-h`。那枚令牌写的就是
   「padding 10 + `--fs-xl` × 1.15 + 9 + 1px 账线」，改页头的 padding 或标题行高只改它一处。
   （曾经两边各抄一份算式，正是 §1.2-H 里反对的那种写法。）否则下面那道槽的起点会在
   50px 栏宽处与页头底边错开一个台阶。**槽顶紧贴这条线**（`.rail-nav` 不设 margin-top）：
   留 6px 时槽顶比右侧横线低半格，接缝处永远差一个台阶。
   **牌记本身不画下边框**：那里放的是直接落在纸上的应用标
   （`assets/mark-ink.png` / `mark-paper.png`，与 `assets/fonts/` 同处，随主题翻面），横线会把它切成一个
   「头部区块」，而上面并不是区块名。
   **标是 34px 见方的厚牌，宽度与目录槽一致**（都取 `--vs-w`），整条栏读作一列
   而不是「一枚图 + 一条槽」。**厚度靠底边那 2px 侧面，不靠面上的渐变**：34px 见方时
   一块面的渐变只有十几像素的过渡带，读出来是「这块颜色不匀」而不是「这块有厚度」。
   三个面各是一个变量——`--mark-face`（面：亮色取纸色，纸已经是最亮的，再亮只能发灰；
   暗色往 `--ink` 掺 12%，因为暗色下纸是最暗的，面必须比纸亮一档才浮得起来）、
   `--mark-lip`（侧面：亮色由纸往 `--rule-2` 压一档，压少了读成描边、压多了成脏斑；
   暗色直接落到纸色，于是底边没有「一道深边」，只有「面结束了」）、
   `--mark-edge`（其余三边的细线和落地线，与槽的描边同源，接缝处才是同一层级的两条线）。
   再加顶边 1px `inset` 硬高光与两道投影。投影只能用 `--bevel-lo`：`--shadow` 在亮色
   只有 8% 黑，涂在纸上等于没有；`--ink` 更不能碰——暗色下它是纸白，会涂出一圈白光。
   **圆角取 `--r-2`**，与目录槽的 `--vs-radius`、格里的朱印同值；圆角与那 2px 侧厚
   都**不乘** `--fs-scale`——它们是绝对曲率与绝对厚度，槽那边也没乘，两处一起缩放反而对不上。

### 2.4 样式

现有代码在这块**已经接近满分**（实测：0 处硬编码 `font-size`、0 处硬编码十六进制颜色），
把已有做法固化成条款即可：

1. **颜色只能来自令牌**。禁止 `#rrggbb`、`rgb()`、颜色名。需要的色先用 `color-mix()` 从令牌混。
   **灌朱的控件一律用 `--seal` / `--seal-edge` / `--on-seal` 这一组**，不要直接拿
   `--cinnabar` / `--cinnabar-ink` / `--on-cinnabar` 配面与字。原因：`--cinnabar` 在暗色翻成
   #d0755f 的亮橙红，而 `--on-cinnabar` 同时翻成近黑 #171310，深字压亮红会被红色吃掉；
   所以暗色的面改用 `--cinnabar-ink`、字改用纸白 `--ink`，两个主题统一成「朱底浅字」
   （`tokens.css` 里 `--seal` 那一段有完整推导）。分界是**面还是前景**：
   填充用这一组，把朱当字/线/描边用仍取 `--cinnabar`。
   `--paper` **暗色是深纸**（#1c1912），不是纸白；要纸白取 `--ink`。
   组件里若仍需写暗色覆写，**必须整条写进 `:global()`**：
   `:global(html.dark .sel)` 编出来是 `html.dark .sel`，而 `:global(html.dark) .sel`
   会被编译成只剩 `html.dark`，后半截选择器直接丢掉（构建产物里 grep 一下就能看见）。
2. **字号只能来自 `--fs-*`**，且每个令牌已经乘过 `--fs-scale`。禁止 `font-size: 14px`。
3. **圆角只能来自 `--r-1/2/3/pill`**。账簿方向基本不用圆角，唯一例外是滚动条滑块。
   侧栏竖滑块（`VerticalSlider.vue`）外框、格、印**共用 `--vs-radius`（`--r-2`，3px）**——
   一处改三处一起变。胶囊（`--r-pill`）现在只留给三档滑块、分段胶囊这类横向控件。
4. **间距优先 `--sp-*`**。现状里有不少 `gap: 5px`/`padding: 14px 10px` 的裸值（
   `AppRail.vue`、`SettingsView.vue` 多处）——这块**不建议现在全改**，成本高收益低。
   规则改成：新代码用令牌，旧值遇到再顺手换。
5. **结构靠线，不靠阴影**。分区用文武线 `.frame`；列表的行分隔用行级
   `border-bottom: var(--w-hair) solid var(--rule)`。阴影只用于「凸起」的一次性投影。
   曾经有个全局 `.ledger-lines`（整片 `repeating-linear-gradient` 画满横线），全站零引用，已删——
   真要用「格子纸」，那是**某个列表**的私有样式，写在该组件的 scoped 里，不要再升成全局类。
6. **动效必须走 `--t-*` + `--ease-*`**，位移类动效统一带 `--ease-snap`（回弹）。
7. **`prefers-reduced-motion` 必须有降级**（见 §1.3-5）。
8. **令牌只有一个真源**（✅ 已执行）。`design/` 下不再有样式表副本，`design/income.html`
   直接引 `../src/styles/tokens.css` / `base.css` / `blocks.css`。以后要做独立设计稿，
   **引同一份文件，不要复制**——需要「记得两边都改」的东西一定会漂。
9. **选中态只换「朱底」，不改字形**。`font-weight`、`font-size`、`letter-spacing`、
   `-webkit-text-stroke` 在选中与未选中之间**必须完全相同**。现状实测：竖版滑块、
   横版三档滑块、分段胶囊三处的选中项计算值一律 400 / 同一字距 / 0 描边，
   七个区块标题（`.ledger-section h2`，设置页 2 张 + 开发页 5 张）也全是 400。
   全站样式表里没有任何 `600` / `700`：`base.css` 只有一条 `h1, h2, h3, h4 { 400 }`
   的合并规则，外加 `.note b` / `.page-title` / `.icon-item b` / `.swatch b` 四处
   显式 400（后三处是把 `<b>` 的浏览器默认加粗压回去），其余一律继承。
   理由有两条：① 文楷本地只有 Regular，`600` 与任何 `text-stroke` 都是浏览器合成，
   会把撇捺糊成块；② 一枚灌朱、带内高光与投影的印本身已经把「选中的是它」说清楚了。
   0.25px 描边尤其要当心——它只把笔画外扩一圈，肉眼读到的就是「这格加粗了」，
   而代码里 `font-weight` 根本没变，查的时候容易找错地方。
   同理，组件里的 `font-weight` 要慎写：scoped 选择器（如 `h2[data-v]`）特异性高于
   全局的 `h2`，一处漏写就会把某个区块顶成合成加粗，而全局表里看不出来。
10. **一组「选一个」＝ 一个 Tab 停靠点**。`radiogroup` + `radio` + `aria-checked`；
    只有当前项 `tabindex=0`，其余 -1；方向键换选项并**把焦点带走**，`Home` / `End` 跳首尾。
    四个控件（侧栏竖槽、三档滑块、两格开关、分段胶囊）统一走
    `src/composables/use-roving-focus.ts`，不再各写一套——此前只有侧栏做全了，
    另两处能 Tab 进每一项，分段胶囊连方向键都没有。组里允许个别禁用项时用
    `isDisabled`，方向键会跨过它而不是卡住。
    导航用 `<nav>` + `aria-current="page"`，**不用** `tablist`：全站没有 tabpanel、
    也没有 `aria-controls`，读屏会宣布「标签页 1/8」然后找不到面板。
11. **凹与凸各只有一处定义：`.well` 与 `.stamp`**。凹槽是金边 + `--well` 底 + 上暗下亮渐变
    - 上沿内影与下沿**亮**高光；印面是底色 + 顶边受光 + 上沿高光 + 落地线与朱色投影。
      两者都写在 `base.css`，控件只写几何（宽高、内边距、圆角、排布），不重写厚度。
      竖起来的槽用 `.well.upright`（暗面换到左壁）；印面的底色走 `--stamp-bg`，
      两格开关「灭灯」换的就是这一个变量。
      **受光一律写像素过渡带（`transparent 9px`），不写百分比**：百分比按元素自身高度解析，
      同一串数落在 23px 的胶囊与 62px 的格上会得出两种宽度——五处印面曾经各拍一套
      （46/46/46/32/15%），改任一处高度就得重调五处。
      改厚度就改那一处，改完五道槽、五枚印同时变；想给某个控件单独调淡，先想清楚是不是约定错了。
12. **令牌表里有一部分是「词汇表」，不是死码**。`--sp-*` 十档现有 8 档零引用，
    `--z-*` / `--overlay` / `--danger-bg` / `--warn-bg` 全零引用——它们是给还没写的页面
    备的词（弹窗、错误态、遮罩），`AGENTS.md` §七 已定「新代码用令牌、旧值遇到再换」。
    审查时别把零引用令牌当垃圾清：删掉只会让下一个人重新写 `z-index: 200` 和 `gap: 8px`。
    **死码是「零引用的类和组件」，不是令牌。**
13. **展示令牌的页面必须运行时读，不许手抄**。「色板」「字号阶梯」曾经是两份手写清单
    （13 个颜色、8 档 px），`tokens.css` 后来新增的 `--seal` 组一次都没在色板上出现过——
    这就是「需要记得两边都改」的代价。现在两页都走 `views/dev/tokens.ts` 的
    `declaredTokens` / `colorTokens` / `tokenFontSize`：名字从已加载的样式表里枚举，
    值挂到隐藏探针上让浏览器算（判断颜色用的是「套成 `background-color` 读回来」，
    不是 `CSS.supports`——后者只要值里含 `var()` 就返回 true，会把 `--fs-*` 误判成颜色）。
    新增令牌不需要动页面。**任何「文档页」都不要抄代码里的数字。**
14. **一个控件的「皮」放哪里，只看一条：样张要不要裸用**。`design/income.html` 是不经组件的
    静态 HTML，它只认得类名——被它用到的控件（`.frame` / `.section-mark` / `.bevel-pill` /
    `.cost-switch` / `.check` / `.well`）必须留在全局表；只被 Vue 组件用的
    （`.size-slider` / `.slot-btn` / `.vs-*`）写组件 scoped。判据不是「通用不通用」：
    再通用的控件，样张不用就不用进全局。**进了全局就要接受「全局类改名要同步样张」的代价**——
    B 批给 `.well` 拆类时，样张里 15 处 `.bevel-pill` 和 4 处 `.cost-switch` 是手工补的 `well`；
    印面归一那次，5 处选中胶囊改成 `stamp` 并摘掉 `well`，8 处开关格子补 `track-opt`。
15. **尺寸只有一个入口：父级覆写变量，组件不认 prop**。图标是 `--icon-size`
    （默认 `calc(14px * var(--fs-scale))`），槽按钮是 `--slot-h` / `--slot-w`，
    区块标是 `--mark-w` / `--mark-h`，竖槽是 `--vs-*`。全站曾经三种并存：`AppIcon` 用 `size` prop 写
    inline px、`SealMark`（已删）也用过 prop、其余走变量——而 inline px 会顶掉默认值、
    也不跟 `--fs-scale` 一起缩放，「较大」档里字号长了而标题栏三枚图标不长。
    判定一条就够：**这个值要不要跟着字号缩放？** 要，就必须是变量。
16. **轨道里的一格是 `.track-opt`**。两格开关与三档滑块的可点区域逐行相同（定位、圆角、
    字色、行高、过渡），只有内边距差 2px；选中字色由轨道的 `--opt-fg` 给（默认 `--on-seal`，
    灭灯时换 `--ink`）。各写一份 `.cost-opt` / `.size-opt` 的结果是两处 `padding` 各自漂。
17. **区块标题前缀是 `.section-mark`（凸起短竖条），不是印章**。原先每块各挂一枚歪 2.5° 的
    朱红方框，块与块之间就被红点压闷了，而「印章」在账本语境里本来就该留给
    「已入账 / 已达成」这类**状态**。标记是恒定的一竖、不带字：它只交代「一块从这里开始」，
    不参与叙事，也就不需要每块编一个字。材质仍走 `--bevel-*`（左沿受光、右沿落暗、下方落地影），
    与 `.well` / `.stamp` 同一光向——这是它读得出厚度的唯一原因。
18. **「标题 + 并排小字」的行不要用 `align-items: baseline`**。`h2` 自己也是 flex 容器，
    它第一个 item 是那枚**空的**标记；按 Flexbox 规范，没有文字的 flex item 基线取自身底边，
    于是 `h2` 对外报出的基线是「标记底边」，11px 的说明文字被拉到比标题文字低 2.5px，
    整行读起来是「小字掉下去了」。`LedgerSection` 改用 `align-items: flex-end`：底边严格重合
    （7 张卡 × 三档实测全 0.00），`h2` 仍是 19 高。**也不要**把 `h2` 退回 inline 排版来修——
    18px 的标记会把行框撑到 20.6，每张卡高 1.6px。

19. **开发用的页面不进左栏**。`/dev`（`views/dev/DevKitView.vue`）在 `router.ts` 里单独挂一条、
    不进 `NAV_ITEMS`，入口是**三连击左栏牌记**。三条约定：
    ① 栏只发事件（`request-dev`），路由由 `App.vue` 决定——`AppRail` 的注释写着「它不知道路由的
    存在」，别破这条；② 这类页面的 `current` 取不到导航项，外壳要给空串，让 `VerticalSlider`
    的 `hasActive` 收起朱印——`useRovingFocus` 的 `indexOf` 找不到值会返回 0，照它画会把朱印
    停在「总览」上，读起来像「你在总览」；③ 判据是**读者**而不是内容量：用户要动的东西留设置页
    （外观、关于），做界面时要查的东西（组件、色板、字号、图标）进开发页。

20. **一叠卡只剩两张就并排，但断点由内容宽度算，不写 `@media`**。`.stack-pair` 只给 `.stack`
    换轴：`repeat(auto-fit, minmax(420px, 1fr))`。420 是设置页最宽一行（字号 + 三段滑块 + 说明）
    的下限；写死 `1fr 1fr` 再配媒体查询，断点就和内容脱钩了——滑块被压扁、说明掉到第二行
    发生在哪个宽度，没人管得住。并排时两卡的文武线要齐（grid 默认 `stretch`）：短的那张
    下面留白，比两张卡底边错开一截好看；退回一列时每行只有一张卡，`stretch` 自然失效，
    各自按内容高——不需要第二套规则。开发页仍是单列：那四张卡高度差得远，并排会拉出两个大洞。

21. **「按下即选值」与「拖动关过渡」不能同时生效**。竖槽原先把两件事都写在 `pointerdown` 里：
    先置 `dragging`（`.dragging` 把 `transition` 关成 `none`），紧接着 `pick()`——点击是在
    过渡被关掉的那一刻选中的，朱印只能瞬移，点得越准越像没有动画。现在分两条路：
    **纯点击在 `pointerup` 才选值**（那时过渡还开着，印从原位滑过去），指针越过 4px 阈值
    才认作拖动、此后选值跟随指针。阈值不是防抖的花样：它把「手抖 1px 的点击」留在点击那条路上。
    判据不是 CSS 里有没有 `transition`——真点击要能数出中间帧（实测 300ms 内 36 个不同位移、
    40ms 时印正压在相邻两格上），拖动期间 `transitionDuration` 必须是 `0s`。

### 2.5 注释

现有注释质量很高——写的是「为什么」和「踩过什么坑」，不是「这行做什么」。这是最重要的
资产之一，要立成条款：

1. **文件头写「这个文件解决什么问题」**，不写「这是 xx 组件」。
2. **反直觉的写法必须写原因**。例：`AppRail.vue` 里 `min-width: 0` 那条、
   `use-theme.ts` 里单例那条——都是「不写下来下次一定重踩」的类型。
3. **不要写「改了什么」**，那是提交信息的活。
4. **不写废话注释**：`// 定义变量`、`// 循环` 一律不写。
5. **代码里留「契约」，历史留在这里**。「当初试过 A、某次截图指出 B、所以现在写 C」是
   §1 的素材，不是行内注释的素材——`git blame` 与提交信息已经存了一份，行内再抄一遍
   只会把 200 行的组件推到 260 行。行内要留下的是那句「不这么写会怎样」：
   「`--bevel-lo` 恒偏黑，用 `--ink` 会在暗色主题翻成提亮带」是契约；
   「早先这里写的是 `--ink`」不是。
6. 中文注释，句号结尾，不用「注意」「小心」这类空话开头——直接说事实和后果。
7. **模板里的中文文案不要手动断行**。Prettier 会按 `printWidth` 折行，而折行点在 HTML
   里渲染成一个空格——「前端不用改。 字号同理」中间就多了一个空格（实测）。
   要强制断句就用 `<br>` 或拆成多个 `<p>`，不要靠源码里的换行。
   同理：一段文案只有一两句时，宁可让它整行超过 100 字符被 Prettier 折，也不要手动
   在两句话中间敲回车。

### 2.6 文档

`src/` 之外应该有四份东西，都不长（旧仓的四份加起来 534 行）：

| 文件                   | 内容                                                                   | 什么时候读 |
| ---------------------- | ---------------------------------------------------------------------- | ---------- |
| `docs/ARCHITECTURE.md` | 分层、数据流、IPC 边界、crate 划分、数据兼容红线                       | 开工前     |
| `docs/UI_GUIDE.md`     | 视觉基座、令牌语义、控件契约（每个控件的「什么时候用它」）、焦点与键盘 | 写界面前   |
| `docs/PAGE_GUIDE.md`   | 新增一个页面的固定动作清单 + 反模式                                    | 写页面前   |
| `AGENTS.md`            | 本机环境硬约束表（沙箱能做什么、不能做什么）、验证方式、明确不做的事   | 每次开工   |

`AGENTS.md` 尤其重要：现在那些环境坑（5173 占用、WebView2 crashpad 占住数据目录、
`git commit -m` 里不能出现某些词、`start.bat` 必须 GBK+CRLF）**只存在于
`.workbuddy/memory/`，而这个目录被 `.gitignore` 排除了**——换台机器、换个会话、
或者别人接手，全部丢失。它们应该进 `AGENTS.md`。

`docs/CONVENTIONS.md`（本文件）作为工程规范的入口，与上面四份并列。

---

## 3. 落地顺序

分三批，每批都能独立验证、独立提交。**不要合并成一次大重构**。

### 第一批：护栏（不改业务代码，1–2 天）— **✅ 2026-10-30 已完成**

1. ✅ `.editorconfig` + `.prettierrc.json` + `.prettierignore` + `src-tauri/rustfmt.toml`
2. ✅ 跑 `prettier --write .`，实际只改了 11 个文件、全是长行折行，无语义变化
3. ✅ `eslint.config.js`（四组环境分离；`eslint-plugin-vue` 用 `flat/essential`）
4. ✅ `cargo fmt` + `cargo clippy --all-targets -- -D warnings`，0 告警
5. ✅ `scripts/check-commits.mjs`（从旧仓搬，改了一行示例文案）
6. ⚠️ `engines` 已加；`rust-toolchain.toml` 用 `channel = "stable"` 而非具体版本
   （写 `1.99.1` 时 rustup 判定为另一套工具链并触发下载，本机卡住）。实测版本记在文件注释里
7. ✅ `AGENTS.md`

**验收结果**：`npm run check` 全绿（format:check + lint + typecheck）；
`cargo fmt --check` 与 `cargo clippy --all-targets -- -D warnings` 均无输出；
`npm run lint:commits` 最近 20 条全部合规。

### 第二批：结构（2–3 天）— **✅ 2026-10-30 已完成**

8. ✅ 引入 `vue-router`（`createWebHashHistory`），8 个页面各一个路由，`App.vue` 的 `v-if` 收掉。
   导航数据抽成 `src/navigation.ts`（`NAV_ITEMS` / `NAV_BY_KEY`），路由、左栏、页头标题共用一份。
   未实现页共用一个 `PlaceholderView`，标题读 `route.meta.title`——不为七个空页写七份模板
9. ✅ 拆 `SettingsView`：`views/settings/` 下 8 个 section（外观 / 原子组件 / 色板 / 字号阶梯 /
   控件 / 图标 / 结构 / 关于）+ `shared.ts`，视图本身 **52 行**（含 6 行样式），只剩组合与顺序
   （现为 6 个：控件与结构两张卡分别在第 5、6 小批删除）
10. ✅ `useFontScale` 改模块级单例（惰性 `wire()`），与 `useTheme` 同形
11. ✅ `icons.ts` 四表合一：`ICON_META` 一张表，`IconName` 由 key 推，其余三个导出由值推
12. ✅ 令牌单一真源：删掉 `design/tokens.css` 与 `design/base.css`，`design/income.html` 直接引
    `../src/styles/*.css`（字体 url 相对 CSS 自身解析，实测正常）
13. ✅ 清掉 `design/icon/` 的废弃产物（`icon-lab.py`、`icon-preview.html`、顶层
    `make-preview.py`、`png/`、`ink/png/` 共约 1.4 MB）。保留 `ink/`（定稿 + 生成脚本 + 自包含
    的 `preview.html`）与 `old/`（旧图标备份）
14. ✅ `csp` 换成严格策略（`devCsp` 另列，放行 Vite 的 `ws:` 与 `'unsafe-eval'`）+
    `prefers-reduced-motion` 降级
15. ✅ 版本号收敛：`useAppInfo` 单例（真窗口读 Rust 返回值，浏览器预览退回 `package.json`），
    `TitleBar` 与 `AppRail` 不再写死；`scripts/check-version.mjs` 校验三处清单文件一致，
    已挂进 `npm run check`

**验收结果**（2026-10-30 实测）：

- `npm run check` 全绿（format:check + lint + typecheck + check:version）
- 8 个页面都能 URL 直达；未知路径兜底回设置页；`SettingsView.vue` 52 行（含 6 行样式）
- 设置页 8 个 section、图标 33 项（8/16/5/4）都在，`truncation` 探针为空
- **生产 CSP 实测**：`tauri build --debug --no-bundle` 出包后运行，8 个 section 正常、
  字体加载成功、`appInfo` IPC 通、控制台零报错（`Log` + `Runtime` 事件全收，含 CSP 拦截）
- **降动效实测**：`--force-prefers-reduced-motion` 下，`.cost-thumb` 与 `.vs-thumb` 的
  `transition-duration` 由 `0.3s` 变为 `0.001s`（后者是写死的 300ms，证明通配规则
  确实兜住了令牌之外的写法）

### 第三批：领域层地基（在写第一行业务逻辑之前）

16. `crates/` 建立，先只放一个 `mh-domain` 空 crate，把模块边界写进 `docs/ARCHITECTURE.md`
17. `tauri-specta` 接上，`AppInfo` 开始由 Rust 生成 TS 类型
18. 测试基座：`vitest` + `src-tauri` 的 `#[test]` + 旧仓 `domain/` 的 vendor 目录
19. 差分 harness 骨架：Node 侧跑旧实现落 JSON，Rust 侧跑同输入逐字段比
20. 写 `docs/ARCHITECTURE.md` / `UI_GUIDE.md` / `PAGE_GUIDE.md`

**验收**：`cargo test` 有真实用例；harness 能对一个已知函数产出「一致 / 不一致」的结论。

### 后续：样式统一三小批（2026-10-31）— **✅ 已完成**

审查后按「先修真错的、再合并重复的、最后清文档」拆成三批，各自独立提交、独立验证。
每条都用 Edge headless + CDP 实测过，不是「构建通过就算」。

21. ✅ 印面令牌成对化：`--seal` / `--seal-edge` / `--on-seal`，9 处控件迁移（§2.4-1）
22. ✅ 选中态取消假粗：删 `-webkit-text-stroke: 0.25px` 与 `font-weight: 600`；
    `LedgerSection` 的 scoped `h2` 曾顶掉全局 400，是当时唯一的真加粗（§2.4-9）
23. ✅ 凹槽五份归一为 `.well` / `.well.upright`（§2.4-11）；
    竖槽那两行在用 `--ink` 当暗面，暗色下把凹槽翻成了提亮带，一并改正
24. ✅ 承载面归一为 `.pill-group`（分段胶囊与演示页共用）
25. ✅ 四个单选组统一 `useRovingFocus`（§2.4-10）；侧栏 `tablist` → `<nav>` + `aria-current`；
    删零引用且语义冲突的 `BevelPill` 组件
26. ✅ 色板 / 字号阶梯改运行时读令牌，不再手抄第二份（§2.4-13）
27. ✅ 页头高度收成 `--page-head-h`，左栏牌记与它同源——此前两处各抄一份算式（§2.3-5）
28. ✅ 死码清零：`.ledger-lines`、`.text-button`、`SealMark` 的 `size` prop（全站无人传，
    其兜底规则被 inline style 永久压过）、页头空转的 `position: sticky` + `z-index`
29. ✅ 文档按实测校准：README 的最小高度与 `.cargo` 路径、AGENTS 的 check 命令、本文件 §0

### 第 4 小批：简洁化（2026-10-31）— **✅ 已完成**

承接上三批。判据只有一句：**同一件事有几份写法**。行数不是目标，概念数才是。

30. ✅ 印面五份归一为 `.stamp`（§2.4-11）。此前受光参数是 46/46/46/32/15% 五套、
    朱色投影四种模糊，且 `.cost-thumb` 是唯一用 `--ink` 投白光的。现在五处 computed
    的 `background-image` 与 `box-shadow` 逐字符相同（实测比对的字符串完全一致）。
    选中胶囊从「`well` + 覆写四件套」改成「摘 `well`、挂 `stamp`」——槽与印不共存。
31. ✅ 图标尺寸改 `--icon-size`，删 `AppIcon` 的 `size` prop（§2.4-15）。7 处传参消失；
    实测「较大」档下标题栏 13 → 14.30、紧凑按钮 12 → 13.19、槽按钮 16 → 17.59，
    此前这些数字一个都不动。
32. ✅ 轨道里的一格归一为 `.track-opt`（§2.4-16）。`cost-opt` / `size-opt` 曾逐行相同。
33. ✅ `cells` ref 与 `indexOf` 收进 `useRovingFocus`：四个控件不再各写一份
    `ref<HTMLButtonElement[]>([])` 与 `Math.max(0, findIndex(...))`。
34. ✅ 注释瘦身与文档对齐：`AppRail` 的注释从 122 行压到 86 行（历史叙事进本文件），
    `base.css` 头注释里已删除的 `.ledger-lines` 去掉；栏宽 34 从两处收成 `--rail-slot-w`；
    删 `icons.ts` 的 `rail-collapse` / `rail-expand`（折叠功能早已不存在，
    演示页却还在演示「收起侧栏」）。

**验收结果**（2026-10-31 实测）：

- `npm run check` 全绿；`npm run build` 通过
- 色板 28 枚颜色令牌（此前手写 13 枚，`--seal` 组从未出现过），顺序等于 `tokens.css` 声明顺序
- 字号阶梯 8 档默认值 `10/11/12/13.5/14.5/17/22/29`，切「较大」后 `11/12.1/13.2/14.9/16/18.7/24.2/31.9`
- `.page-head` 与 `.rail-brand` 高度、底边 y 完全相等（较大档 47.83 / 87.42，两栏零差）
- 三档滑块末档 `dLeft` / `dRight` 均为 0；9 个 radiogroup 每组恰好一个 `tabindex=0`
- 五处印面 computed `background-image` / `box-shadow` 逐字符相同；暗色下胶囊与竖槽拇指
  同底色 `#b85b49`、同阴影，`--on-seal` 落在 `#ece3cd`
- 槽按钮悬停时 `.slot-stamp` 的 `opacity` 由 0 → 1、`transform` 回到 `matrix(1,0,0,1,0,0)`

### 第 5 小批：版式收边（2026-10-31）— **✅ 已完成**

三条反馈：页面四边留白偏大、卡片标题旁的朱印不喜欢、组件齐了之后「控件」卡冗余。

1. ✅ `.page-content` 的 16/20/26 收成 12/16/18，`.page-head` 左右同步 20 → 16。
   左右必须同值：页头与内容区各写各的，第一张卡的文武线就会比标题左缘缩进一截
   （实测现在两侧同为 `x = 66`）。
2. ✅ 标题前缀从朱印换成 `.section-mark`：4×18 的凸起短竖条，左沿受光、右沿落暗、
   下方一线落地影，三个面全走 `--bevel-*`，与 `.well` / `.stamp` 同一光向；宽度乘 `--fs-scale`。
   区块不再各编一个字，`LedgerSection` 的 `seal` prop 一并删掉（7 处调用同步去掉）。
   理由是八枚歪 2.5° 的红方框会把块与块之间压闷，而「印章」在账本语境里该留给
   「已入账 / 已达成」这类状态（§2.4-17）。
3. ✅ 删「控件」卡（`ControlsSection.vue`）、`SealMark.vue`、`.seal` / `.seal.solid`、
   `--seal-size`、`.kit-row.checks` / `.kit-row.seals`；样张 12 处 `.seal` 同步换 `.section-mark`。
   朱红三处随之改为「区块标 / 当前选中 / 支出」。

**验收结果**（2026-10-31 实测）：7 张卡、7 枚 mark；「较大」档 mark 为 4.4 × 19.8；
浅色与深色下左沿皆受光、右沿皆落暗（深色 `rgba(255,255,255,.18)` / `rgba(0,0,0,.55)`）；
样张 12 枚全部继承同一份样式；`npm run check` 全绿，控制台零报错。

### 第 6 小批：删「结构」卡（2026-10-31）— **✅ 已完成**

1. ✅ 删 `views/settings/StructureSection.vue`（108 行，其中 58 行是 scoped 样式）。它演示
   文武线与账线，而这两件的**实例就是每张卡自己的 `.frame`**——拿一张卡去讲「卡是怎么做的」，
   属于同一件事的第二份演示。
2. ✅ `SettingsView` 收到 6 个 section；`README`（设置页一行、目录一行）、`AGENTS.md` 的 CSP 判据、
   §0-F 与 §3 第二批第 9 条的 section 数量同步为 6。

**验收结果**（2026-10-31 实测）：6 张卡、6 枚 mark，标题顺序 外观 / 原子组件 / 色板 / 字号阶梯 /
图标 / 关于；`.ledger-demo` / `.ledger-line` 等类零残留；控制台零报错。

`.num` / `.error` / `.positive` 三个文本类现在都没有调用方（结构卡是 `.num` 的唯一调用方），
但它们是**文本级词汇**：等宽数字、错误红、收入绿，业务页的金额列与提示语必然要用。
判死码看「有没有第二种写法」，不看「今天有几个调用方」——这三条各自只有一份定义，别跟着删。

### 第 7 小批：设置页只留用户要用的（2026-10-31）— **✅ 已完成**

反馈：「设置里我们开发中用到的帮我隐藏起来，留下给用户用的就可以。我们连点三下左上 logo
可以进入我们的开发帮助页面，可以看组件之类的」。

1. ✅ 四张开发卡搬进 `views/dev/`（原子组件 / 色板 / 字号阶梯 / 图标），设置页只剩外观 / 关于。
   判据是读者：用户来设置页只为换纸换字号，组件与令牌清单是给写界面的人查的。
2. ✅ 新页面 `DevKitView`（`#/dev`，路由名 `dev-kit`，`meta.hidden`），单独挂在 `router.ts`，
   不进 `NAV_ITEMS`；入口是三连击牌记，用原生 `event.detail === 3`，不自己攒时间戳。
   牌记仍 `aria-hidden` 且不可聚焦——它不是按钮，不给「这里能点」的暗示。
3. ✅ `THEME_OPTIONS` 从 `settings/shared.ts` 挪进 `use-theme.ts`（两张卡现在分居两处，
   选项本来就和 `ThemeMode` 是一件事）；令牌读取函数随卡片搬到 `views/dev/tokens.ts`。
4. ✅ `.stack`（一叠卡的 14px 间距 + 1240 上限）从两个视图的 scoped 样式提到 `blocks.css`。
5. ✅ `VerticalSlider` 补「无选中」：`modelValue` 不在选项里时朱印淡出（`hasActive`）。
6. ✅ 外观卡里的机制说明（`color-scheme` / `--fs-scale`）搬进开发页的「入口与约定」卡。

**验收结果**（CDP 实测）：设置页 2 卡、开发页 5 卡；三连击进 `#/dev`、双击不误触、
点左栏「设置」回得去；开发页 `aria-current` 为 `null`、朱印 `opacity: 0`、Tab 停靠点仍 1 个；
1024×780 无横向溢出（964 = 964），浅色 / 深色都过；控制台零报错。

### 第 8 小批：设置页两张卡并排（2026-10-31）— **✅ 已完成**

反馈：「设置里的卡片 如果宽度够 可以 一行两个」。

1. ✅ `.stack` 加修饰类 `.stack-pair`（`auto-fit` + `minmax(420px, 1fr)`），只挂在 `SettingsView`
   这一处（§2.4-20）。不写媒体查询：断点由卡片内容宽度自己算，窗口窄了退回一列。
2. ✅ 高度用 grid 默认的 `stretch`：两张卡的文武线在同一底线收口，短的那张（外观）下方留白。
   单列时这个行为天然消失，不需要第二套规则。

**验收结果**（CDP 实测）：1280 → 两列 587×2、卡高 192、内容区 `scrollH = clientH = 739`
（并排后整页一屏到头，不再滚）；1024「较大」→ 两列 456.5、三段滑块仍 157 宽、「全站文字一起缩放」
不掉行；960 → 两列 427；800 → 单列 708（两卡各自 136 / 192 高，即未并排时的原样）。
五种情形 `.stack` 的 `scrollWidth === clientWidth`（无横向溢出），浅色 / 深色皆过，控制台零报错；
`npm run check` 与 `npm run build` 全绿。

### 第 9 小批：左栏朱印改成「滑到点击处」（2026-10-31）— **✅ 已完成**

反馈：「左侧菜单栏 我点击切换的时候 红色块 想要一个 滑动到点击位置的动画」。

1. ✅ `VerticalSlider` 的选值时机拆成两条（§2.4-21）：点击在 `pointerup` 选值——此时过渡还开着，
   朱印从原位滑过去；指针越过 `DRAG_THRESHOLD = 4` 才认作拖动，此后 `transition: none` 跟手。
   原先两件事挤在 `pointerdown` 里，点击恰好发生在过渡被关掉的那一刻，所以是「闪」过去的。
2. ✅ `pointercancel` 单独一个处理函数：系统手势、指针丢失不选值——那一下不是用户在点。

**验收结果**（CDP 实测）：点第 7 格（总览 → 目标，6 格 / 402px）后 `getAnimations()` 里有
`CSSTransition`（`transform` / 300ms / running），rAF 采样 52 帧得 **36 个不同位移**：
0ms 469 → 40ms 439.78 → 90ms 415.67 → 150ms 402.55 → 300ms 402（末段 1.6px 回弹是
`--ease-snap` 的超调）。把过渡 `pause()` 在 40ms 截图，朱印确实压着「目标」「设置」两格。
拖动时 `transitionDuration = 0s`、位移逐段跟随（402 → 335 → 268），松手后恢复 `0.3s`；
键盘 End 同样走 300ms 过渡。`npm run check` 与 `npm run build` 全绿，控制台零报错。

---

## 4. 明确不做的事

写下来是为了不再每次重新讨论。

| 事项                    | 决定     | 理由                                                                                                                      |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| husky / lint-staged     | 不装     | 沙箱对带管道的子进程不稳定，钩子易误报。校验放 `npm run check`                                                            |
| 组件单测全覆盖          | 不做     | 组件是视觉件，靠 CDP 截图 + 断言几何来验（已在用）；单测只覆盖纯逻辑与 composable                                         |
| CSS 框架（Tailwind 等） | 不引入   | 账簿语言是手写令牌体系，引入框架会带来第二套命名与优先级                                                                  |
| 状态管理库（现在）      | 暂不引入 | 4 个状态用 composable 够了。**触发条件**：出现「跨三个以上组件的共享业务状态」时再上 Pinia，并把这个决定写进 ARCHITECTURE |
| 大改现有命名            | 不做     | 改名冲掉 git blame，收益低于成本。用「新代码守新规」的方式渐进收敛                                                        |
| 全量令牌化间距          | 不做     | 现有裸值数量多、收益低。新代码遵守，旧代码遇到再换                                                                        |
| CHANGELOG               | 不维护   | 改动原因写在提交正文里，再养一份必然漂移（沿用旧仓判断）                                                                  |

---

## 5. 一句话总结

**设计语言已经成立，工程护栏还没建。**

视觉与组件的那部分（令牌、四件套、控件契约、注释质量）是这个仓最值钱的东西，
规范的作用是把它固化下来别再退回去；工程的那部分（lint / test / CI / 文档）是从零开始，
而且必须在领域层动工之前完成——那 6000 行逻辑是唯一没有安全网的部分。
