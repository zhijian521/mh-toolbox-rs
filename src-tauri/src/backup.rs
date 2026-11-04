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

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
/* `Manager` 是为了 `app.get_webview_window("main")`：`.dialog()` 来自插件的 `DialogExt`，
 * 而按标识取窗口是 manager 的能力。 */
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::store::{self, IncomeEntry, IncomePayload, PriceItem, QuickPrice};

/// 信封格式版本。**改字段含义才 +1**，加一个可选字段不用动它。
///
/// 导入时严格比对：不认识的 `format` 一律拒绝，不做「尽力而为地读」。
/// 拒绝的代价是「少一次恢复」，猜错的代价是「把用户的账写成一堆缺字段的东西」。
const FORMAT: u32 = 1;

/// 信封里的应用标识。将来如果真出现第二份工具导出同名 JSON，这个字段是唯一的分辨依据。
const APP_TAG: &str = "mh-toolbox-rs";

/// 导入文件的大小上限。**在反序列化之前**判，理由见 `data_import` 里那一段。
///
/// 16 MB 是真实账本的几十倍（一份百来件物品、几千条点位的备份约几百 KB），
/// 正常的备份碰不到它；会碰到的是「用户选错了文件」（日志、视频、别的应用的数据）。
const MAX_BACKUP_BYTES: u64 = 16 * 1024 * 1024;

/// 前端单件物品最多存多少条点位，与 `src/views/prices/prices.ts:36` 的 `POINT_LIMIT`
/// 是同一个数。
///
/// **Rust 侧不用它裁剪**：裁剪是前端的规矩（`prices.ts` 保存时 `.slice(0, POINT_LIMIT)`），
/// 这里只拿它**统计**「导进去之后会被裁掉多少条」，让界面能提前说一声。两处数字漂移的
/// 后果很轻——只是提示的条数不准，不会丢数据；但如果哪天前端把上限改了，这里要跟着改。
const POINT_LIMIT: usize = 200;

/// 自动备份的文件名前缀。清理旧备份时靠它把「自动备份」与用户自己导出到 `backups/` 的
/// 文件分开——只按目录清理会把用户手工放进去的东西一起删掉。
const AUTO_BACKUP_PREFIX: &str = "账本-before-import-";

/// 自动备份最多留几份。它是「导入前那一手」的兜底，不是归档：攒到几百份之后，
/// 用户反而找不到哪一份才是要退回去的。
const AUTO_BACKUP_KEEP: usize = 10;

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
    /// 收益账与速记单价（第 97 批起）。
    ///
    /// **`default` 不能省**：97 批之前导出的备份里没有这两个字段，读的时候会因缺字段
    /// 整份失败——用户的旧备份就此打不开，而它可能是唯一一份。空数组表示「那份备份里
    /// 本来就没有收益」，导入时照实清空，与「格式不对」区分开。
    #[serde(default)]
    income: Vec<IncomeEntry>,
    #[serde(default)]
    quick_prices: Vec<QuickPrice>,
}

/// 导入成功后的回执。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    characters: i64,
    prices: i64,
    /// 导进来的收益条数。不看这个数，用户会以为「导入成功了、收益也回来了」，
    /// 而那份备份可能是一份只有角色与物价的旧备份。
    entries: i64,
    /// 会被前端裁掉的点位数（每件物品只存 `POINT_LIMIT` 条）。0 表示一条都不丢。
    ///
    /// 必须报出来：导入是「如实搬进来」，而前端**下次保存**时会按上限裁。用户导入了一份
    /// 300 条点位的备份，界面上先看到 300 条、下次一存只剩 200 条——不提前说，
    /// 那就是一次无声的数据丢失。
    truncated: i64,
    /// 触发上限的物品件数。前端拼提示语要用（「3 件物品共 100 条会在下次保存时被裁掉」）。
    truncated_items: i64,
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
    entries: i64,
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

