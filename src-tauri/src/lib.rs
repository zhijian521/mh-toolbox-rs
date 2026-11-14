use serde::Serialize;

// 截屏与 OCR 全是对 Win32 / WinRT 的直接调用，非 Windows 平台没有替身实现。
// 整个模块按 cfg 门控，而不是在函数体内散落 `#[cfg]`——那样编译错误会指向
// 「这一段为什么没被编」而不是「这个平台不支持」。
#[cfg(windows)]
mod ghost;
#[cfg(windows)]
mod ocr;
/* 截图识别：把一张图（剪贴板粘的、文件选的）送进 OCR。与 `ghost` 一样只认 Win32 那一套
 * 模型与引擎，所以一并门控——非 Windows 平台没有替身实现。 */
#[cfg(windows)]
mod ocr_image;
#[cfg(windows)]
mod ocr_paddle;
#[cfg(windows)]
mod screen;
/* 数据层不分平台：SQLite 在哪儿都能跑，不像截屏 / OCR 只认 Win32。 */
mod store;
/* 数据的备份信封与三个命令（导出 / 导入 / 清除）。同样不分平台：读写文件、
 * 序列化、SQLite 都不认 Win32，唯一带平台味的对话框整个交给 `tauri-plugin-dialog`。
 * 所以这里没有 `#[cfg(windows)]`——别因为相邻几行都有就顺手加上。 */
mod backup;

/// 前端「关于」要的那点信息。
///
/// 现在只有一个命令，但它立住了两件事：① IPC 走 `invoke` + serde 结构体，
/// 以后加 `tauri-specta` 就能从 Rust 类型直接生成 TS，不用再手抄契约；
/// ② 数据目录从第一天就固定成 `%APPDATA%\mh-tool-rs`，不跟随 identifier 漂移。
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    product_name: String,
    version: String,
    identifier: String,
    data_dir: String,
    webview: String,
    /// 这是不是 debug 构建。
    ///
    /// 前端拿它只用一处：真窗口测试要知道「能不能用调试端口与测试钩子」。发布版里
    /// 这两样都不存在，测试遇到它应当**明确跳过**，而不是去点「导出」——那一按会弹出
    /// 系统对话框，把整轮测试挂在模态窗前面等人。
    debug: bool,
}

/// 数据目录：`%APPDATA%\mh-tool-rs`。全仓唯一真源。
///
/// `pub(crate)` 而不是私有：`store.rs` 是这条红线的**另一个出口**——它以前自己调
/// `app_data_dir()`，库于是落进了 `%APPDATA%\com.zhijian.mhtoolbox.rs`。数据目录只能有
/// 一个真源，别的模块要用就来这里取，不要各自再算一遍。
///
/// 2026-11-04 换成 `mh-tool-rs`：早先与旧版 Electron 共用 `mh-tool-v2`，两代应用的
/// `data.json` / `.bak` / `logs` 与本应用的 `mh-toolbox.db` / `backups/` 混在一处，
/// 谁都不知道哪些文件是自己的。
///
/// 新目录从空库开始，不自动扫描或搬迁旧目录。旧版数据仅由设置页手动选择后单向转换导入。
const DATA_DIR_NAME: &str = "mh-tool-rs";

/// `APPDATA` 下的子目录。
///
/// `.filter(|v| !v.is_empty())` 不是多余的：`std::env::var` 在变量**被设成空串**时返回
/// `Ok("")`（不是 `Err`），于是 `PathBuf::from("").join("mh-tool-rs")` 是一个**相对路径**，
/// 库会落到当前工作目录——装到 `Program Files` 时那里只读，用户看到的是「数据存不下来」。
fn appdata_sub(name: &str) -> Option<std::path::PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .filter(|base| !base.is_empty())
        .map(|base| std::path::PathBuf::from(base).join(name))
}

pub(crate) fn data_dir_path() -> Option<std::path::PathBuf> {
    appdata_sub(DATA_DIR_NAME)
}

/// 同一件事的两个出口：前端「关于」要的是字符串，`report_fatal` 要的是路径。
fn data_dir() -> String {
    data_dir_path()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "未知".to_string())
}

