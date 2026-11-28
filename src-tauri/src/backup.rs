//! JSON 账本备份、恢复、导入与清除；界面偏好不随账本导出。
//! 导入整份替换，先备份再事务写入，不猜测同 ID 数据的合并规则。
//! 不直接复制主库，避免遗漏 WAL 中的事务。
//! 旧版 v10 经独立转换入口处理；常规导入只接受新版信封，不回写旧文件。

use std::collections::HashSet;
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};
/* `Manager` 是为了 `app.get_webview_window("main")`：`.dialog()` 来自插件的 `DialogExt`，
 * 而按标识取窗口是 manager 的能力。 */
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::store::{
    self, AccountEntry, IncomeEntry, OnlineSession, OnlineSettings, PriceItem, QuickPrice,
};
#[cfg(test)]
use crate::store::{IncomePayload, OnlinePayload};

/// v2 纳入独立仓库，避免旧应用忽略资产后再次导出而丢失数据；读取兼容 v1。
pub(crate) const FORMAT: u32 = 2;

/// 信封里的应用标识。将来如果真出现第二份工具导出同名 JSON，这个字段是唯一的分辨依据。
pub(crate) const APP_TAG: &str = "mh-toolbox-rs";

/// 旧版原文需要经过 IPC 与前端转换，仍限制为 16 MB；新版备份在 Rust 内流式读写。
const MAX_LEGACY_BACKUP_BYTES: u64 = 16 * 1024 * 1024;

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
const DAILY_PREFIX: &str = "账本-daily-";

/// 备份**合计**只留最近几份，日常与「替换前」共用一个名额，不分别设上限。
/// 它是「导入前那一手」的兜底，不是归档：分两套上限时列表能涨到二十几条，
/// 用户反而找不到哪一份才是要退回去的。列出来、能恢复的也只有这 5 条。
const BACKUP_KEEP: usize = 5;
const DAILY_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(300);
const DAILY_STAMP: &str = "last-daily.json";
// 日常任务和导入共用轮换顺序，同一毫秒内也不能覆盖另一份还原点。
static BACKUP_WRITER: std::sync::Mutex<()> = std::sync::Mutex::new(());
static DAILY_ERROR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    name: String,
    created_at: i64,
    bytes: u64,
    kind: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupList {
    entries: Vec<BackupEntry>,
    error: Option<String>,
}

fn backup_stamp(name: &str) -> Option<(i64, i64, &'static str)> {
    for (prefix, kind) in [
        (DAILY_PREFIX, "daily"),
        (AUTO_BACKUP_PREFIX, "before-import"),
    ] {
        if let Some(stamp) = name
            .strip_prefix(prefix)
            .and_then(|one| one.strip_suffix(".json"))
        {
            // 老文件只有一个时间戳；时钟回拨或同毫秒写入时另存实际时间。
            let (order, created_at) = stamp.split_once('@').unwrap_or((stamp, stamp));
            let order = order.parse::<i64>().ok()?;
            let created_at = created_at.parse::<i64>().ok()?;
            if order > 0 && created_at >= 0 && order >= created_at {
                return Some((order, created_at, kind));
            }
        }
    }
    None
}

fn backup_entries(dir: &Path) -> Result<Vec<BackupEntry>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for item in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        let Some((order, created_at, kind)) = backup_stamp(&name) else {
            continue;
        };
        let meta = std::fs::symlink_metadata(item.path()).map_err(|error| error.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() {
            continue;
        }
        entries.push((
            order,
            BackupEntry {
                name,
                created_at,
                bytes: meta.len(),
                kind: kind.to_string(),
            },
        ));
    }
    entries.sort_by(|(a, left), (b, right)| b.cmp(a).then_with(|| right.name.cmp(&left.name)));
    Ok(entries.into_iter().map(|(_, entry)| entry).collect())
}

/// 沿用旧文件名；只有系统时间不能区分写入先后时才附加轮换序号。
fn managed_snapshot_path(
    dir: &Path,
    prefix: &str,
    now: i64,
    entries: &[BackupEntry],
) -> Result<PathBuf, String> {
    let newest = entries
        .first()
        .and_then(|entry| backup_stamp(&entry.name))
        .map_or(0, |(order, _, _)| order);
    let stamp = if now > newest {
        now.to_string()
    } else {
        let order = newest.checked_add(1).ok_or("备份序号已达上限")?;
        format!("{order}@{now}")
    };
    Ok(dir.join(format!("{prefix}{stamp}.json")))
}

