//! 账本备份：一份 JSON 信封 + 三个命令（导出 / 导入 / 清除）。
//!
//! ## 为什么单独一个文件，而不是接着写进 `store.rs`
//!
//! `store.rs` 管的是「表怎么建、怎么整份读写」，它的每个函数最后都落在一句 SQL 上；
//! 这里管的是**离开这台机器的那份东西**——文件名怎么起、信封长什么样、一份来路不明的
//! 文件凭什么被接受。两边的失败模式完全不同（一边是 SQL 错误，一边是用户手里可能有
//! 任何文件），混在一起之后「导入为什么拒绝了这份文件」会被 SQL 的噪音埋掉。
//!
//! ## 为什么是 JSON，而不是直接复制 `.db`
//!
//! 复制库文件能省掉整份代码，但三条都会咬人：
//! ① WAL 模式下最近几笔事务可能还在 `-wal` 里，只复制主库就丢它们
//!    （`store::migrate_between` 已经为这件事付过一次代价，见那边的注释）；
//! ② 库文件与表结构版本绑死，朋友那边版本一旦不同，最好的结果是「打不开」，
//!    最坏的结果是能打开、少几列；
//! ③ 这是一份给**人**的备份：JSON 能拿文本编辑器看一眼、能整段贴进聊天窗口求援，
//!    两百 KB 的 SQLite 二进制做不到这两件事。
//!
//! ## 为什么导入是「整体替换」而不是合并
//!
//! 合并要先回答「同一个 id 算谁的」：两份账本都记过同一个人，是按 `updated_at` 整条取新的，
//! 还是逐字段取较新的？这件事没有正确答案，猜错了就是**悄悄改掉用户的数**。
//! 整份替换的语义一句话说得清，且出事有自动备份兜底（见 `data_import`）。
//!
//! ## 为什么**不**兼容旧版 Electron 的 `data.json`
//!
//! 旧版那份是 `schemaVersion: 10`，角色结构与现在**完全不同**
//! （那边是 `progress.equipmentSets` / `growthHistory`，现在是 `skills` / `gear` / `pets`）。
//! 在同一个入口里「顺手也认一下」，等于让一个函数同时持有两代结构的知识：每个字段都要
//! 写一次「有就取、没有就猜」，而这些猜测无法验证——猜错的后果是把用户的角色导成半截。
//! 决定是**另一个入口**、一次性转换、做之前先看清两边的字段，那条路上出问题也只影响那一条路。
//! 所以这里连 `schemaVersion` 这个词都不出现：不认识的信封一律拒绝，不做降级解析。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
/* `Manager` 是为了 `app.get_webview_window("main")`：`.dialog()` 来自插件的 `DialogExt`，
 * 而按标识取窗口是 manager 的能力。 */
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::store::{self, PriceItem};

/// 信封格式版本。**改字段含义才 +1**，加一个可选字段不用动它。
///
/// 导入时严格比对：不认识的 `format` 一律拒绝，不做「尽力而为地读」。
/// 拒绝的代价是「少一次恢复」，猜错的代价是「把用户的账写成一堆缺字段的东西」。
const FORMAT: u32 = 1;

/// 信封里的应用标识。将来如果真出现第二份工具导出同名 JSON，这个字段是唯一的分辨依据。
const APP_TAG: &str = "mh-toolbox-rs";

/// 一份备份的完整内容。
///
/// 只有这五样：没有主题、没有字号、没有窗口位置。界面偏好存在 `localStorage`，
/// 换台机器本来就会不一样，把它们塞进「账本」会让这份文件读起来像应用配置的垃圾桶。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    format: u32,
    app: String,
    /// 毫秒时间戳，不是格式化好的日期串。
    ///
    /// 不引 `chrono`：这个数只用来「比哪份新」和拼文件名，不需要给人读；
    /// 更要紧的是库里 `created_at` / `updated_at` 就是同一口径，对账时不用做时区换算。
    /// 要给人看的时候，界面/文件名各自格式化一次，那个决定留给看的人。
    exported_at: i64,
    /// 角色原样透传：`store` 那边就是一列 JSON，Rust 侧不认识任何字段
    /// （理由见 `store.rs` 的名册那一段），备份也不该突然认识。
    characters: Vec<serde_json::Value>,
    /// 物价用 `PriceItem` 而不是 `Value`：这一侧的结构是规范化表、字段稳定，
    /// 且点位本来就已经内嵌在 `points` 里，没必要为了「透传」再拆一遍。
    prices: Vec<PriceItem>,
}