/// 启动失败的最后一站：先写日志文件，再弹一个原生对话框。
///
/// 为什么不能只 `expect`：发布版 `main.rs` 是 `windows_subsystem = "windows"`，
/// 没有控制台，`expect` 写进 stderr 的那行字**没有任何人会看到**——用户看到的
/// 只是窗口闪一下就没了，连「是坏了」都判断不了。WebView2 运行时缺失、建窗
/// 失败这两类机器环境问题都走这条路，而它们恰恰是新机器上最常见的失败。
///
/// 日志落在数据目录而不是 exe 旁边：装到 `Program Files` 时那里只读。
fn report_fatal(message: &str) {
    // `APPDATA` 缺失（服务账户、极端精简环境）时退到临时目录，否则日志会
    // 落到当前工作目录，那时谁也不知道该去哪里找。
    let dir = data_dir_path().unwrap_or_else(std::env::temp_dir);
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("startup-error.log");
    // 连日志都写不进去也不能再抛：这是最后一条兜底路径，它自己崩掉就彻底没信息了。
    let _ = std::fs::write(&path, format!("{message}\n"));
    eprintln!("启动失败：{message}");

    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

        let wide =
            |text: &str| -> Vec<u16> { text.encode_utf16().chain(std::iter::once(0)).collect() };
        let body = wide(&format!(
            "梦幻养老助手没能启动。\n\n{message}\n\n详细信息已写入：\n{}",
            path.display()
        ));
        let title = wide("启动失败");
        // SAFETY: 两个串都以 0 结尾且活到调用返回之后；`None` 表示无父窗口。
        unsafe {
            MessageBoxW(
                None,
                PCWSTR(body.as_ptr()),
                PCWSTR(title.as_ptr()),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}

#[tauri::command]
#[specta::specta]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let config = app.config();
    AppInfo {
        product_name: config
            .product_name
            .clone()
            .unwrap_or_else(|| "梦幻养老助手".to_string()),
        version: app.package_info().version.to_string(),
        identifier: config.identifier.clone(),
        data_dir: data_dir(),
        webview: tauri::webview_version().unwrap_or_else(|_| "未知".to_string()),
        debug: cfg!(debug_assertions),
    }
}

/// 用系统默认浏览器打开一个外部链接。
///
/// 不走 `cmd /C start`：URL 里一旦带 `&`，会被 shell 当成命令分隔符截断，
/// 剪掉后面的查询参数。`rundll32 url.dll,FileProtocolHandler` 是把链接当**参数**
/// 递过去，不经过 shell，也就没有转义问题。
///
/// 只放行 http(s)：否则前端一旦被注入，就能把 `file:` / `ms-settings:` 这类
/// 协议递给系统，那是任意本地程序调用的口子。
#[tauri::command]
#[specta::specta]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 http(s) 链接".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|error| format!("打不开链接：{error}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台未实现外部链接打开".to_string())
    }
}