/// 首次升级从旧文件补记；若上次在快照落盘后中断，也从完整快照补回时间。
fn last_daily_at(dir: &Path, entries: &[BackupEntry], now: i64) -> Result<Option<i64>, String> {
    let path = dir.join(DAILY_STAMP);
    let stored: Option<i64> = match std::fs::File::open(&path) {
        Ok(input) => match serde_json::from_reader(input) {
            Ok(stamp) => Some(stamp),
            Err(err) if err.is_io() => return Err(err.to_string()),
            Err(_) => None, // 元数据受损时，从留存的日常快照重建。
        },
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => None,
        Err(err) => return Err(err.to_string()),
    };
    // 时钟回拨后，未来时间不能作为调度基准。按轮换顺序取日常快照，避免旧的未来快照覆盖新基准。
    let stored = stored.filter(|stamp| (0..=now).contains(stamp));
    let latest = entries
        .iter()
        .find(|entry| entry.kind == "daily")
        .map(|entry| entry.created_at)
        .filter(|stamp| *stamp <= now);
    if let Some(stamp) = latest.filter(|stamp| Some(*stamp) > stored) {
        write_to(&path, &stamp)?;
    }
    Ok(stored.max(latest))
}

fn daily_backup_at(base: &Path, now: i64) -> Result<(), String> {
    let _writer = BACKUP_WRITER.lock().map_err(|err| err.to_string())?;
    let dir = base.join("backups");
    let entries = backup_entries(&dir)?;
    if last_daily_at(&dir, &entries, now)?.is_some_and(|last| now.saturating_sub(last) < 86_400_000)
    {
        prune_backups(&dir, &entries);
        return Ok(());
    }
    let conn = store::open_at(base)?;
    let file = store::backup(&conn)?;
    validate_backup(&file)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = managed_snapshot_path(&dir, DAILY_PREFIX, now, &entries)?;
    write_to(&path, &file)?;
    write_to(&dir.join(DAILY_STAMP), &now)?;
    prune_backups(&dir, &backup_entries(&dir)?);
    Ok(())
}

/// 建窗后独立调度，间隔至少 24 小时留存完整快照，普通账本读写不参与轮换锁。
pub(crate) fn start_daily_backups(app: AppHandle) {
    std::thread::spawn(move || loop {
        let error = store::base_dir(&app)
            .and_then(|base| daily_backup_at(&base, now_ms()))
            .err();
        if let Ok(mut state) = DAILY_ERROR.lock() {
            *state = error;
        }
        std::thread::sleep(DAILY_CHECK_INTERVAL);
    });
}

#[tauri::command]
#[specta::specta]
pub fn backups_list(app: AppHandle) -> Result<BackupList, String> {
    /* 与「只保留 5 条」同口径：磁盘清理是尽力而为，列出来的一定不超过 5 条。 */
    let entries = listed_backups(&backup_dir(&app)?)?;
    let error = DAILY_ERROR
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    Ok(BackupList { entries, error })
}

#[tauri::command]
#[specta::specta]
pub async fn backup_restore(app: AppHandle, name: String) -> Result<ImportSummary, String> {
    let dir = backup_dir(&app)?;
    /* 只认列得出来的那几条：列表之外的旧文件即使暂时没删掉，也不该能被盲恢复。 */
    if !listed_backups(&dir)?.iter().any(|one| one.name == name) {
        return Err("备份不存在或不在可恢复列表中".to_string());
    }
    let path = dir.join(name);
    let file = read_backup(&path)?;
    check_envelope(&file)?;
    replace_backup(&app, file)
}

/// 一份备份的完整内容。
///
/// 只包含账本数据：没有主题、没有字号、没有窗口位置。界面偏好存在 `localStorage`，
/// 换台机器本来就会不一样，把它们塞进「账本」会让这份文件读起来像应用配置的垃圾桶。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupFile {
    pub(crate) format: u32,
    pub(crate) app: String,
    /// 毫秒时间戳，与账本创建、更新时间同口径。
    pub(crate) exported_at: i64,
    /// 角色 JSON 原样透传，备份层不维护前端字段。
    pub(crate) characters: Vec<serde_json::Value>,
    /// 规范化物价，含内嵌点位。
    pub(crate) prices: Vec<PriceItem>,
    /// 旧备份缺少的账本字段用默认值补齐；空表表示原备份无记录。
    #[serde(default)]
    pub(crate) income: Vec<IncomeEntry>,
    #[serde(default)]
    pub(crate) quick_prices: Vec<QuickPrice>,
    #[serde(default)]
    pub(crate) accounts: Vec<AccountEntry>,
    /// 目标 JSON 原样透传，避免前端字段变化牵动备份结构。
    #[serde(default)]
    pub(crate) goals: Vec<serde_json::Value>,
    /// 仓库随账本完整备份；v1 文件缺省为空。
    #[serde(default)]
    pub(crate) warehouse: Vec<serde_json::Value>,
    /// 上线记录按稳定字段校验。
    #[serde(default)]
    pub(crate) online: Vec<OnlineSession>,
    /// 旧备份缺省时采用默认点卡口径，独立于上线记录。
    #[serde(default)]
    pub(crate) card_settings: OnlineSettings,
}