/// 导入：选文件 → 大小 / 信封 / 记录校验 → 自动备份当前数据 → **一个事务**整份替换。
///
/// **备份在替换之前**，不是「替换成功之后再补一份」：后者在替换半途失败时恰好没有备份，
/// 而那种情况才是真需要它的时候。顺序反过来还有一个好处——备份失败就等于整次导入没开始，
/// 用户看到的是「没做成」，而不是「做了一半」。
///
/// 替换本身是 `store::replace_all` 的**一个事务**：名册与物价一起换，任何一步失败整体
/// 回滚。早先这里是 `clear_all` + `characters_save` + `prices_save` 三次 `open`、
/// 三次提交——`clear_all` 一提交旧数据就没了，之后任一步失败都留下一个半截库。
///
/// 从备份写完那一刻起，**每条 `Err` 都带上备份路径**：那是用户唯一能退回去的地方，
/// 而「导入失败」这件事本身不足以让他知道旧数据还在不在。
#[tauri::command]
pub async fn data_import(app: AppHandle) -> Result<Option<ImportSummary>, String> {
    let Some(path) = ask_open_path(&app).await? else {
        return Ok(None);
    };

    /* 先问大小、再反序列化。这份文件来自硬盘上任意一个位置，拿几百 MB 的视频去试
     * `serde_json::from_slice`，最轻的后果是界面卡住几秒、最后报一句「不是 JSON」。 */
    let size = std::fs::metadata(&path)
        .map_err(|error| format!("读不了 {}：{error}", path.display()))?
        .len();
    if size > MAX_BACKUP_BYTES {
        return Err("这个文件太大，可能不是账本备份".to_string());
    }

    let raw =
        std::fs::read(&path).map_err(|error| format!("读不了 {}：{error}", path.display()))?;
    let file: BackupFile = serde_json::from_slice(&raw)
        .map_err(|error| format!("{} 不是一份能读的备份：{error}", path.display()))?;

    check_envelope(&file)?;
    /* 校验放在替换之前，而且宁可整份拒绝：`save_characters` 对没 id 的记录会兜底成
     * `row-0` 这种假 id（那是为了「别因为一条坏记录丢掉整份名册」），可在这里，
     * 兜底意味着用户换回来的账目里混进了几个点不开也删不掉的空壳。
     * 与其猜，不如说清「第几条坏了」。 */
    let truncation = validate(&file.characters, &file.prices)?;

    let current = build(&app)?;
    let dir = backup_dir(&app)?;
    let saved = dir.join(format!("{AUTO_BACKUP_PREFIX}{}.json", now_ms()));
    write_to(&saved, &current)?;
    prune_auto_backups(&dir);

    /* 到这里为止的失败都还是「什么都没换」，不需要报备份路径。下面两条是替换路径上
     * 仅有的失败点，两个都要带上路径。 */
    let backup_path = saved.display().to_string();
    let mut conn = store::open(&app)
        .map_err(|error| format!("{error}；替换前的数据已备份到 {backup_path}"))?;
    let income = IncomePayload {
        entries: file.income,
        prices: file.quick_prices,
    };
    let (characters, prices, entries) =
        store::replace_all(&mut conn, &file.characters, &file.prices, &income)
            .map_err(|error| format!("{error}；替换前的数据已备份到 {backup_path}"))?;

    Ok(Some(ImportSummary {
        characters,
        prices,
        entries,
        truncated: truncation.points_dropped,
        truncated_items: truncation.items_over_limit,
        backup_path,
    }))
}

