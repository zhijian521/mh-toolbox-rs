use serde::Serialize;

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
fn data_dir() -> String {
    match std::env::var("APPDATA") {
        Ok(base) => format!("{base}\\mh-tool-v2"),
        Err(_) => "未知".to_string(),
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

/// WebView2 自带的默认开关。自己设 `additional_browser_args` 会**整串覆盖**它，
/// 所以拼调试端口时必须把这一段原样带上，否则右键菜单、PDF 壳这些行为会跟着变。
const WEBVIEW_DEFAULT_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// 调试端口：只有 debug 构建读 `MH_CDP_PORT`，发布版一律不开。
///
/// 为什么不用环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`：Tauri 建 webview 时会
/// 显式传自己的 `additional_browser_args`，把那个环境变量整个盖掉（实测 9222 端口起不来）。
/// 只有在代码里建窗口才能把参数递进去——所以窗口从 `tauri.conf.json` 挪到了这里。
#[cfg(debug_assertions)]
fn debug_browser_args() -> Option<String> {
    let port = std::env::var("MH_CDP_PORT").ok()?;
    Some(format!("{WEBVIEW_DEFAULT_ARGS} --remote-debugging-port={port}"))
}

#[cfg(not(debug_assertions))]
fn debug_browser_args() -> Option<String> {
    None
}

/// 主窗口。
///
/// 尺寸与 `tauri.conf.json` 里原本声明的完全一致（1280×820 / 最小 1024×680 / 居中），
/// 只是改成代码里建：这样才能挂上调试参数。
fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("梦幻养老助手")
    .inner_size(1280.0, 820.0)
    .min_inner_size(1024.0, 680.0)
    .resizable(true)
    .center();

    if let Some(args) = debug_browser_args() {
        builder = builder.additional_browser_args(&args);
    }

    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .setup(|app| {
            create_main_window(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