/// 发一条系统通知（Windows 上是右下角的 Toast）。
///
/// 与 `open_external` 同一条边界：页面经 `services/desktop.ts` 的 `notifySystem()`
/// 说话。**没有用 `tauri-plugin-notification`**，理由见 `Cargo.toml` 那一段：它把
/// Windows 的 AUMID 钉死在 `tauri.conf.json` 的 identifier 上，而没安装过的进程没有
/// 那个 id，`show()` 返回成功、屏幕上什么都不出来。这里用它的底层 crate，自己挑 id。
///
/// ---- 为什么标题与正文都由前端给 ----
///
/// 「签到 07:30 还有一分钟」这句话的主语是那一条闹钟，只有调用方知道。Rust 这边不拼文案：
/// 它一拼，同一个句子就有了两个出处，改一种说法要改两处。
///
/// 两端都截断：Windows Toast 的标题超过约 64 字、正文超过约 256 字会被系统自己裁，
/// 裁在半个字上比我们主动截难看。这里按**字符**截而不是字节，中文才不会被切坏。
#[tauri::command]
#[specta::specta]
fn notify_alarm(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    let cut = |text: &str, limit: usize| -> String { text.chars().take(limit).collect::<String>() };

    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Duration, Toast};

        /* Windows 的 Toast 必须挂在一个**已注册的应用标识**（AUMID）下：打包版由安装
         * 程序在开始菜单建快捷方式，系统才认得 `identifier`；`cargo run` / `tauri dev`
         * 出来的进程一个 id 都没注册过，于是发送「成功」而屏幕空白——那一步最容易读成
         * 「代码没通」。所以开发时借系统里那枚现成的 id（标题栏会写成 PowerShell 的
         * 名字），发布版用自己的。 */
        #[cfg(debug_assertions)]
        let app_id = {
            /* 开发模式不读 `app`，但参数必须留在签名里：specta 靠它标记「这是注入的
             * 句柄」，删掉之后前端调用会少一个参数。这一行只为消掉未使用警告。 */
            let _ = &app;
            Toast::POWERSHELL_APP_ID.to_string()
        };
        #[cfg(not(debug_assertions))]
        let app_id = app.config().identifier.clone();

        Toast::new(&app_id)
            .title(&cut(title.trim(), 60))
            .text1(&cut(body.trim(), 200))
            .duration(Duration::Short)
            .show()
            .map_err(|error| format!("发不了系统通知：{error}"))
    }

    #[cfg(not(windows))]
    {
        let _ = (app, title, body);
        Err("当前平台还没有系统通知".to_string())
    }
}

/// WebView2 自带的默认开关。自己设 `additional_browser_args` 会**整串覆盖**它，
/// 所以拼调试端口时必须把这一段原样带上，否则右键菜单、PDF 壳这些行为会跟着变。
///
/// 只在 debug 构建用到：发布版不传参数，留着会报 dead_code。
#[cfg(debug_assertions)]
const WEBVIEW_DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// 调试端口：只有 debug 构建读 `MH_CDP_PORT`，发布版一律不开。
///
/// 为什么不用环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`：Tauri 建 webview 时会
/// 显式传自己的 `additional_browser_args`，把那个环境变量整个盖掉（实测 9222 端口起不来）。
/// 只有在代码里建窗口才能把参数递进去——所以窗口从 `tauri.conf.json` 挪到了这里。
///
/// 反过来说，**没传参数时那个环境变量是生效的**：2026-11-01 定位白屏时，就是靠
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` 挂上
/// release 包的调试端口，才看到 webview 停在 `chrome-error://chromewebdata/`。
#[cfg(debug_assertions)]
fn debug_browser_args() -> Option<String> {
    let port = std::env::var("MH_CDP_PORT").ok()?;
    Some(format!(
        "{WEBVIEW_DEFAULT_ARGS} --remote-debugging-port={port}"
    ))
}

#[cfg(not(debug_assertions))]
fn debug_browser_args() -> Option<String> {
    None
}