/// 清除：清空角色与物价，保留 `meta`（理由见 `store::clear_all` 的注释）。
///
/// `async` 只是与旁边两个命令同一个形状：它们都要弹对话框，所以必须 `async`
/// （同步命令跑在主线程上，弹窗会卡住消息循环）；这一条没有对话框，
/// 但三个命令摆在一起时，签名不一致会让人以为「这个大概不能在等待里调」。
#[tauri::command]
pub async fn data_clear(app: AppHandle) -> Result<ClearSummary, String> {
    let (characters, prices, entries) = store::clear_all(&app)?;
    Ok(ClearSummary {
        characters,
        prices,
        entries,
    })
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

/* ======================================================================
 * 测试钩子：把系统对话框换成一个固定路径
 * ==================================================================== */

/// 钩子文件名，落在数据目录下（与库文件同级，`e2e` 脚本知道去哪儿写）。
const OVERRIDE_FILE: &str = "e2e-dialog.json";

/// **仅 debug 构建**：数据目录里出现 `e2e-dialog.json` 时，跳过系统对话框，直接用里面的路径。
///
/// ---- 为什么需要它 ----
/// e2e 要验「导出 → 导入」这条真路径，而它的头一步是 rfd 的原生对话框：不在 WebView 里、
/// CDP 点不到，真弹出来还会把模态窗挂在窗口前面等人点。于是那一节此前只验到「三枚按钮在、
/// 按 Esc 能取消」，中间这段**从来没有被走过**——而它恰好是「用户的账到底有没有安全落盘」
/// 的那一段。
///
/// ---- 为什么是文件，不是环境变量 ----
/// e2e 连的是一个**已经跑起来**的窗口，环境变量在进程启动那一刻就定了；而一轮测试里要连着
/// 做两次不同的选择（先「另存为」到 A，再「打开」A）。文件可以在两次之间换内容。
///
/// ---- 为什么读到就删、且只在 debug ----
/// 读到就删：一份只该用一次，否则用户自己点「导出」时会被莫名其妙塞到测试目录里。
/// 只在 debug：留着它等于给任何能写数据目录的程序一条「把账本悄悄导出到固定位置，或用
/// 一个文件把账本整份顶掉」的路。`cfg!` 是编译期常量，release 里这段会被整个丢掉——
/// 不是「运行时跳过」，是**发布版里根本没有这段代码**。
///
/// 文件形状：`{"save": "C:/…/x.json"}` 或 `{"open": "C:/…/x.json"}`。解析失败就是没有钩子，
/// 照常弹对话框——测试写错了不该让功能不可用。
fn dialog_override(app: &AppHandle, kind: &str) -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let file = store::base_dir(app).ok()?.join(OVERRIDE_FILE);
    let raw = std::fs::read_to_string(&file).ok()?;
    /* 先删再解析：内容坏掉的那一份也算用过了，不然它会让后面每一次调用都失败一次。 */
    let _ = std::fs::remove_file(&file);
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value.get(kind)?.as_str().map(PathBuf::from)
}

/// 弹「另存为」，返回用户选的位置。取消 → `Ok(None)`。
async fn ask_save_path(app: &AppHandle, name: String) -> Result<Option<PathBuf>, String> {
    if let Some(path) = dialog_override(app, "save") {
        return Ok(Some(ensure_json_extension(path)));
    }
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
        Some(file) => {
            let path = file
                .into_path()
                .map_err(|error| format!("那个位置不是一个本地路径：{error}"))?;
            Ok(Some(ensure_json_extension(path)))
        }
    }
}

/// 用户把文件名里的 `.json` 删掉时补回去。
///
/// 不补的后果**不是**「文件打不开」，而是「下次导入看不见它」：`ask_open_path` 的过滤器
/// 只列 `json`，Windows 的打开对话框默认不显示其它后缀，用户会以为备份丢了。
/// 判定不分大小写：`JSON` / `Json` 都是系统里合法的后缀写法。
fn ensure_json_extension(path: PathBuf) -> PathBuf {
    let already_json = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
    if already_json {
        return path;
    }
    match path.file_name() {
        Some(name) => {
            let mut name = name.to_os_string();
            name.push(".json");
            path.with_file_name(name)
        }
        /* 连文件名都没有（只有根路径之类的病态输入）就原样返回：
         * 在这里编一个名字只会把文件写到用户没看的地方。 */
        None => path,
    }
}

/// 弹「打开」，返回选中文件的路径。取消 → `Ok(None)`。
async fn ask_open_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    if let Some(path) = dialog_override(app, "open") {
        return Ok(Some(path));
    }
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
    /* 收益与单价一次读回（`income_load` 本来就是两份一起），再拆进信封的两栏：
     * 备份文件里「记录」与「单价」是两件事，读者不该为了拿单价去翻一堆记录。 */
    let income = store::income_load(app.clone())?;
    Ok(BackupFile {
        format: FORMAT,
        app: APP_TAG.to_string(),
        exported_at: now_ms(),
        characters: store::characters_load(app.clone())?,
        prices: store::prices_load(app.clone())?,
        income: income.entries,
        quick_prices: income.prices,
    })
}

