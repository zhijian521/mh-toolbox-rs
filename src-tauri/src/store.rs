//! 本地数据层：物价与（将来的）角色名册落在同一个 SQLite 文件里。
//!
//! ## 为什么是「整份读写」而不是增量
//!
//! 前端原先用 `localStorage` 存整份数组，换过来时保持同一语义最省事：一次 `save`
//! 写库、一次 `load` 读全量。几十件物品、几百条价格，整份也就几十 KB，
//! 而增量（upsert / delete / 排序游标）会立刻引出「谁删了这一条」「并发写怎么合」
//! 这类问题——等到数据量真的撑不住再改，那时才有真实的性能数据可用。
//!
//! ## 为什么加 `meta` 表
//!
//! 两件事：`schemaVersion` 让将来的表结构变更有个判断依据；`legacyImported`
//! 记录「localStorage 的老数据已经搬过一次」，避免每次启动都重复导入、把用户
//! 后来删掉的条目又搬回来。

use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 数据库文件名。放在 app data 目录下——跟着应用走，卸载才清。
const DB_FILE: &str = "mh-toolbox.db";

/// 表结构版本。**改表就要 +1**，并在 `open` 的建表语句里补上迁移分支。
/// 第一期只有 v1，所以这里还没有按版本分支的逻辑。
const SCHEMA_VERSION: i64 = 1;

/// 一条价格记录。字段名与前端 `PricePoint` 一一对应（`serde` 自动转 camelCase）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricePoint {
    pub id: String,
    /// `YYYY-MM-DD`。前端已校验过日历有效性，这里只当字符串存。
    pub date: String,
    pub price: f64,
    pub note: String,
    pub created_at: i64,
}

/// 一件物品。`points` 是它的全部历史，读出来时按日期倒序。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub sub: String,
    pub unit: String,
    pub note: String,
    pub points: Vec<PricePoint>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 数据库文件路径。目录不存在就先建——首次启动时 `app_data_dir` 可能还没被创建。
fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("拿不到应用数据目录：{error}"))?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("建不了应用数据目录：{error}"))?;
    Ok(dir.join(DB_FILE))
}

/// 打开连接并保证表结构就绪。
///
/// 每次命令打开一次连接：SQLite 打开一个本地文件是微秒级，而把 `Connection`
/// 塞进 `State<Mutex<..>>` 会让每个命令都变成「先抢锁」——数据量这个级别不值得。
/// `journal_mode = WAL` 是为了崩溃恢复：断电时最多丢最后一次事务，而不是整个库。
fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|error| format!("打不开数据库：{error}"))?;
    /* 外键约束默认是关的（SQLite 的历史包袱），删物品时级联删价格要靠它。 */
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("设置外键约束失败：{error}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("设置 WAL 模式失败：{error}"))?;
    init(&conn)?;
    Ok(conn)
}

/// 建表。全部 `IF NOT EXISTS`，可以反复执行。
fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS price_items (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            category   TEXT NOT NULL,
            sub        TEXT NOT NULL,
            unit       TEXT NOT NULL,
            note       TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS price_points (
            id         TEXT PRIMARY KEY,
            item_id    TEXT NOT NULL REFERENCES price_items(id) ON DELETE CASCADE,
            date       TEXT NOT NULL,
            price      REAL NOT NULL,
            note       TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        /* 读一件物品的历史永远带 `WHERE item_id = ? ORDER BY date DESC`，
         * 复合索引让这条查询走覆盖索引，不必回表。 */
        CREATE INDEX IF NOT EXISTS idx_price_points_item
            ON price_points(item_id, date DESC);

        /* 卡片按「最近更新」排，列表页每次都要 ORDER BY updated_at。 */
        CREATE INDEX IF NOT EXISTS idx_price_items_updated
            ON price_items(updated_at DESC);",
    )
    .map_err(|error| format!("建表失败：{error}"))?;

    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schemaVersion', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SCHEMA_VERSION.to_string()],
    )
    .map_err(|error| format!("写 schema 版本失败：{error}"))?;

    Ok(())
}

/// 读库里的 `meta` 值。没有就返回 `None`。
fn read_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", params![key], |row| {
        row.get::<_, String>(0)
    })
    .optional()
    .map_err(|error| format!("读 meta 失败：{error}"))
}

