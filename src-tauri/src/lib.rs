use serde::Serialize;

// 截屏与 OCR 全是对 Win32 / WinRT 的直接调用，非 Windows 平台没有替身实现。
// 整个模块按 cfg 门控，而不是在函数体内散落 `#[cfg]`——那样编译错误会指向
// 「这一段为什么没被编」而不是「这个平台不支持」。
#[cfg(windows)]
mod ghost;
#[cfg(windows)]
mod ocr;
#[cfg(windows)]
mod ocr_paddle;
#[cfg(windows)]
mod screen;

/// 前端「关于」要的那点信息。
///
/// 现在只有一个命令，但它立住了两件事：① IPC 走 `invoke` + serde 结构体，
/// 以后加 `tauri-specta` 就能从 Rust 类型直接生成 TS，不用再手抄契约；
/// ② 数据目录从第一天就指向 `%APPDATA%\mh-tool-v2`，不跟随 identifier 漂移。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    product_name: String,
    version: String,
    identifier: String,
    data_dir: String,
    webview: String,
}

/// 数据目录必须与旧版 Electron 指向同一个目录，否则朋友升级后数据「消失」。
/// 旧版见 `mh-tool/src/main/profile.cjs:5`：`path.join(app.getPath('appData'), 'mh-tool-v2')`。
fn data_dir_path() -> Option<std::path::PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(|base| std::path::PathBuf::from(base).join("mh-tool-v2"))
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
/// `overflow: hidden`），高度由字体三档缩放决定。实测（页面内探针把视口钉在
/// 候选高度上，读 `rail.scrollHeight > rail.clientHeight`，三档字号各一次）：
///
/// | 字号档 | `--fs-scale` | 侧栏需要 | 加标题栏后 |
/// | --- | --- | --- | --- |
/// | 较小 | 0.92 | 622.8 | 655.9 |
/// | 默认 | 1 | 673.3 | 709.3 |
/// | 较大 | 1.1 | **736.2** | **775.8** |
///
/// 取 **780**：比「较大」档的需求多 4.2px，够吃掉设备像素取整。实测 776 仍不滚、
/// 772 就开始裁底栏，所以 780 已经是硬下限；再调高就是白占屏幕。默认窗口给到 820
/// （不能小于最小高度，否则打开就被钳到这里）。
///
/// 想再往下压只能动侧栏自己：格高（`VerticalSlider` 的 `--vs-cell`，62 是
/// 「图标 + 两字竖排」的下限）、牌记高度（与 `PageHeader` 等值，见 `docs/CONVENTIONS.md`）
/// 或底栏那两枚 30px 按钮。
const MIN_HEIGHT: f64 = 780.0;

fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let mut builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("梦幻养老助手")
            .inner_size(1280.0, 820.0)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 命令表按平台分两份而不是用 `#[cfg]` 逐个包：`generate_handler!` 里出现
    // 一个未定义的符号就整表编不过，条件编译写在宏里反而看不出是哪一条。
    #[cfg(windows)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_info,
        open_external,
        ghost::ghost_windows,
        ghost::ghost_probe
    ]);
    #[cfg(not(windows))]
    let builder = builder.invoke_handler(tauri::generate_handler![app_info, open_external]);

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