/// 写一份信封到 `path`。
///
/// 末尾补一个换行：仓库里其它 JSON（清单、种子数据、探针导出）都是这么存的，
/// 不补的话 `git diff` 会在最后一行挂一条「\ No newline at end of file」。
/// 备份文件大概率不进 git，但这份习惯值得一致——用户在编辑器里打开时也不会看到
/// 最后一行和光标贴在一起。
///
/// **先写 `.tmp` 再改名**，与 `migrate.rs` 的搬迁同一个模式：`std::fs::write` 是
/// 「截断 + 写」，写到一半断电 / 磁盘满会在正式名下留一个半截 JSON——而自动备份的
/// 文件名正是「导入前的数据」，用户最需要它的时候它恰好是坏的。改名是原子替换，
/// 于是正式名要么不存在、要么完整。临时名带 pid：两个实例同时导出时互不截断。
fn write_to(path: &Path, file: &BackupFile) -> Result<(), String> {
    let mut bytes =
        serde_json::to_vec_pretty(file).map_err(|error| format!("序列化备份失败：{error}"))?;
    bytes.push(b'\n');

    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    if let Err(error) = std::fs::write(&tmp, &bytes) {
        /* 失败的那一份本身也可能留下半截 `.tmp`，一并删——它对任何人都没有用处，
         * 留着只会在下一次写的时候让人怀疑「这个是哪来的」。 */
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("写入 {} 失败：{error}", path.display()));
    }
    std::fs::rename(&tmp, path).map_err(|error| {
        let _ = std::fs::remove_file(&tmp);
        format!("写入 {} 失败：{error}", path.display())
    })
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

/// 只保留最近 `AUTO_BACKUP_KEEP` 份**自动备份**。
///
/// 只认 `AUTO_BACKUP_PREFIX` + 时间戳 + `.json` 这个形状：用户手点的导出落在自己选的
/// 位置，就算他恰好选到 `backups/`，文件名也不是这个形状，不会被误删。
///
/// 全程尽力而为、不返回 `Err`：这是收尾动作，删不掉一份旧备份不该让一次成功的导入
/// 变成失败。同理，`read_dir` 都不通就直接放弃。
fn prune_auto_backups(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut backups: Vec<(i64, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let stamp = entry
                .file_name()
                .into_string()
                .ok()?
                .strip_prefix(AUTO_BACKUP_PREFIX)?
                .strip_suffix(".json")?
                .parse::<i64>()
                .ok()?;
            Some((stamp, entry.path()))
        })
        .collect();

    if backups.len() <= AUTO_BACKUP_KEEP {
        return;
    }
    /* 按时间戳从新到旧；同一毫秒的两份顺序无所谓——它们本来就是同一批写的。 */
    backups.sort_unstable_by_key(|(stamp, _)| std::cmp::Reverse(*stamp));
    for (_, path) in backups.into_iter().skip(AUTO_BACKUP_KEEP) {
        if let Err(error) = std::fs::remove_file(&path) {
            eprintln!(
                "清理旧自动备份 {} 失败（不影响本次导入）：{error}",
                path.display()
            );
        }
    }
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

/// 校验结果里**不阻止导入**的那部分：会被前端裁掉多少。
///
/// Rust 侧**不裁**（理由见 `POINT_LIMIT` 的注释），只把话说出去，让界面能提前提示。
#[derive(Debug, Default, PartialEq, Eq)]
struct Truncation {
    /// 超过 `POINT_LIMIT` 的物品件数。
    items_over_limit: i64,
    /// 会在下一次保存时被裁掉的点位总数。
    points_dropped: i64,
}