/// 导入成功后的回执。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    characters: i64,
    prices: i64,
    /// 替换**之前**那一份的落盘位置。要显示给用户：这是他唯一能退回去的地方。
    backup_path: String,
}

/// 清除成功后的回执。两个数都要报出来——
/// 界面上「已清除」不带数量的话，用户没法区分「清掉了一份账」和「本来就是空的」。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearSummary {
    characters: i64,
    prices: i64,
}

/* ======================================================================
 * 三个命令
 * ==================================================================== */

/// 导出：系统「另存为」对话框选位置，写一份 JSON。
///
/// 先弹对话框、再读数据库：用户很可能只是点开看看位置就取消，
/// 那一刻没有任何理由去读一遍库（还得开一次 SQLite 连接）。
#[tauri::command]
pub async fn data_export(app: AppHandle) -> Result<Option<String>, String> {
    let name = format!("梦幻养老助手-账本-{}.json", now_ms());
    let Some(path) = ask_save_path(&app, name).await? else {
        /* 取消不是错误：返回 `Ok(None)`，前端据此显示「什么也没发生」而不是一条红字。 */
        return Ok(None);
    };

    let file = build(&app)?;
    write_to(&path, &file)?;
    Ok(Some(path.display().to_string()))
}

/// 导入：选文件 → 校验 → 自动备份当前数据 → 整份替换。
///
/// **备份在替换之前**，不是「替换成功之后再补一份」：后者在替换半途失败时恰好没有备份，
/// 而那种情况才是真需要它的时候。顺序反过来还有一个好处——备份失败就等于整次导入没开始，
/// 用户看到的是「没做成」，而不是「做了一半」。
#[tauri::command]
pub async fn data_import(app: AppHandle) -> Result<Option<ImportSummary>, String> {
    let Some(path) = ask_open_path(&app).await? else {
        return Ok(None);
    };

    let raw =
        std::fs::read(&path).map_err(|error| format!("读不了 {}：{error}", path.display()))?;
    let file: BackupFile = serde_json::from_slice(&raw)
        .map_err(|error| format!("{} 不是一份能读的备份：{error}", path.display()))?;

    check_envelope(&file)?;
    /* 校验放在清空之前，而且宁可整份拒绝：`characters_save` 对没 id 的记录会兜底成
     * `row-0` 这种假 id（那是为了「别因为一条坏记录丢掉整份名册」），可在这里，
     * 兜底意味着用户换回来的账目里混进了几个点不开也删不掉的空壳。
     * 与其猜，不如说清「第几条坏了」。 */
    validate(&file.characters, &file.prices)?;

    let current = build(&app)?;
    let saved = backup_dir(&app)?.join(format!("账本-before-import-{}.json", now_ms()));
    write_to(&saved, &current)?;

    let characters = file.characters.len() as i64;
    let prices = file.prices.len() as i64;

    store::clear_all(&app)?;
    store::characters_save(app.clone(), file.characters)?;
    store::prices_save(app.clone(), file.prices)?;

    Ok(Some(ImportSummary {
        characters,
        prices,
        backup_path: saved.display().to_string(),
    }))
}

/// 清除：清空角色与物价，保留 `meta`（理由见 `store::clear_all` 的注释）。
///
/// `async` 只是与旁边两个命令同一个形状：它们都要弹对话框，所以必须 `async`
/// （同步命令跑在主线程上，弹窗会卡住消息循环）；这一条没有对话框，
/// 但三个命令摆在一起时，签名不一致会让人以为「这个大概不能在等待里调」。
#[tauri::command]
pub async fn data_clear(app: AppHandle) -> Result<ClearSummary, String> {
    let (characters, prices) = store::clear_all(&app)?;
    Ok(ClearSummary { characters, prices })
}

