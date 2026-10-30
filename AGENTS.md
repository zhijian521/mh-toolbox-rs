# 本仓库协作约定（开工前先读）

> 这些不是建议，是本机实测过的现象与对应的固定做法。**不要重新发现。**
> 工程规范见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)，本文只讲「这台机器上怎么干活」。

## 一、一条命令验证

```bash
npm run check     # format:check + lint + typecheck，人跑的和 CI 跑的是同一条
```

Rust 侧需要单独跑（要先设 MSVC 环境，见 §三）：

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

`npm run build` 里已经包含 `vue-tsc --noEmit`，打包前不必再单独 typecheck。

## 二、沙箱与工具限制

| 现象                                               | 事实                                                               | 正确做法                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| PowerShell `Get-Content` 读中文源码乱码            | 5.1 按 GBK 解码无 BOM 的 UTF-8                                     | **读文件一律用 read 工具**，搜内容用 grep 工具，不要用 `Get-Content`/`Select-String`                     |
| `git commit -m "…"` 被安全策略拒绝                 | 消息里出现「用 shell 调 cmd / start」这类字样时被判为绕过命令校验  | 用 `git commit -F <消息文件>`，文件放 `.runtime/`（已 gitignore），提交后删                              |
| `git checkout` / `git add` 报 `index.lock` 存在    | 并行的 git 进程（编辑器集成、AI 会话）会留下锁文件                 | 确认无活跃 git 进程后 `rm -f .git/index.lock` 再重试，**不要**删整个 `.git`                              |
| `rm -rf` 报权限错误                                | 沙箱对递归删除有额外限制                                           | 不要绕过。逐个文件 `rm`，或用 PowerShell `Remove-Item -Recurse -Force -Confirm:$false`（会触发升级授权） |
| `Rename-Item` / `Remove-Item` 对刚建的文件报 EPERM | 子进程写不了由 write 工具刚创建的文件                              | 不要重试同一种写法。留给人工或换一次会话处理                                                             |
| `npx <工具> --write <新文件>` 可能 EPERM           | 同上                                                               | 先 `--check` 定位，再用 edit 工具按格式手改；或对所有文件统一跑一次                                      |
| 后台任务被回收后 vite 的 node 子进程残留           | 占用 5173，下次 `npm run desktop` 报 `beforeDevCommand terminated` | `netstat -ano \| grep ":5173.*LISTENING"` 找 PID → `taskkill //F //PID <pid>`                            |

## 三、Windows 上编译必须先设环境（本机实测）

`vcvars64.bat` 依赖 `reg.exe`，而它在沙箱黑名单里，LIB 补不全 → 链接报
`LNK1181: 无法打开 kernel32.lib`。另外 Git Bash 自带的 `usr/bin/link.exe` 是 Unix 的
`link` 命令，会抢在 MSVC 前面被调用。

```bash
MSVC="C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDK="C:/Program Files (x86)/Windows Kits/10"; SDKVER=10.0.26100.0
export LIB="$MSVC/lib/x64;$SDK/Lib/$SDKVER/um/x64;$SDK/Lib/$SDKVER/ucrt/x64"
export PATH="/c/Users/pc/.cargo/bin:$MSVC/bin/Hostx64/x64:$PATH"
export CARGO_BUILD_JOBS=4
```

- **`~/.cargo/bin` 不在默认 PATH 里**，必须显式加，否则 `cargo` 命令不存在。
- **并行度压到 4**：本机 rustc 高并发时崩过 `STATUS_ACCESS_VIOLATION`（0xc0000005）。
  这是编译器进程崩，不是代码错。`Cargo.toml` 的 `[profile.dev] debug = 0` 也是为此。
- 日常不用手敲这些——根目录 `start.bat` 全封装了（含端口与实例预检）。

## 四、启动与窗口

```bat
start.bat            普通启动
start.bat debug      启动并开 CDP 9222
start.bat --check    只做环境自检
start.bat --force    遇到占用直接处理，不询问
```

- **`start.bat` 必须存成 GBK(936) + CRLF。** 存 UTF-8 时 cmd 按双字节切行，中文注释被拆成
  命令，报一串「xxx 不是内部或外部命令」，且报错行号与真实问题完全无关。
  `.gitattributes` 与 `.editorconfig` 已声明 `*.bat` 为 CRLF 双保险。
- **启动失败的头号原因是 5173 被占**，而 tauri 只会说
  `Error The "beforeDevCommand" terminated with a non-zero status code.`——一个字不提端口。