/// 一份备份里的记录必须都说得出自己是谁，并且**唯一**。
///
/// 查两件事：
/// 1. **`id` 是非空字符串**。不查价格是不是正数、名字是不是空的：那些是录入时的规矩，
///    用户在别处手工改过的 JSON 也该能导进来。`id` 是唯一例外，因为它是整份替换之后
///    **唯一能把一条记录再认出来**的东西。
/// 2. **`id` 不重复**。这一条不是洁癖：`price_points.id` 是**全表主键**（不分物品），
///    而 `price_items.id` / `characters.id` 也是主键。一份手工拼出来、或从两份账本里
///    各复制一段的备份很容易带上重复的点位 id——那种文件能通过信封校验，却在
///    `INSERT` 时撞 UNIQUE，而那时旧数据已经被删了（现在有事务兜底，但用户看到的
///    仍是一次失败）。在替换之前说清楚「哪一类的第几条重复」，比事后回滚有用。
///
/// 返回的那份 `Truncation` 只在**校验通过**之后有意义：导入照做，只是界面该提一句
/// 「有 3 件物品共 100 条点位会在下次保存时被裁掉」。
fn validate(characters: &[serde_json::Value], prices: &[PriceItem]) -> Result<Truncation, String> {
    let mut seen_characters: HashSet<&str> = HashSet::new();
    for (index, character) in characters.iter().enumerate() {
        let id = character
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if !character.is_object() || id.is_empty() {
            return Err(format!("第 {} 条角色没有 id", index + 1));
        }
        if !seen_characters.insert(id) {
            return Err(format!("第 {} 条角色的 id「{id}」与前面重复", index + 1));
        }
    }

    let mut truncation = Truncation::default();
    let mut seen_items: HashSet<&str> = HashSet::new();
    let mut seen_points: HashSet<&str> = HashSet::new();
    for (index, item) in prices.iter().enumerate() {
        if item.id.is_empty() {
            return Err(format!("第 {} 件物价没有 id", index + 1));
        }
        if !seen_items.insert(&item.id) {
            return Err(format!(
                "第 {} 件物价的 id「{}」与前面重复",
                index + 1,
                item.id
            ));
        }

        if item.points.len() > POINT_LIMIT {
            truncation.items_over_limit += 1;
            truncation.points_dropped += (item.points.len() - POINT_LIMIT) as i64;
        }

        for (point_index, point) in item.points.iter().enumerate() {
            if point.id.is_empty() {
                return Err(format!(
                    "第 {} 件物价的第 {} 条价格没有 id",
                    index + 1,
                    point_index + 1
                ));
            }
            /* 点位 id 的查重是**跨物品**的：库里那张表只有 `id` 一个主键，
             * 两件物品各有一个 `p1` 一样会撞。 */
            if !seen_points.insert(&point.id) {
                return Err(format!(
                    "第 {} 件物价的第 {} 条价格的 id「{}」与前面重复（点位 id 在全表唯一，不分物品）",
                    index + 1,
                    point_index + 1,
                    point.id
                ));
            }
        }
    }

    Ok(truncation)
}

