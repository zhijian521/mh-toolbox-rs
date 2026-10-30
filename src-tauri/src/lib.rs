use serde::Serialize;
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .setup(|app| {
            // 单实例：两个进程同时写同一份数据是唯一不能容忍的事故。
            // 先只创建主窗口（配置里已声明），后续再接单实例插件与主题联动。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("梦幻养老助手");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