- **WebView2 `HRESULT(0x8007139F)`「组或资源状态不正确」**：上一次实例留下的
  `msedgewebview2.exe --type=crashpad-handler`（`--user-data-dir=…\com.zhijian.mhtoolbox.rs\EBWebView`）
  还占着用户数据目录。杀掉那个 crashpad 即可。**不要**动 SearchHost 的 webview2，那是系统搜索。

## 五、验证方式

| 要验什么              | 怎么做                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 代码质量              | `npm run check`                                                                                                         |
| 界面观感              | `npm run build` → `python -m http.server 5199 --directory dist` → Edge headless 开 `--remote-debugging-port` → CDP 截图 |
| IPC / 外链 / 窗口操作 | **必须回 Tauri 真窗口**。`MH_CDP_PORT=9223 npm run desktop`，连 `http://127.0.0.1:9223/json/list`                       |
| 悬停、按下等伪类      | CDP 的 `Input.dispatchMouseEvent` 真移动鼠标。**js 派发事件不会激活 `:hover`**，拿那个截图是自欺                        |
| 几何是否对齐          | 读 `getBoundingClientRect()` 断言，不要靠眼看截图                                                                       |

三条截图经验（都踩过）：

1. **Chrome headless 在本机静默失败**（进程起来、图不落地）。用 **Edge**：
    ```
    msedge --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-proxy-server \
      --remote-debugging-port=9333 --force-device-scale-factor=2 --window-size=1360,880 <url>
    ```
    `--force-device-scale-factor=2` 才能看到真实像素级的质感。
2. **`dist` 重建后已打开的页面还指着旧 hash 文件**，样式改了却看不出变化 → 截图前先
   `location.reload()` 并等 2.5 秒。
3. **指针残留会让上一枚按钮保持 `:hover`**。截「常态」时也要先把指针移到空白处再等 200ms。

`curl` 在本机默认走 FlClash 代理，连 127.0.0.1 会被代理吞掉 → **一律加 `--noproxy '*'`**。

## 六、红线（改代码前必须知道）

1. **数据目录固定 `%APPDATA%\mh-tool-v2`**（`src-tauri/src/lib.rs` 的 `data_dir()`），与旧版共用。
   Tauri 默认写到 `%APPDATA%\<identifier>`，必须显式指回，否则朋友升级后数据「消失」。
2. **identifier `com.zhijian.mhtoolbox.rs` 不能改**，且必须与旧版 appId 不同，否则 Windows
   会把两个安装包当成同一个应用互相覆盖。
3. **渲染层只有 `src/services/` 能碰系统**。ESLint 已拦 `@tauri-apps/api/core` 出现在
   `components/`、`views/`、`composables/` 里。
4. **令牌只有一份真源**：`src/styles/tokens.css`。`design/tokens.css` 是设计稿副本，
   要改就两边都改——或者（更好）别改副本，以 `src/` 为准。
5. **卸载不删数据**（`deleteAppDataOnUninstall` 保持 false）。
6. 数据层落地后必须做 **SQLite → JSON 反向镜像**，否则一旦转换就退不回旧版。

## 七、明确不做的事

写下来是为了不再每次重新讨论。

| 事项                | 决定     | 理由                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| husky / lint-staged | 不装     | 沙箱对带管道的子进程不稳定，钩子容易误报。校验放 `npm run check`                                                                     |
| ESLint 风格规则     | 不开     | 风格一律 Prettier。`eslint-plugin-vue` 用 `flat/essential` 而不是 `flat/recommended`——后者带 584 条格式化告警，与 4 空格缩进直接冲突 |
| 组件单测全覆盖      | 不做     | 组件靠 CDP 截图 + 几何断言验；单测只覆盖纯逻辑与 composable                                                                          |
| CSS 框架            | 不引入   | 账簿语言是手写令牌体系，引入框架会带来第二套命名与优先级                                                                             |
| 状态管理库（现在）  | 暂不引入 | 四个状态用 composable 够。**触发条件**：出现跨三个以上组件的共享业务状态时再上 Pinia，并把决定写进 `docs/ARCHITECTURE.md`            |
| 大改现有命名        | 不做     | 改名冲掉 git blame。用「新代码守新规」渐进收敛                                                                                       |
| 全量令牌化间距      | 不做     | 现有裸值多、收益低。新代码遵守，旧代码遇到再换                                                                                       |
| CHANGELOG           | 不维护   | 改动原因写在提交正文，再养一份必然漂移                                                                                               |