/* ======================================================================
 * 测试
 *
 * 只测**不吃 `AppHandle`** 的那几件：信封能不能原样回读、校验能不能拦住坏记录、
 * 截断统计对不对、`.json` 后缀怎么补、旧自动备份怎么清。
 *
 * `build` / `backup_dir` / 两个对话框 / `data_import` 本身都要构造 `AppHandle`
 * （要起 Tauri 运行时），那种测试属于「真机点一次」，不属于 `cargo test`——
 * 和 `store.rs` 拆出 `open_at` 是同一条界线：能对着临时目录跑的才写进来。
 * 导入的原子性因此落在 `store::replace_all` 的测试里，那是同一段代码的另一半。
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
            /* 收益与单价各给一条：往返测试要证明它们**也在信封里**，
             * 空数组会让「漏序列化」和「本来就没有」看起来一样。 */
            income: vec![IncomeEntry {
                id: "e1".to_string(),
                date: "2026-11-04".to_string(),
                character_id: "c1".to_string(),
                kind: "income".to_string(),
                amount: 4133.8,
                item: "定魂珠".to_string(),
                note: String::new(),
                created_at: 1,
            }],
            quick_prices: vec![QuickPrice {
                item_id: 9,
                price: 4.6,
            }],
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

        /* tmp + rename 的收尾：正式名在，临时名必须消失。 */
        let leftovers: Vec<String> = std::fs::read_dir(&dir)
            .expect("读临时目录")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "写成功后不该留 .tmp：{leftovers:?}");

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
        let ok = validate(&[serde_json::json!({ "id": "c1" })], &[sample_item()])
            .expect("都有 id 时应通过");
        assert_eq!(ok, Truncation::default(), "没有超限的物品，不该报截断");
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

    fn point(id: &str) -> store::PricePoint {
        store::PricePoint {
            id: id.to_string(),
            date: "2026-01-01".to_string(),
            price: 1.0,
            note: String::new(),
            created_at: 1_700_000_000_000,
        }
    }

    /// 重复 id 必须在校验阶段拒绝，而且文案要说清是哪一类的第几条。
    ///
    /// 尤其是**点位 id 跨物品**这一条：`price_points` 的主键只有 `id`，两件物品各有一个
    /// `p1` 一样会撞 UNIQUE。早先这里只查「有没有 id」，这种备份会一路走到 `INSERT`
    /// 才失败——而那时事务已经开始删数据了。
    #[test]
    fn validate_rejects_duplicate_ids() {
        let error = validate(
            &[
                serde_json::json!({ "id": "c1" }),
                serde_json::json!({ "id": "c1" }),
            ],
            &[],
        )
        .expect_err("角色 id 重复必须拒绝");
        assert!(
            error.contains("第 2 条角色") && error.contains("重复"),
            "文案要说清第几条、哪一类重复，实际是：{error}"
        );

        let mut second = sample_item();
        second.id = "item-1".to_string();
        let error = validate(&[], &[sample_item(), second]).expect_err("物品 id 重复必须拒绝");
        assert!(
            error.contains("第 2 件物价") && error.contains("重复"),
            "文案要说清第几件，实际是：{error}"
        );

        /* 跨物品的同名点位 id：这一条正是数据库主键会拒的形态。 */
        let mut left = sample_item();
        left.id = "item-a".to_string();
        left.points = vec![point("p1")];
        let mut right = sample_item();
        right.id = "item-b".to_string();
        right.points = vec![point("p1")];
        let error = validate(&[], &[left, right]).expect_err("跨物品的重复点位 id 必须拒绝");
        assert!(
            error.contains("第 2 件物价的第 1 条价格") && error.contains("全表唯一"),
            "文案要说明点位 id 不分物品，实际是：{error}"
        );
    }

    /// 超过单件 200 条上限时**不拒绝**，只把「会被裁掉多少」报出来。
    ///
    /// 这是 M2 的核心：Rust 不替前端裁剪（那会让用户以为导入的东西没了，
    /// 而日志里一句话都没有），只让界面有机会提前说「下次保存会掉 100 条」。
    #[test]
    fn validate_counts_points_that_will_be_truncated() {
        let mut over = sample_item();
        over.id = "over".to_string();
        over.points = (0..(POINT_LIMIT + 100))
            .map(|index| point(&format!("p-{index}")))
            .collect();

        let mut exact = sample_item();
        exact.id = "exact".to_string();
        exact.points = (0..POINT_LIMIT)
            .map(|index| point(&format!("e-{index}")))
            .collect();

        let truncation = validate(&[], &[over, exact]).expect("超限不该阻止导入");
        assert_eq!(
            truncation,
            Truncation {
                items_over_limit: 1,
                points_dropped: 100,
            },
            "恰好 200 条的不算超限，超出多少就报多少"
        );
    }

    /// 「另存为」里删掉后缀时要补回 `.json`，已有的（含大写）不动。
    #[test]
    fn ensure_json_extension_appends_when_missing() {
        let cases = [
            ("账本.json", "账本.json"),
            ("账本.JSON", "账本.JSON"),
            ("账本", "账本.json"),
            ("账本.backup", "账本.backup.json"),
            ("账本.json.txt", "账本.json.txt.json"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                ensure_json_extension(PathBuf::from(input)),
                PathBuf::from(expected),
                "输入 {input} 的补法不对"
            );
        }
    }

    /// 自动备份只留最近 10 份，且**不碰**别的东西（用户自己放进来的文件、
    /// 名字形状不对的同前缀文件都要留着）。
    #[test]
    fn prune_auto_backups_keeps_latest_ten() {
        let dir = std::env::temp_dir().join(format!("mh-toolbox-prune-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");

        for stamp in 0..15 {
            std::fs::write(dir.join(format!("{AUTO_BACKUP_PREFIX}{stamp}.json")), b"{}")
                .expect("写自动备份");
        }
        /* 两个干扰项：同前缀但不是时间戳、以及用户自己的导出。 */
        std::fs::write(dir.join(format!("{AUTO_BACKUP_PREFIX}手改的.json")), b"{}")
            .expect("写干扰文件");
        std::fs::write(dir.join("账本-1700000000000.json"), b"{}").expect("写用户导出");

        prune_auto_backups(&dir);

        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .expect("读目录")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();

        let mut expected: Vec<String> = (5..15)
            .map(|stamp| format!("{AUTO_BACKUP_PREFIX}{stamp}.json"))
            .chain([
                format!("{AUTO_BACKUP_PREFIX}手改的.json"),
                "账本-1700000000000.json".to_string(),
            ])
            .collect();
        expected.sort();
        assert_eq!(left, expected, "只该删掉最早的 5 份自动备份");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