/* ======================================================================
 * 对话框
 *
 * **`blocking_pick_file` / `blocking_save_file` 不能在主线程调用。**
 * 它们的实现（`tauri-plugin-dialog` 的 `save_file`）是：`run_on_main_thread` 里建对话框，
 * 再 `std::thread::spawn` 一条线程 `block_on` 那个 rfd future，结果经
 * `sync_channel(0)` 送回调用处。
 *
 * 注意机理**不是**「投递给主线程的任务排不上队」：`run_on_main_thread` 在主线程自身调用时
 * 是**就地内联执行**的（`tauri-runtime-wry` 的 `send_user_message` 先比 `main_thread_id`，
 * 相等就直接跑）。所以对话框建得出来、用户也点得动——那两件事都不需要我们的 UI 线程。
 * 卡住的是 `rx.recv()`：它按在 wry 的 UI 线程上，于是整个窗口假死，拖动、重绘、
 * 点页面上任何按钮都没反应，而对话框本身还好端端地在前台。macOS / Linux 上更糟：
 * 那两个平台建窗要回主线程，主线程正卡在 `recv()` 上，于是才是真死锁。
 *
 * 命令本身已经是 `async fn`（跑在 tokio worker 上，不占 UI 线程），但直接调 blocking 版本
 * 仍然不对：那会把一条 worker 线程钉住「用户在挑文件」的几十秒。所以统一丢进
 * `spawn_blocking`——专门给阻塞调用准备的线程池，卡多久都影响不到异步运行时。
 * ==================================================================== */

/// 给文件对话框设父窗口。
///
/// **不设是错的，不是「可有可无」**：Windows 上 rfd 拿不到 parent 就走 `Show(None)`，
/// 对话框于是既不属于主窗口、也不对主窗口模态。两件后果都在真实场景里发生：
/// ① 它可以被主窗口盖到后面——本仓主窗口是 `decorations(false)` + `center()`，
///    点完「导出」看起来就像什么都没发生，用户会再点一次；
/// ② 它开着的时候页面上的按钮照样能点，而这张卡上紧挨着就是「导入」和「清除」，
///    两条命令同时跑起来时，导出的可能是替换到一半的账。
///
/// `set_parent` 只读一次 raw window handle 存下来（`WindowHandle::new`），跨线程带着走是安全的，
/// 所以可以在 `spawn_blocking` 里现取现设。取不到窗口（标识改了、窗口已销毁）就**不设**：
/// 把这里写成 `expect` 会让「没有父窗口」升级成整条命令失败，而不设只是退化成上面那两个毛病。
fn with_parent<R: tauri::Runtime>(
    app: &AppHandle<R>,
    builder: tauri_plugin_dialog::FileDialogBuilder<R>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    match app.get_webview_window("main") {
        Some(window) => builder.set_parent(&window),
        None => builder,
    }
}

/// 弹「另存为」，返回用户选的位置。取消 → `Ok(None)`。
async fn ask_save_path(app: &AppHandle, name: String) -> Result<Option<PathBuf>, String> {
    let app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let builder = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_file_name(name);
        with_parent(&app, builder).blocking_save_file()
    })
    .await
    /* 线程 panic 才会走到这里（`spawn_blocking` 的 JoinError）。
     * 不写成 `expect`：那会让一次弹窗失败升级成整个应用的崩溃。 */
    .map_err(|error| format!("对话框线程异常：{error}"))?;

    match picked {
        None => Ok(None),
        /* `FilePath` 是 `Url | Path` 两种变体（`tauri-plugin-fs` 的公共类型）。
         * Windows 上 rfd 给的是 `Path`，但 `into_path` 一并处理 `file://`，
         * 不必在这里替平台做主。 */
        Some(file) => file
            .into_path()
            .map(Some)
            .map_err(|error| format!("那个位置不是一个本地路径：{error}")),
    }
}

/// 弹「打开」，返回选中文件的路径。取消 → `Ok(None)`。
async fn ask_open_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let builder = app.dialog().file().add_filter("JSON", &["json"]);
        with_parent(&app, builder).blocking_pick_file()
    })
    .await
    .map_err(|error| format!("对话框线程异常：{error}"))?;

    match picked {
        None => Ok(None),
        Some(file) => file
            .into_path()
            .map(Some)
            .map_err(|error| format!("那个位置不是一个本地路径：{error}")),
    }
}

/* ======================================================================
 * 落盘
 * ==================================================================== */