/// 主窗口。
///
/// 尺寸原本与 `tauri.conf.json` 声明的一致（1280×820 / 居中），改成代码里建是为了
/// 挂调试参数；高度随侧栏牌记与格高调整过两轮，原因见下。
///
/// **最小高度是量出来的，不是估的。** 侧栏不滚动（`AppRail.vue` 的
/// `overflow: hidden`），高度由字体三档缩放决定，且**每一次改侧栏的纵向尺寸都要回来复量**。
///
/// 2026-11-06 那一轮把侧栏纵向加了这几笔（槽 34 → 48、槽内衬上下 2 → 4、底栏间距 8 → 6、
/// 牌记从「按页头 45.3」改成 48 的方印），随后又要求**牌记四边留白同值**——方块是方的、
/// 到左右栏边的距离本来就是栏内衬 12，要上下也留 12，牌记区就只能等于栏宽 72（56 → 72）。
/// 实测（探针把视口钉在 690 上，读 `rail.scrollHeight`，各档字号一次）：
///
/// | 字号档 | `--fs-scale` | 侧栏需要 | 加 40 标题栏 |
/// | --- | --- | --- | --- |
/// | 较小 | 0.92 | 657 以内（装得下） | 697 |
/// | 默认 | 1 | 698 | 738 |
/// | 较大 | 1.1 | **765** | **805** |
///
/// **这个数现在是 848，不是 812。** 2026-11-06 同一天里改了两次，两次都是同一件事的
/// 副作用——菜单格的上下内边距（`VerticalSlider` 的 `--vs-pad`）：
///
/// 1. 先删掉栏底两枚 30px 按钮（切日夜、开仓库），让出 73（1.1 档 79）；
///    同时把格高从 62 加到 69（内边距 9），8 格吃掉 52 / 57。两笔相抵，余量从 7 涨到约 25
///    ——那一轮 812 还够，所以没动。
/// 2. 用户接着要求「默认和较大时候再大一点」，内边距 9 → **12**：格高 1 档 75、1.1 档 82.5，
///    8 格再吃 53。「较大」档的需求变成 839.7 + 40 的标题条，812 撑不住。
///
/// 于是抬到 **848**（较大档余 8.3），默认窗口跟着 820 → **860**。上面那张
/// 657 / 698 / 765 的表是**格高 62 那一版**的实测值，只能当历史看；这两轮的数是算出来的，
/// 不是探针量的——**下次动侧栏纵向尺寸时重新量一遍**，别在旧数上叠加减法。
///
/// 再往上加高度（格高、内衬、牌记）必须回来重新量。848 之后 1366×768 的屏早就放不下了，
/// 真要在小屏上用，只能缩栏宽（牌记区高度跟着栏宽走，见 `AppRail.vue` 里那条等式）
/// 或缩格高。默认窗口给到 **860**——必须大于最小高度，反过来一打开就被钳到这里。
///
/// 想往下压只能动侧栏自己：格高（`VerticalSlider` 的 `--vs-cell`，内边距 12 是用户看着
/// 定下的）、栏宽（牌记区 = 栏宽，缩栏宽同时缩牌记）。栏底那两枚 30px 按钮已经删了。
const MIN_HEIGHT: f64 = 848.0;

fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let mut builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("梦幻养老助手")
            .inner_size(1280.0, 860.0)
            .min_inner_size(1024.0, MIN_HEIGHT)
            .resizable(true)
            // 无边框：系统标题栏是一条蓝色栏 + 三个系统按钮，与纸面语言冲突。
            // 标题栏由前端的 TitleBar.vue 自绘，拖动靠 data-tauri-drag-region。
            .decorations(false)
            .center();

    if let Some(args) = debug_browser_args() {
        builder = builder.additional_browser_args(&args);
    }

    builder.build()?;
    Ok(())
}

/// 命令表：一次注册，同时喂给 Tauri 与 TS 绑定生成。
///
/// **为什么要按平台分两份**：`ghost::*` 整模块按 `cfg(windows)` 编掉了，非 Windows 上
/// `collect_commands!` 里出现一个未定义的符号就整表编不过。所以两份表看着重复，
/// 但重复的是「平台差异」这件事本身，不是手抄。
///
/// **加命令必须两份都加**。只在 Windows 那份里加，本机编得过、跑得起来，另一份静默
/// 少一条——非 Windows 平台上那条命令只表现为「前端调用时报 command not found」，
/// 而这个仓的开发机全是 Windows，那个缺口永远看不见。
///
/// `dangerously_cast_bigints_to_number`：i64（时间戳、窗口句柄）默认被 specta 拒收
/// （它怕 JS 精度丢失）。这里的所有 i64 都在 2^53 以内（毫秒时间戳 ~1.7e12、
/// 句柄是个 32/64 位指针值但只作标识），而 `serde_json::Value` 透传的字段里也会
/// 出现整数——不放开这一条，整个导出直接报错。
#[cfg(windows)]
fn command_table() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .dangerously_cast_bigints_to_number()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            app_info,
            open_external,
            notify_alarm,
            ghost::ghost_windows,
            ghost::ghost_probe,
            ocr_image::ocr_frame,
            backup::data_export,
            backup::data_import,
            backup::legacy_data_read,
            backup::legacy_data_import,
            backup::data_clear,
            backup::quick_prices_export,
            backup::quick_prices_import,
            store::prices_load,
            store::prices_save,
            store::characters_load,
            store::characters_save,
            store::income_load,
            store::income_save,
            store::account_load,
            store::account_save,
            store::goals_load,
            store::goals_save,
            store::online_load,
            store::online_save
        ])
}