/// 导入成功后的回执。
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    warehouse: i64,
    characters: i64,
    prices: i64,
    /// 导进来的收益条数。不看这个数，用户会以为「导入成功了、收益也回来了」，
    /// 而那份备份可能是一份只有角色与物价的旧备份。
    entries: i64,
    /// 导进来的账号记录条数。与 `entries` 分列：两张表是两本账，
    /// 合成一个「记录 N 条」会让「收益回来了、账号没回来」这件事看不见。
    accounts: i64,
    /// 导进来的目标条数。与上面同理：目标是第三样东西，不能并进任何一栏。
    goals: i64,
    /// 导进来的上线记录条数。点卡口径是单行设定，不计数（见 `store::Counts`）。
    online: i64,
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
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClearSummary {
    warehouse: i64,
    characters: i64,
    prices: i64,
    entries: i64,
    accounts: i64,
    goals: i64,
    online: i64,
}

/* ======================================================================
 * 三个命令
 * ==================================================================== */

/// 导出：系统「另存为」对话框选位置，写一份 JSON。
///
/// 先弹对话框、再读数据库：用户很可能只是点开看看位置就取消，
/// 那一刻没有任何理由去读一遍库（还得开一次 SQLite 连接）。
#[tauri::command]
#[specta::specta]
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
#[specta::specta]
pub async fn data_import(app: AppHandle) -> Result<Option<ImportSummary>, String> {
    let Some(path) = ask_open_path(&app).await? else {
        return Ok(None);
    };

    let file = read_backup(&path)?;

    check_envelope(&file)?;
    Ok(Some(replace_backup(&app, file)?))
}

/// 内置模拟账本共用新版信封校验、替换前备份与单事务替换，不走旧版转换入口。
#[tauri::command]
#[specta::specta]
pub async fn data_import_payload(app: AppHandle, raw: String) -> Result<ImportSummary, String> {
    let file = parse_backup_payload(&raw)?;
    replace_backup(&app, file)
}

fn parse_backup_payload(raw: &str) -> Result<BackupFile, String> {
    let file: BackupFile =
        serde_json::from_str(raw).map_err(|error| format!("账本内容无法解析：{error}"))?;
    check_envelope(&file)?;
    Ok(file)
}

/// 新旧两个入口共用备份、校验与事务替换，转换模块不碰数据库。
fn replace_backup(app: &AppHandle, file: BackupFile) -> Result<ImportSummary, String> {
    replace_backup_with(app, file, false)
}

fn replace_backup_with(
    app: &AppHandle,
    file: BackupFile,
    startup: bool,
) -> Result<ImportSummary, String> {
    /* 校验放在备份和替换之前：与直接保存共用身份规则，不补造 ID 或合并重复记录。 */
    let truncation = validate_backup(&file)?;

    let _writer = BACKUP_WRITER.lock().map_err(|err| err.to_string())?;
    let dir = backup_dir(app)?;
    let entries = backup_entries(&dir)?;
    // 调度标记故障不阻断账本恢复；保留旧文件，供后台下次补记后清理。
    let can_prune = last_daily_at(&dir, &entries, now_ms()).is_ok();
    let saved = match build(app) {
        Ok(current) => {
            let saved = managed_snapshot_path(&dir, AUTO_BACKUP_PREFIX, now_ms(), &entries)?;
            write_to(&saved, &current)?;
            saved
        }
        Err(error) => {
            // 损坏行会阻止 JSON 导出，但不应阻止从有效备份恢复；先完整保留原库。
            let saved = dir.join(format!("账本-recovery-before-import-{}.db", now_ms()));
            let conn = store::open(app)?;
            store::snapshot_database(&conn, &saved)
                .map_err(|snapshot_error| format!("{error}；{snapshot_error}，未执行导入"))?;
            saved
        }
    };

    /* 到这里为止的失败都还是「什么都没换」，不需要报备份路径。下面两条是替换路径上
     * 仅有的失败点，两个都要带上路径。 */
    let backup_path = saved.display().to_string();
    let mut conn =
        store::open(app).map_err(|error| format!("{error}；替换前的数据已备份到 {backup_path}"))?;
    let counts = store::replace_backup(&mut conn, file, startup)
        .map_err(|error| format!("{error}；替换前的数据已备份到 {backup_path}"))?;

    if can_prune {
        if let Ok(entries) = backup_entries(&dir) {
            prune_backups(&dir, &entries);
        }
    }
    Ok(ImportSummary {
        warehouse: counts.warehouse,
        characters: counts.characters,
        prices: counts.prices,
        entries: counts.entries,
        accounts: counts.accounts,
        goals: counts.goals,
        online: counts.online,
        truncated: truncation.points_dropped,
        truncated_items: truncation.items_over_limit,
        backup_path,
    })
}