/// 写一条 `meta`。
fn write_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
    .map_err(|error| format!("写 meta 失败：{error}"))
}

/// 读全部物品（含各自的历史）。
///
/// 两次查询而不是一次 join：一件物品的历史条数不定，join 出来要在 Rust 侧
/// 去重合并，反而更绕。数据量在千条以内，两次顺序查询快得看不出差别。
#[tauri::command]
pub fn prices_load(app: AppHandle) -> Result<Vec<PriceItem>, String> {
    let conn = open(&app)?;

    let mut points_by_item: HashMap<String, Vec<PricePoint>> = HashMap::new();
    let mut point_stmt = conn
        .prepare(
            "SELECT item_id, id, date, price, note, created_at
             FROM price_points ORDER BY date DESC, created_at DESC",
        )
        .map_err(|error| format!("准备价格查询失败：{error}"))?;
    let point_rows = point_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                PricePoint {
                    id: row.get(1)?,
                    date: row.get(2)?,
                    price: row.get(3)?,
                    note: row.get(4)?,
                    created_at: row.get(5)?,
                },
            ))
        })
        .map_err(|error| format!("读价格失败：{error}"))?;
    for row in point_rows {
        let (item_id, point) = row.map_err(|error| format!("解析价格失败：{error}"))?;
        points_by_item.entry(item_id).or_default().push(point);
    }

    let mut item_stmt = conn
        .prepare(
            "SELECT id, name, category, sub, unit, note, created_at, updated_at
             FROM price_items ORDER BY updated_at DESC",
        )
        .map_err(|error| format!("准备物品查询失败：{error}"))?;
    let item_rows = item_stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(PriceItem {
                points: Vec::new(),
                id,
                name: row.get(1)?,
                category: row.get(2)?,
                sub: row.get(3)?,
                unit: row.get(4)?,
                note: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("读物品失败：{error}"))?;

    let mut items = Vec::new();
    for row in item_rows {
        let mut item = row.map_err(|error| format!("解析物品失败：{error}"))?;
        item.points = points_by_item.remove(&item.id).unwrap_or_default();
        items.push(item);
    }

    Ok(items)
}

/// 整份写回。
///
/// **先清后写，全程一个事务**：中途 `?` 失败会整体回滚，不会留下「删光了但没写上」
/// 的半截状态。整份替换而不是逐条 upsert，是因为前端每次保存都持有完整列表，
/// 逐条比对反而要额外记住上一次的快照。
#[tauri::command]
pub fn prices_save(app: AppHandle, items: Vec<PriceItem>) -> Result<(), String> {
    let mut conn = open(&app)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    tx.execute("DELETE FROM price_points", [])
        .map_err(|error| format!("清空价格失败：{error}"))?;
    tx.execute("DELETE FROM price_items", [])
        .map_err(|error| format!("清空物品失败：{error}"))?;

    for item in &items {
        tx.execute(
            "INSERT INTO price_items (id, name, category, sub, unit, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                item.name,
                item.category,
                item.sub,
                item.unit,
                item.note,
                item.created_at,
                item.updated_at
            ],
        )
        .map_err(|error| format!("写入物品「{}」失败：{error}", item.name))?;

        for point in &item.points {
            tx.execute(
                "INSERT INTO price_points (id, item_id, date, price, note, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![point.id, item.id, point.date, point.price, point.note, point.created_at],
            )
            .map_err(|error| format!("写入价格「{}」失败：{error}", point.date))?;
        }
    }

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 老数据搬过一次没有。前端在启动时先问这一句，再决定要不要把 `localStorage` 搬过来。
#[tauri::command]
pub fn prices_legacy_imported(app: AppHandle) -> Result<bool, String> {
    let conn = open(&app)?;
    Ok(read_meta(&conn, "pricesLegacyImported")?.is_some())
}

/// 标记「老数据已搬完」。
#[tauri::command]
pub fn prices_mark_legacy_imported(app: AppHandle) -> Result<(), String> {
    let conn = open(&app)?;
    write_meta(&conn, "pricesLegacyImported", "1")
}