/// 从数据库现读一份信封。
///
/// 直接复用那两个 `#[tauri::command]` 函数：它们本来就是「取连接 + 整份读」的普通
/// `pub fn`，在这里再写一遍 `open` / 查询只会多出一份会和 `store.rs` 漂移的副本。
/// 命令在 Rust 侧就是一个函数，调用它不需要 IPC。
fn build(app: &AppHandle) -> Result<BackupFile, String> {
    Ok(BackupFile {
        format: FORMAT,
        app: APP_TAG.to_string(),
        exported_at: now_ms(),
        characters: store::characters_load(app.clone())?,
        prices: store::prices_load(app.clone())?,
    })
}

/// 写一份信封到 `path`。
///
/// 末尾补一个换行：仓库里其它 JSON（清单、种子数据、探针导出）都是这么存的，
/// 不补的话 `git diff` 会在最后一行挂一条「\ No newline at end of file」。
/// 备份文件大概率不进 git，但这份习惯值得一致——用户在编辑器里打开时也不会看到
/// 最后一行和光标贴在一起。
fn write_to(path: &Path, file: &BackupFile) -> Result<(), String> {
    let mut bytes =
        serde_json::to_vec_pretty(file).map_err(|error| format!("序列化备份失败：{error}"))?;
    bytes.push(b'\n');
    std::fs::write(path, &bytes).map_err(|error| format!("写入 {} 失败：{error}", path.display()))
}

/// 自动备份目录：数据目录下的 `backups/`。
///
/// 落在数据目录里面而不是 `%TEMP%`：它跟库文件同生共死（红线 1 的那条目录，
/// 卸载也不清），用户要找回「导入之前那一份」时，位置是能被「关于」卡片里的
/// 数据目录一句话指到的。日期不参与分层（不再按天建档）：这个目录里最多只有
/// 用户手点出来的几十个文件，多一层只会让人多点一次。
fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = store::base_dir(app)?.join("backups");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("建不了备份目录 {}：{error}", dir.display()))?;
    Ok(dir)
}

/// 毫秒时间戳。
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        /* 系统时钟被调到 1970 之前才会走到这里。此刻写 0 比 panic 好：
         * 备份文件里那个字段失真，远好过整个导入失败。 */
        .unwrap_or(0)
}

/// 信封本身合不合规矩：`format` 与 `app` 两个字段都得对得上。
///
/// 两个分开查，因为失配的理由不一样、该给的话也不一样：`format` 不对多半是
/// 「更新版本写的」（用户该升级应用），`app` 不对则是「这压根不是本应用的文件」
/// （用户拖进来的是别的 JSON）。合成一句「无法识别的文件」就把这条线索丢了。
///
/// 拒绝就是拒绝：不尝试「按 v1 的字段名猜一猜」。理由见模块注释里旧版 `data.json` 那一段。
fn check_envelope(file: &BackupFile) -> Result<(), String> {
    if file.format != FORMAT {
        return Err(format!(
            "不认识的备份格式（format={}，本版本是 {FORMAT}）：这不是本版本导出的备份，\
             可能是更新版本写的",
            file.format
        ));
    }
    if file.app != APP_TAG {
        return Err(format!(
            "这不是本版本导出的备份（app={}，本版本是 {APP_TAG}）",
            file.app
        ));
    }
    Ok(())
}

/// 一份备份里的记录必须都说得出自己是谁。
///
/// 只查这一件事——`id` 是非空字符串。不查价格是不是正数、名字是不是空的：
/// 那些是录入时的规矩，用户在别处手工改过的 JSON 也该能导进来。
/// `id` 是唯一例外，因为它是整份替换之后**唯一能把一条记录再认出来**的东西。
fn validate(characters: &[serde_json::Value], prices: &[PriceItem]) -> Result<(), String> {
    for (index, character) in characters.iter().enumerate() {
        let id = character
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if !character.is_object() || id.is_empty() {
            return Err(format!("第 {} 条角色没有 id", index + 1));
        }
    }
    for (index, item) in prices.iter().enumerate() {
        if item.id.is_empty() {
            return Err(format!("第 {} 件物价没有 id", index + 1));
        }
    }
    Ok(())
}