/// 旧版读取只返回原文；预览与确认期间不写入账本。
#[tauri::command]
#[specta::specta]
pub async fn legacy_data_read(app: AppHandle) -> Result<Option<String>, String> {
    let Some(path) = ask_open_path(&app).await? else {
        return Ok(None);
    };
    read_legacy_source(&path).map(Some)
}

/// 首次空账本才读取固定旧目录；不查找备份文件，不触发文件选择框。
#[tauri::command]
#[specta::specta]
pub async fn legacy_startup_read(app: AppHandle) -> Result<Option<String>, String> {
    let mut conn = store::open(&app)?;
    if !store::claim_legacy_startup(&mut conn)? {
        return Ok(None);
    }
    let Some(path) = crate::data_dir_path().and_then(|base| {
        base.parent()
            .map(|parent| parent.join("mh-tool-v2/data.json"))
    }) else {
        return Ok(None);
    };
    match std::fs::metadata(&path) {
        Ok(_) => read_legacy_source(&path).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取旧版数据失败：{error}")),
    }
}

fn read_legacy_source(path: &Path) -> Result<String, String> {
    let size = std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_LEGACY_BACKUP_BYTES {
        return Err("旧版备份超过 16 MB，未读取".to_string());
    }
    let raw =
        std::fs::read_to_string(path).map_err(|error| format!("读取旧版备份失败：{error}"))?;
    validate_legacy_source(&raw)?;
    Ok(raw)
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportSummary {
    summary: ImportSummary,
    original_path: String,
}

/// 只提交预览时的那份原文和转换结果，不在确认后重新读取可能已变化的文件。
#[tauri::command]
#[specta::specta]
pub async fn legacy_data_import(
    app: AppHandle,
    original: String,
    converted: String,
    startup: Option<bool>,
) -> Result<LegacyImportSummary, String> {
    validate_legacy_source(&original)?;
    if converted.len() as u64 > MAX_LEGACY_BACKUP_BYTES {
        return Err("转换后的备份超过 16 MB".to_string());
    }
    let file: BackupFile =
        serde_json::from_str(&converted).map_err(|error| format!("转换结果无效：{error}"))?;
    check_envelope(&file)?;
    validate_backup(&file)?;
    let original_path = backup_dir(&app)?.join(format!("旧版原件-{}.json", now_ms()));
    std::fs::write(&original_path, original.as_bytes())
        .map_err(|error| format!("旧版原件未能留存，未执行导入：{error}"))?;
    let summary = replace_backup_with(&app, file, startup.unwrap_or(false))?;
    Ok(LegacyImportSummary {
        summary,
        original_path: original_path.display().to_string(),
    })
}

fn validate_legacy_source(raw: &str) -> Result<(), String> {
    if raw.len() as u64 > MAX_LEGACY_BACKUP_BYTES {
        return Err("旧版备份超过 16 MB".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(raw.trim_start_matches('\u{feff}'))
        .map_err(|error| format!("旧版备份不是有效 JSON：{error}"))?;
    if value["schemaVersion"].as_u64() != Some(10)
        || !value["characters"].is_array()
        || !value["transactions"].is_array()
    {
        return Err("请选择老版 v10 的完整 JSON 备份".to_string());
    }
    Ok(())
}

/// 清除：清空全部账本数据，保留 `meta`（理由见 `store::clear_all` 的注释）。
///
/// `async` 只是与旁边两个命令同一个形状：它们都要弹对话框，所以必须 `async`
/// （同步命令跑在主线程上，弹窗会卡住消息循环）；这一条没有对话框，
/// 但三个命令摆在一起时，签名不一致会让人以为「这个大概不能在等待里调」。
#[tauri::command]
#[specta::specta]
pub async fn data_clear(app: AppHandle) -> Result<ClearSummary, String> {
    let counts = store::clear_all(&app)?;
    Ok(ClearSummary {
        warehouse: counts.warehouse,
        characters: counts.characters,
        prices: counts.prices,
        entries: counts.entries,
        accounts: counts.accounts,
        goals: counts.goals,
        online: counts.online,
    })
}

/* ======================================================================
 * 速记单价的导入 / 导出
 *
 * 与上面那三个「整本账」的命令分开：那是换机器、整份恢复，这是把「59 个格子的单价」
 * 单独拿出去（发给朋友、贴进群里问行情、换台机器先带上价目）。整本账里也带单价，
 * 但为了改一个价去导一份带角色与几千条流水的备份，不是这个功能想干的事。
 *
 * ---- 为什么信封与账本备份长得一样 ----
 * `format` / `app` / `exportedAt` / `quickPrices` 四个字段与 `BackupFile` 的那几栏同名，
 * 意义也相同。好处是这份文件是账本备份的**子集**：导入时用同一个反序列化结构，多出来的
 * 字段（`characters` 之类）自然被忽略，于是「拿一份整本备份当单价文件导」也能用。
 * 反过来不成立——单价文件缺了那几栏，不能当备份导，`data_import` 会因缺字段拒绝。
 *
 * ---- 为什么导出要前端把单价递进来 ----
 * 前端内存里那一份就是当下的真值（每次改价都已整份落盘，写队列在 `persist.ts`），
 * 在这里再读一次库等于给「导出到的是哪一版」多开一种解释。递进来的东西只做序列化，
 * Rust 侧不碰数据库。
 *
 * ---- 为什么导入只把单价交回前端 ----
 * 合并（同物品覆盖、其余保留）的规则与写盘队列都在 `income-store.ts`：前端是唯一
 * 持有「当前全部单价」的地方，让它合并、让它整份写，才不会出现「库里改了、内存没改」
 * 的半截状态。命令只负责「弹窗 → 读文件 → 认信封 → 校验 → 交回去」。
 * ==================================================================== */

/// 单价文件的大小上限。真实的一份只有几 KB（59 件物品），4 MB 是它的几百倍；
/// 会碰到这个上限的是「选错了文件」（视频、日志、整本账的备份）。
const MAX_PRICE_BYTES: u64 = 4 * 1024 * 1024;

/// 一份单价文件的全部内容。字段名与 `BackupFile` 对齐（见上面那段）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PriceFile {
    format: u32,
    app: String,
    exported_at: i64,
    /// 空数组在**导出**那一侧就被拒了（没有可写的东西），导入再拒一次是因为文件可能被
    /// 手改成空的：「导入一份空文件」只会让人以为成功了、实际什么都没变。
    quick_prices: Vec<QuickPrice>,
}

/// 导出速记单价：系统「另存为」对话框选位置，写一份只含单价的 JSON。
///
/// 没有单价时**直接报错、不开对话框**：让用户先在「另存为」里挑个位置、
/// 再告诉他「没有可导出的东西」，那一步白走。
#[tauri::command]
#[specta::specta]
pub async fn quick_prices_export(
    app: AppHandle,
    prices: Vec<QuickPrice>,
) -> Result<Option<String>, String> {
    if prices.is_empty() {
        return Err("还没有设过单价，没有可导出的东西".to_string());
    }
    let name = format!("梦幻养老助手-物品单价-{}.json", now_ms());
    let Some(path) = ask_save_path(&app, name).await? else {
        return Ok(None);
    };

    let file = PriceFile {
        format: FORMAT,
        app: APP_TAG.to_string(),
        exported_at: now_ms(),
        quick_prices: prices,
    };
    write_to(&path, &file)?;
    Ok(Some(path.display().to_string()))
}

/// 导入速记单价：选文件 → 大小 / 信封 / 每条校验 → 把单价交回前端合并。
///
/// **不在这里写库**：理由见本段开头。于是「导入」在这条路上永远不会留下半份数据，
/// 唯一写盘的那一次是前端合并后的整份 `income_save`（同一个事务）。
#[tauri::command]
#[specta::specta]
pub async fn quick_prices_import(app: AppHandle) -> Result<Option<Vec<QuickPrice>>, String> {
    let Some(path) = ask_open_path(&app).await? else {
        return Ok(None);
    };

    /* 先问大小、再反序列化：这份文件来自硬盘上任意一个位置，拿几百 MB 的视频去试
     * `serde_json::from_slice`，最轻的后果是界面卡住几秒、最后报一句「不是 JSON」。 */
    let size = std::fs::metadata(&path)
        .map_err(|error| format!("读不了 {}：{error}", path.display()))?
        .len();
    if size > MAX_PRICE_BYTES {
        return Err("这个文件太大，可能不是单价文件".to_string());
    }

    let raw =
        std::fs::read(&path).map_err(|error| format!("读不了 {}：{error}", path.display()))?;
    let file: PriceFile = serde_json::from_slice(&raw)
        .map_err(|error| format!("{} 不是一份能读的单价文件：{error}", path.display()))?;

    check_tag(file.format, &file.app, "单价文件")?;
    validate_prices(&file.quick_prices)?;
    Ok(Some(file.quick_prices))
}

/// 每一条都要说得清「是哪件物品、多少钱」。
///
/// 宁可在替换/合并之前整份拒绝，也不跳过坏条目：跳过之后用户看到的是
/// 「导入成功」，而少的那几条没人会去数——下一轮行情就全按旧价记了。
fn validate_prices(prices: &[QuickPrice]) -> Result<(), String> {
    if prices.is_empty() {
        return Err("这份文件里没有单价".to_string());
    }
    for (index, one) in prices.iter().enumerate() {
        if one.item_id <= 0 {
            return Err(format!("第 {} 条单价没有物品编号", index + 1));
        }
        /* `is_finite` 单独判：JSON 里写不出 NaN / Infinity，但 `1e400` 会被解析成 `inf`，
         * 而 `inf` 落进库里就是「这件物品的价永远算不对」。 */
        if !one.price.is_finite() || one.price <= 0.0 {
            return Err(format!("第 {} 条单价的数不是正数", index + 1));
        }
    }
    Ok(())
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
    store::backup(&store::open(app)?)
}

/// 导入和恢复共用读取契约，不按文件体积拒绝本应用能导出的有效账本。
/// 直接从缓冲流解析，避免同时保留完整 JSON 字节与解析后的账本；坏文件仍在替换前拒绝。
fn read_backup(path: &Path) -> Result<BackupFile, String> {
    let input =
        std::fs::File::open(path).map_err(|error| format!("读不了 {}：{error}", path.display()))?;
    serde_json::from_reader(BufReader::new(input))
        .map_err(|error| format!("{} 不是一份能读的备份：{error}", path.display()))
}

/// 写一份 JSON 到 `path`。`BackupFile` 与 `PriceFile` 共用这一份。
///
/// 末尾补一个换行：仓库里其它 JSON（清单、种子数据、探针导出）都是这么存的，
/// 不补的话 `git diff` 会在最后一行挂一条「\ No newline at end of file」。
/// 备份文件大概率不进 git，但这份习惯值得一致——用户在编辑器里打开时也不会看到
/// 最后一行和光标贴在一起。
///
/// **先写 `.tmp` 再改名**：`std::fs::write` 是「截断 + 写」，写到一半断电 / 磁盘满会在
/// 正式名下留一个半截 JSON——而自动备份的文件名正是「导入前的数据」，用户最需要它的
/// 时候它恰好是坏的。改名是原子替换，于是正式文件总是完整。
fn write_to<T: Serialize>(path: &Path, file: &T) -> Result<(), String> {
    static NEXT_TEMP: AtomicUsize = AtomicUsize::new(0);
    let suffix = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_added_extension(format!("{}-{suffix}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut output = BufWriter::new(std::fs::File::create(&tmp)?);
        serde_json::to_writer_pretty(&mut output, file).map_err(std::io::Error::other)?;
        output.write_all(b"\n")?;
        output.flush()?;
        output.get_ref().sync_all()?;
        drop(output);
        std::fs::rename(&tmp, path)
    })();
    result.map_err(|error| {
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

/// 界面与恢复共用的可见备份，按写入顺序只留最近 `BACKUP_KEEP` 条。
///
/// 磁盘清理是尽力而为（见 `prune_backups`），删不掉的那一份会留在目录里；这里再截一次，
/// 保证「列出来的」和「能恢复的」始终是同一批，不会出现看不到的文件反而能恢复。
/// 清理成功时两者自然一致，代价只是多一次 `truncate`。
fn listed_backups(dir: &Path) -> Result<Vec<BackupEntry>, String> {
    let mut entries = backup_entries(dir)?;
    entries.truncate(BACKUP_KEEP);
    Ok(entries)
}

/// 只保留最近 `BACKUP_KEEP` 份备份，日常与「替换前」**合计**算，不再各留一套。
///
/// 只认两个前缀 + 时间戳 + `.json` 这个形状（`backup_entries` 还排除了符号链接）：
/// 用户手点的导出落在自己选的位置，就算他恰好选到 `backups/`，文件名也不是这个形状，
/// 不会被误删；旧版原件与损坏数据恢复前保存的 `.db` 原库快照同样不参与清理。
///
/// 全程尽力而为、不返回 `Err`：这是收尾动作，删不掉一份旧备份不该让一次成功的导入
/// 变成失败，也不该把「清理没做完」报成「自动备份失败」。目录读不通就直接放弃。
fn prune_backups(dir: &Path, entries: &[BackupEntry]) {
    for one in entries.iter().skip(BACKUP_KEEP) {
        let path = dir.join(&one.name);
        if let Err(error) = std::fs::remove_file(&path) {
            eprintln!(
                "清理旧备份 {} 失败（不影响本次操作）：{error}",
                path.display()
            );
        }
    }
}

/// 毫秒时间戳。
pub(crate) fn now_ms() -> i64 {
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
/// v1 按原字段读取，缺省仓库为空；更高版本不能猜字段后继续导入。
fn check_envelope(file: &BackupFile) -> Result<(), String> {
    check_tag(file.format, &file.app, "备份")
}

/// `format` 与 `app` 两个字段都得对得上。`what` 是这份文件在人话里的名字
/// （「备份」/「单价文件」），两种文件的规矩一样，只是报错时该说的名词不同。
///
/// 两个分开查，因为失配的理由不一样、该给的话也不一样：`format` 不对多半是
/// 「更新版本写的」（用户该升级应用），`app` 不对则是「这压根不是本应用的文件」
/// （用户拖进来的是别的 JSON）。合成一句「无法识别的文件」就把这条线索丢了。
///
/// 拒绝就是拒绝：不尝试「按 v1 的字段名猜一猜」。理由见模块注释里旧版 `data.json` 那一段。
fn check_tag(format: u32, app: &str, what: &str) -> Result<(), String> {
    if !(1..=FORMAT).contains(&format) {
        return Err(format!(
            "不认识的{what}格式（format={format}，本版本是 {FORMAT}）：这不是本版本导出的{what}，\
             可能是更新版本写的"
        ));
    }
    if app != APP_TAG {
        return Err(format!(
            "这不是本版本导出的{what}（app={app}，本版本是 {APP_TAG}）"
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
/// 所有业务集合先检查身份，再进入备份与替换事务，避免 OR REPLACE 静默吞行。
fn validate_backup(file: &BackupFile) -> Result<Truncation, String> {
    let truncation = validate(&file.characters, &file.prices)?;
    validate_ids(file.income.iter().map(|one| one.id.as_str()), "收益流水")?;
    validate_ids(file.accounts.iter().map(|one| one.id.as_str()), "账号记录")?;
    validate_ids(file.goals.iter().map(record_id), "目标")?;
    validate_ids(file.warehouse.iter().map(record_id), "仓库物品")?;
    validate_ids(file.online.iter().map(|one| one.id.as_str()), "上线记录")?;
    for (date, amount) in file
        .income
        .iter()
        .map(|row| (&row.date, row.amount))
        .chain(file.accounts.iter().map(|row| (&row.date, row.amount)))
    {
        if !valid_day(date) || !amount.is_finite() || amount <= 0.0 {
            return Err("账目日期或金额无效".to_string());
        }
    }
    if file.online.iter().any(|row| !valid_day(&row.date)) {
        return Err("上线记录日期无效".to_string());
    }
    let mut seen_prices = HashSet::new();
    for (index, price) in file.quick_prices.iter().enumerate() {
        if price.item_id <= 0 || !seen_prices.insert(price.item_id) {
            return Err(format!("第 {} 条速记单价的物品编号无效或重复", index + 1));
        }
    }
    for (index, goal) in file.goals.iter().enumerate() {
        validate_goal(goal, index)?;
    }
    Ok(truncation)
}

/// 与前端真实日期校验一致，不接受月底自动进位。
fn valid_day(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if bytes
        .iter()
        .enumerate()
        .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return false;
    }
    let year = value[..4].parse::<u32>().unwrap_or(0);
    let month = value[5..7].parse::<u32>().unwrap_or(0);
    let day = value[8..].parse::<u32>().unwrap_or(0);
    let days = match month {
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days
}

/// 目标以 JSON 存储，导入前必须保证当前前端能完整读取。
fn validate_goal(goal: &serde_json::Value, index: usize) -> Result<(), String> {
    let invalid = || format!("第 {} 个目标字段不完整或无效", index + 1);
    let kind = goal
        .get("kind")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if !matches!(kind, "growth" | "money" | "gear" | "manual" | "combo") {
        return Err(invalid());
    }
    let target = goal
        .get("target")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.0);
    let composite = kind == "combo"
        || (kind == "growth" && goal.get("items").is_some() && goal["tracking"].is_null());
    if !composite && (!target.is_finite() || target <= 0.0) {
        return Err(invalid());
    }
    let members = goal
        .get("members")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(invalid)?;
    if members.is_empty() {
        return Err(invalid());
    }
    validate_ids(
        members.iter().map(record_id),
        &format!("目标 {} 的角色", index + 1),
    )?;
    if composite {
        let items = goal["items"].as_array().ok_or_else(invalid)?;
        if items.is_empty() {
            return Err(invalid());
        }
        let mut keys = HashSet::new();
        let mut covered = HashSet::new();
        for item in items {
            let character_id = item["characterId"].as_str().unwrap_or_default();
            let category = item["tracking"]["category"].as_str().unwrap_or_default();
            let key = item["tracking"]["key"].as_str().unwrap_or_default().trim();
            let value = item["target"].as_f64().unwrap_or(0.0);
            if !members
                .iter()
                .any(|member| record_id(member) == character_id)
                || !matches!(category, "level" | "skill" | "assist" | "training" | "attr")
                || key.is_empty()
                || !value.is_finite()
                || value <= 0.0
                || value.fract() != 0.0
                || value > 9_007_199_254_740_991.0
                || !keys.insert((character_id, category, key))
            {
                return Err(invalid());
            }
            covered.insert(character_id);
        }
        if members
            .iter()
            .any(|member| !covered.contains(record_id(member)))
        {
            return Err(invalid());
        }
    } else if kind == "growth" {
        let tracking = &goal["tracking"];
        let category = tracking["category"].as_str().unwrap_or_default();
        let key = tracking["key"].as_str().unwrap_or_default();
        if !matches!(category, "level" | "skill" | "assist" | "training" | "attr")
            || key.trim().is_empty()
        {
            return Err(invalid());
        }
    }
    if let Some(deadline) = goal.get("deadline") {
        let value = deadline.as_str().ok_or_else(invalid)?;
        if !value.is_empty() && !valid_day(value) {
            return Err(invalid());
        }
    }
    if let Some(logs) = goal.get("logs") {
        let logs = logs.as_array().ok_or_else(invalid)?;
        // 先校验身份，使重复/缺失 ID 的回执保持具体。
        validate_ids(
            logs.iter().map(record_id),
            &format!("目标 {} 的流水", index + 1),
        )?;
        for log in logs {
            let date = log["date"].as_str().unwrap_or_default();
            let delta = log["delta"].as_f64().unwrap_or(0.0);
            if !valid_day(date) || !delta.is_finite() || delta == 0.0 {
                return Err(format!("第 {} 个目标的流水日期或数值无效", index + 1));
            }
        }
    }
    Ok(())
}

fn record_id(record: &serde_json::Value) -> &str {
    record
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
}

fn validate_ids<'a>(ids: impl Iterator<Item = &'a str>, label: &str) -> Result<(), String> {
    let mut seen = HashSet::new();
    for (index, id) in ids.enumerate() {
        if id.trim().is_empty() {
            return Err(format!("第 {} 条{label}没有 id", index + 1));
        }
        if id != id.trim() {
            return Err(format!("第 {} 条{label}的 id 含首尾空白", index + 1));
        }
        if !seen.insert(id) {
            return Err(format!("第 {} 条{label}的 id「{id}」与前面重复", index + 1));
        }
    }
    Ok(())
}

fn validate(characters: &[serde_json::Value], prices: &[PriceItem]) -> Result<Truncation, String> {
    store::validate_record_ids(characters, "角色")?;

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
            if !valid_day(&point.date) || !point.price.is_finite() || point.price <= 0.0 {
                return Err(format!("第 {} 件物价的价格日期或数值无效", index + 1));
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

// 纯逻辑与文件测试；窗口交互由真 Tauri 烟测覆盖。

#[cfg(test)]
mod tests;