/// 非 Windows：没有 `ghost` 那两条与截图识别（`ocr_frame`），其余同一份。
/// 这三条都依赖 Win32 / 本机 ONNX 模型，非 Windows 上没有替身实现。
#[cfg(not(windows))]
fn command_table() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .dangerously_cast_bigints_to_number()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            app_info,
            open_external,
            notify_alarm,
            backup::data_export,
            backup::data_import,
            backup::legacy_data_read,
            backup::legacy_data_import,
            backup::data_clear,
            backup::quick_prices_export,
            backup::quick_prices_import,
            store::prices_load,
            store::prices_save,
            store::characters_load,
            store::characters_save,
            store::income_load,
            store::income_save,
            store::account_load,
            store::account_save,
            store::goals_load,
            store::goals_save,
            store::online_load,
            store::online_save
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bindings = command_table();

    /* 只在 debug 里生成：发布版没有前端源码目录，也不该在用户的机器上写文件。
     * 路径相对 `src-tauri/`（cargo 的工作目录），落到前端唯一的调用入口旁边。
     * 生成时机是**每次启动**——改了命令却忘了重新生成，`npm run dev` 第一下就补回来。 */
    #[cfg(debug_assertions)]
    bindings
        .export(
            specta_typescript::Typescript::default(),
            "../src/services/bindings.ts",
        )
        .expect("生成 TS 绑定失败");

    // 仅生成契约时不创建窗口、不打开账本。
    #[cfg(debug_assertions)]
    if std::env::args().any(|arg| arg == "--export-bindings") {
        return;
    }

    /* 对话框插件在这里注册一次。**注册不等于给前端开口子**：它同时带来 JS 命令，
     * 而 `capabilities/default.json` 里没有任何 `dialog:` 权限，所以前端那侧调不动；
     * 本仓只用 Rust 侧的 `app.dialog()`（见 `backup.rs`）。
     *
     * 系统通知不走插件（见 `notify_alarm`），所以这里只有它一个。 */
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(bindings.invoke_handler());

    let started = builder
        .setup(|app| {
            // OCR 模型路径要在第一次识别前告诉引擎。放在 setup 而不是懒加载：
            // 模型目录随平台/打包方式变，越早定下来，出错时越早看到一条干净的错误。
            #[cfg(windows)]
            {
                use tauri::Manager;
                let resource = app.path().resource_dir().ok();
                ocr_paddle::set_models_dir(ocr_paddle::locate_models(resource.as_deref()));
                // 加载三个 ONNX 模型约 1 秒。放到后台线程：开局时用户正在点「开始识别」，
                // 那一刻卡住界面是最容易被当成「坏了」的地方。
                std::thread::spawn(|| {
                    if let Err(err) = ocr_paddle::warm_up() {
                        eprintln!("⚠ OCR 模型预热失败：{err}");
                    }
                });
            }
            /* 启动路径上**没有**任何库搬运：旧数据只经设置页手动导入（见 `DATA_DIR_NAME` 的注释），
             * 新目录从空库开始。这也顺手去掉了一整类并发坑——以前搬家要赶在建窗之前跑，
             * 否则 `loadPrices()` 与 `loadRoster()` 会同时看到「目标不存在」、同时往同一处复制。 */
            create_main_window(app)?;
            Ok(())
        })
        // 不用 `expect`：发布版没有控制台，`expect` 的输出去不了任何地方。
        // 见 `report_fatal` 的注释。
        .run(tauri::generate_context!());

    if let Err(error) = started {
        report_fatal(&format!("{error}"));
    }
}