/* ======================================================================
 * 测试
 *
 * 只测两件不需要 `AppHandle` 的事：信封能不能原样回读、校验能不能拦住坏记录。
 * `build` / `backup_dir` / 两个对话框都要构造 `AppHandle`（要起 Tauri 运行时），
 * 那种测试属于「真机点一次」，不属于 `cargo test`——和 `store.rs` 拆出 `open_at`
 * 是同一条界线：能对着临时目录跑的才写进来。
 * ==================================================================== */

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_item() -> PriceItem {
        PriceItem {
            id: "item-1".to_string(),
            name: "黑宝石".to_string(),
            category: "宝石".to_string(),
            sub: "黑宝石".to_string(),
            unit: "颗".to_string(),
            note: String::new(),
            points: Vec::new(),
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
        }
    }

    fn sample() -> BackupFile {
        BackupFile {
            format: FORMAT,
            app: APP_TAG.to_string(),
            exported_at: 1_700_000_000_000,
            characters: vec![serde_json::json!({ "id": "c1", "name": "大唐" })],
            prices: vec![sample_item()],
        }
    }

    /// 写出去的那份必须能原样读回来，且**末尾有一个换行**。
    ///
    /// 这条同时钉住信封的线格式：字段名是 camelCase（`exportedAt`），
    /// 前端没有任何代码读它，但人是会打开看的——和 `AppInfo` / `PriceItem`
    /// 走的是同一条 `rename_all` 约定，不一致的话这份文件就是唯一的例外。
    #[test]
    fn backup_round_trips_through_disk() {
        let dir = std::env::temp_dir().join(format!("mh-toolbox-backup-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("建临时目录");
        let path = dir.join("sample.json");

        write_to(&path, &sample()).expect("写备份");
        let raw = std::fs::read(&path).expect("读备份");
        assert_eq!(raw.last(), Some(&b'\n'), "末尾要补一个换行");

        let text = String::from_utf8(raw).expect("备份是 UTF-8");
        assert!(
            text.contains("\"exportedAt\""),
            "信封字段名应是 camelCase，实际内容：{text}"
        );

        let parsed: BackupFile = serde_json::from_str(&text).expect("读回信封");
        assert_eq!(parsed.format, FORMAT);
        assert_eq!(parsed.app, APP_TAG);
        assert_eq!(parsed.exported_at, 1_700_000_000_000);
        assert_eq!(parsed.characters.len(), 1);
        assert_eq!(parsed.characters[0]["id"], "c1");
        assert_eq!(parsed.prices.len(), 1);
        assert_eq!(parsed.prices[0].id, "item-1");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 信封的版本或来源不对就整份拒绝，且两种失配要说两句不同的话。
    #[test]
    fn check_envelope_rejects_other_format_and_app() {
        check_envelope(&sample()).expect("自己写出来的那份必须过");

        let mut newer = sample();
        newer.format = FORMAT + 1;
        let error = check_envelope(&newer).expect_err("更高的 format 必须拒绝");
        assert!(
            error.contains("这不是本版本导出的备份"),
            "文案要明确拒绝，实际是：{error}"
        );
        assert!(
            error.contains(&format!("format={}", FORMAT + 1)),
            "文案要带上看不懂的那个版本号，实际是：{error}"
        );

        let mut foreign = sample();
        foreign.app = "other-app".to_string();
        let error = check_envelope(&foreign).expect_err("别家的文件必须拒绝");
        assert!(
            error.contains("app=other-app"),
            "文案要说清是来源不对，实际是：{error}"
        );
    }

    /// 没有 `id` 的角色、`id` 为空的物品都要被拦住，且报出是第几条——
    /// 导入是整体替换，用户只能靠这句话去原始文件里找。
    #[test]
    fn validate_rejects_records_without_id() {
        validate(&[serde_json::json!({ "id": "c1" })], &[sample_item()]).expect("都有 id 时应通过");
        validate(&[], &[]).expect("空备份也是合法备份：它就是「清空」这一件事");

        let error = validate(&[serde_json::json!({ "name": "没有 id" })], &[])
            .expect_err("缺 id 的角色必须被拒绝");
        assert_eq!(error, "第 1 条角色没有 id");

        let error = validate(&[serde_json::json!("这不是一个对象")], &[])
            .expect_err("不是对象的记录必须被拒绝");
        assert_eq!(error, "第 1 条角色没有 id");

        let mut blank = sample_item();
        blank.id = String::new();
        let error = validate(&[], &[blank]).expect_err("id 为空的物价必须被拒绝");
        assert_eq!(error, "第 1 件物价没有 id");
    }
}
