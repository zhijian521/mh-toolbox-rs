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
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 数据库文件名。放在 `%APPDATA%\mh-tool-v2` 下——与旧版 Electron 共用同一个目录，
/// 卸载也不清（`deleteAppDataOnUninstall: false`）。红线 1 见 `AGENTS.md` §六。
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

/* ======================================================================
 * 打开数据库：分两层
 *
 * `base_dir(app)` 只回答「目录在哪儿」，`open_at(base)` 只回答「怎么开」。
 * 拆开的理由不是好看：命令签名直接吃 `AppHandle` 时整个文件一条测试都写不了——
 * 构造 `AppHandle` 要起 Tauri 运行时。现在测试对着临时目录跑，跟命令走同一条代码。
 *
 * **迁移不在这里**，在 `lib.rs` 的 `setup()` 里调一次（见 `migrate_legacy_db` 的注释：
 * 留在这里会被两条并发的启动命令同时触发）。
 * ==================================================================== */

/// 数据目录：红线 1 的 `%APPDATA%\mh-tool-v2`。
///
/// `crate::data_dir_path()` 是这条红线的唯一真源；`None`（`APPDATA` 缺失：服务账户、
/// 极端精简环境）时才退到 `app_data_dir()`。**这条兜底只为「能用」**，正常路径永远
/// 不该走到它——走到就意味着数据落在 identifier 目录下，与旧版对不上。
pub(crate) fn base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match crate::data_dir_path() {
        Some(dir) => Ok(dir),
        None => app
            .path()
            .app_data_dir()
            .map_err(|error| format!("拿不到应用数据目录：{error}")),
    }
}

/// 在 `base` 目录下打开数据库并保证表结构就绪。
///
/// 目录不存在就先建——首次启动时它可能还没被创建。**这里是唯一的 `Connection::open`**，
/// 命令与测试走同一条路径，测出来的就是真跑的那条。
pub(crate) fn open_at(base: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(base).map_err(|error| format!("建不了数据目录：{error}"))?;
    let path = base.join(DB_FILE);
    let conn = Connection::open(&path).map_err(|error| format!("打不开数据库：{error}"))?;
    /* 外键约束默认是关的（SQLite 的历史包袱），删物品时级联删价格要靠它。 */
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("设置外键约束失败：{error}"))?;
    /* WAL 为了崩溃恢复：断电时最多丢最后一次事务，而不是整个库。 */
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("设置 WAL 模式失败：{error}"))?;
    init(&conn)?;
    Ok(conn)
}

/// 打开连接。
///
/// 每次命令打开一次连接：SQLite 打开一个本地文件是微秒级，而把 `Connection`
/// 塞进 `State<Mutex<..>>` 会让每个命令都变成「先抢锁」——数据量这个级别不值得。
///
/// **这里只开库，不迁移**。迁移放在 `lib.rs` 的 `setup()` 里跑一次：留在这里的话，
/// `main.ts` 的 `Promise.all([loadPrices(), loadRoster()])` 会让两个命令几乎同时进来，
/// 两边都判断「目标不存在」、都去复制同一份源，后一个把前一个正在写的文件截断，
/// 最坏留下一个 SQLite 认作合法的空库——那之后再也不会重试。详见 `migrate_legacy_db`。
fn open(app: &AppHandle) -> Result<Connection, String> {
    open_at(&base_dir(app)?)
}

/// 把「老版本写在 identifier 目录下」的库搬进 `base`。
///
/// 只干一件事：问系统要旧目录。拿不到说明这台机器上不存在「旧位置」这回事，直接 `Ok`。
/// 其余判断与复制全在 `migrate_between`——那个函数不吃 `AppHandle`，于是失败现场能用
/// 两个临时目录造出来，中间那条「复制一半」的回退路径才测得到。
///
/// **唯一调用点是 `lib.rs` 的 `setup()`，在建窗之前。** 不要挪回 `open()`：
/// 每个 `#[tauri::command]` 都会调 `open()`，而前端启动时 `loadPrices()` 与
/// `loadRoster()` 是 `Promise.all` 并发发出的，两个迁移会同时看到「目标不存在」，
/// 同时 `std::fs::copy` 到同一个目标——后来的 `File::create` 截断前一个正在写的文件，
/// 可能留下一个 SQLite 认作合法的空库；`target.exists()` 从此为真，重试路径永久关闭，
/// 用户看到的是「空表 + 不报错」。那个窗口是我们加迁移逻辑才出现的，别把它放回去。
pub(crate) fn migrate_legacy_db(app: &AppHandle, base: &Path) -> Result<(), String> {
    let Ok(legacy_base) = app.path().app_data_dir() else {
        return Ok(());
    };
    migrate_between(&legacy_base, base)
}

/// 从 `legacy_base` 把库（连同 WAL 两件）搬到 `base`。
///
/// 来由：2026-11-03 之前的版本用 `app.path().app_data_dir()` 取目录，库文件实际落在
/// `%APPDATA%\com.zhijian.mhtoolbox.rs\mh-toolbox.db`，而红线 1 要求的是
/// `%APPDATA%\mh-tool-v2`。改路径本身是修 bug，但**不改就等于让用户已有的账本消失**，
/// 所以第一次走到新路径时先搬过来。
///
/// 三条规矩：
/// 1. **只在目标不存在时搬**。目标已经有库（哪怕只有一张空表）说明新路径已经在用了，
///    这时再从旧位置覆盖一次，会把用户新记的东西冲掉。
/// 2. **WAL 三件套一起搬**（`.db` / `.db-wal` / `.db-shm`）。WAL 模式下最近的事务
///    可能还在 `-wal` 里没 checkpoint 进主库，只复制主库就是丢掉最后几笔录入。
/// 3. **正式文件名在任何时刻要么不存在、要么是完整的**，不许拿一个空库继续启动。
///
/// 第 3 条是靠 **先复制到 `.tmp`、全部成功后再逐个 `rename`** 做到的，不是靠「失败时把
/// 已经复制的那几个删掉」。后者必然漏一个：`std::fs::copy` 是「先 `File::create`
/// 截断目标再往里写」，写阶段失败（ENOSPC / EIO）会在正式名下留一个**半截文件**，
/// 而它并不在「已经复制成功」的集合里，删不到——下一次启动 `target.exists()` 为真就
/// 早退当作「已迁移」，一次看得见的失败变成永久的数据缺失。`rename` 是原子替换，
/// 于是那条缝隙从结构上就不存在。
///
/// 还有个第二半：**rename 的顺序是 shm → wal → db，主库最后出现**。三件套不是原子单位，
/// 反序让主库本身变成「迁移完成」的唯一标记——中途断电只留下「主库不存在」，
/// 下次启动照常重试；正序则可能留下「主库在、WAL 缺」，而那正是第 1 条会永久早退的状态。
///
/// 搬成功也不删旧文件：留底，与本仓 `roster.ts:500-501`「改名留底而不是删除」同一条理由。
pub(crate) fn migrate_between(legacy_base: &Path, base: &Path) -> Result<(), String> {
    let target = base.join(DB_FILE);
    if target.exists() {
        return Ok(());
    }
    let legacy = legacy_base.join(DB_FILE);
    /* `APPDATA` 缺失时 `base` 本身就是 `app_data_dir()`（见 `base_dir` 的兜底），
     * 两者同一路径，不能自己复制自己。 */
    if !legacy.exists() || legacy == target {
        return Ok(());
    }

    std::fs::create_dir_all(base).map_err(|error| format!("建不了数据目录：{error}"))?;

    /* ---- 第一步：全部复制到 `.tmp`（正式名一个都不碰） ----
     * 顺序仍必须是 db → wal → shm：主库先落地，后面两件才能被 SQLite 认作它的 WAL。 */
    let mut staged: Vec<&str> = Vec::new();
    for suffix in ["", "-wal", "-shm"] {
        let from = legacy_base.join(format!("{DB_FILE}{suffix}"));
        if !from.exists() {
            continue;
        }
        let tmp = base.join(format!("{DB_FILE}{suffix}.tmp"));
        if let Err(error) = std::fs::copy(&from, &tmp) {
            /* 失败的那一件本身也可能留下半截 `.tmp`，一并删（它不在 `staged` 里）。
             * 清理自身的错误用 `let _ =` 吞掉——现在要说的是**复制为什么失败**，
             * 一条「删不掉临时文件」的错误盖上去只会让人查错方向。 */
            for done in &staged {
                let _ = std::fs::remove_file(base.join(format!("{DB_FILE}{done}.tmp")));
            }
            let _ = std::fs::remove_file(&tmp);
            return Err(format!(
                "把旧数据库 {} 搬到 {} 失败，已中止启动以免覆盖原有数据；\
                 已清理本次不完整的复制，下次启动会重试：{error}",
                from.display(),
                tmp.display()
            ));
        }
        staged.push(suffix);
    }

    /* ---- 第二步：全部成功后逐个改名成正式名，**反序：shm → wal → db** ----
     *
     * 为什么反序：三件套不是一个原子单位。若主库最先就位、紧接着断电，正式
     * `mh-toolbox.db` 会在位而 `-wal` 还叫 `.tmp`——下一次启动开头那个
     * `target.exists()` 直接早退，`-wal` 里那几笔没 checkpoint 的记录**永久丢失、
     * 且永远不会重试**。反序之后主库是**最后一个**出现的文件，它本身就成了
     * 「迁移完成」的唯一标记：中途断掉只会表现为「主库不存在」，下次启动照常重来。
     *
     * 重试时目标位置可能残留上一轮改名成功的 `-shm` / `-wal`（主库没赶上）。
     * 那不会挡住 rename：`std::fs::rename` 在 Windows 走 `MoveFileExW` 带
     * `MOVEFILE_REPLACE_EXISTING`、在 Unix 是 `rename(2)`，目标已存在一律覆盖。
     *
     * 改到一半失败（几乎只剩权限 / 目标被占这类可能）仍要回退：已经改成正式名的
     * 必须删掉，否则主库已就位、下次启动又早退。 */
    let mut renamed: Vec<&str> = Vec::new();
    for suffix in staged.iter().rev() {
        let tmp = base.join(format!("{DB_FILE}{suffix}.tmp"));
        let to = base.join(format!("{DB_FILE}{suffix}"));
        if let Err(error) = std::fs::rename(&tmp, &to) {
            for done in &renamed {
                let _ = std::fs::remove_file(base.join(format!("{DB_FILE}{done}")));
            }
            /* 剩下的 `.tmp` 全删。已改名的那几件已经没有 `.tmp` 了，`remove_file`
             * 返回 NotFound 也无所谓——失败分支里不做区分，反正结果都是「不做」。 */
            for left in &staged {
                let _ = std::fs::remove_file(base.join(format!("{DB_FILE}{left}.tmp")));
            }
            return Err(format!(
                "把旧数据库 {} 搬到 {} 失败，已中止启动以免覆盖原有数据；\
                 已清理本次不完整的复制，下次启动会重试：{error}",
                legacy.display(),
                to.display()
            ));
        }
        renamed.push(*suffix);
    }
    Ok(())
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
            ON price_items(updated_at DESC);

        /* 角色名册：结构深且还在演进，一列 JSON 存整条记录。
         * `sort_order` 保留数组顺序——名册是「用户排的顺序」，不是按 id 或名字排的。
         * 没有按字段查询的需求，拆十几张表只会让每次加字段都变成一次 migration。 */
        CREATE TABLE IF NOT EXISTS characters (
            id         TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            sort_order INTEGER NOT NULL
        );",
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
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
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
    load_items(&conn)
}

/// `prices_load` 的本体。命令只负责「怎么拿到连接」，这里只管 SQL——
/// 于是它可以在测试里直接对着一个临时目录跑。
fn load_items(conn: &Connection) -> Result<Vec<PriceItem>, String> {
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
    save_items(&mut conn, &items)
}

/// `prices_save` 的本体（事务在这里）。`Transaction` 在 `?` 提前返回时被 drop，
/// rusqlite 的默认 drop 行为是**回滚**——这就是「整体回滚」的实现，不需要手写 rollback。
fn save_items(conn: &mut Connection, items: &[PriceItem]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    tx.execute("DELETE FROM price_points", [])
        .map_err(|error| format!("清空价格失败：{error}"))?;
    tx.execute("DELETE FROM price_items", [])
        .map_err(|error| format!("清空物品失败：{error}"))?;

    for item in items {
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
                params![
                    point.id,
                    item.id,
                    point.date,
                    point.price,
                    point.note,
                    point.created_at
                ],
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

/* ======================================================================
 * 角色名册
 *
 * 与物价不同，这里用 `serde_json::Value` 透传整条记录：结构深、字段还在演进，
 * 而唯一的操作就是「整份读 / 整份写」。Rust 侧不需要认识任何字段，
 * 也就不会因为前端加了一个属性而漏写。真正把关的是前端 `normalizeCharacter`。
 * ==================================================================== */

/// 读整份名册，按 `sort_order` 还原顺序。
///
/// **一行坏 JSON 不拖垮整份**：跳过它、`eprintln!` 留一条带 `sort_order` 的痕迹，其余照常
/// 返回。早先这里是「任一行解析失败就整份 `Err`」，后果比坏掉那一行严重得多——
/// 前端 `charactersLoad` 拿到 `null` 后立起 `loadError`、名册空白、写入口全禁，
/// 而界面没有任何「修掉这一行」的入口，等于**永久打不开**。宁可少显示一个角色。
///
/// 返回类型仍是 `Vec<serde_json::Value>`，前端契约不变；坏行留在库里没被删，
/// 下次 `characters_save` 整份覆盖时会自然消失。
#[tauri::command]
pub fn characters_load(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open(&app)?;
    load_characters(&conn)
}

/// `characters_load` 的本体。与 `load_items` 同一个理由拆出来：能对着临时目录测。
fn load_characters(conn: &Connection) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare("SELECT sort_order, data FROM characters ORDER BY sort_order")
        .map_err(|error| format!("准备名册查询失败：{error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("读名册失败：{error}"))?;

    let mut list = Vec::new();
    for row in rows {
        /* 连「取这一行」都失败才算致命：那是游标坏了，不是某一条数据坏了。 */
        let (sort_order, raw) = row.map_err(|error| format!("解析名册行失败：{error}"))?;
        match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(value) => list.push(value),
            Err(error) => {
                eprintln!("角色名册有一行不是合法 JSON（sort_order={sort_order}），已跳过：{error}")
            }
        }
    }
    Ok(list)
}

/// 整份写回。同样是一个事务；`OR REPLACE` 容忍前端传来重复 id（名册编辑时可能撞上）。
#[tauri::command]
pub fn characters_save(app: AppHandle, items: Vec<serde_json::Value>) -> Result<(), String> {
    let mut conn = open(&app)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;
    tx.execute("DELETE FROM characters", [])
        .map_err(|error| format!("清空名册失败：{error}"))?;

    for (index, item) in items.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("row-{index}"));
        let data = serde_json::to_string(item)
            .map_err(|error| format!("序列化第 {index} 个角色失败：{error}"))?;
        tx.execute(
            "INSERT OR REPLACE INTO characters (id, data, sort_order) VALUES (?1, ?2, ?3)",
            params![id, data, index as i64],
        )
        .map_err(|error| format!("写入第 {index} 个角色失败：{error}"))?;
    }

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 名册的 `localStorage` 老数据搬过一次没有。
#[tauri::command]
pub fn characters_legacy_imported(app: AppHandle) -> Result<bool, String> {
    let conn = open(&app)?;
    Ok(read_meta(&conn, "charactersLegacyImported")?.is_some())
}

/// 标记「名册老数据已搬完」。
#[tauri::command]
pub fn characters_mark_legacy_imported(app: AppHandle) -> Result<(), String> {
    let conn = open(&app)?;
    write_meta(&conn, "charactersLegacyImported", "1")
}

/* ======================================================================
 * 清空：给「设置 → 数据 → 清除」用，也给导入前那一手用（导入 = 整体替换）
 * ==================================================================== */

/// 清空角色与物价，返回 (角色数, 物品数) 供界面提示。
///
/// **不动 `meta`**：`charactersLegacyImported` / `pricesLegacyImported` 这类迁移标记
/// 一旦清掉，下次启动 `roster.ts` / `prices-store.ts` 会把旧 `localStorage` 里的数据
/// **再搬一遍**——用户刚清干净，重启又回来一批，那是这个功能最不该有的样子。
/// `schemaVersion` 也在同一张表里，删它没有好处。
///
/// 三条 `DELETE` 显式写出来，不依赖 `ON DELETE CASCADE`：级联只在
/// `PRAGMA foreign_keys = ON` 时成立，而这个 pragma **是按连接设的**
/// （`open_at` 里为了别的场景打开过它，但那是「每次开到新连接都要记得再设一遍」的约定）。
/// 依赖它的后果不对称：漏删 `price_points` 不会报任何错，只会在库里攒一堆指向
/// 不存在物品的价格行，而下一次 `prices_save` 也是先清后写，**这些孤儿永远没人收拾**。
/// 显式三条把这个隐患从执行路径上摘掉，代价只是多写两行。
pub(crate) fn clear_all(app: &AppHandle) -> Result<(i64, i64), String> {
    let mut conn = open(app)?;
    clear_records(&mut conn)
}

/// `clear_all` 的本体。与 `load_items` / `save_items` 同一个理由拆出来：
/// **能对着临时目录跑的那一半**留在这里，`AppHandle` 只留在薄薄的外壳上。
/// 于是「清空之后 `meta` 还在」这条设计可以写成测试，而不是只写在注释里。
fn clear_records(conn: &mut Connection) -> Result<(i64, i64), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    /* 顺序是 price_points → price_items → characters：子表先走。
     * 反过来虽然在本机的连接上（外键开着）也能过——级联会把子行带走——
     * 但那样就又把结果挂回 pragma 上了，正是上一条注释要避免的。 */
    tx.execute("DELETE FROM price_points", [])
        .map_err(|error| format!("清空价格失败：{error}"))?;
    let items = tx
        .execute("DELETE FROM price_items", [])
        .map_err(|error| format!("清空物品失败：{error}"))?;
    let characters = tx
        .execute("DELETE FROM characters", [])
        .map_err(|error| format!("清空名册失败：{error}"))?;

    /* 这里**故意没有** `DELETE FROM meta`。删了它两次「清空」之间只差一行代码，
     * 而后果是下次启动整份老数据复活（见 `clear_all` 的注释）。`meta` 里只有三类东西：
     * `schemaVersion`（删了 `init` 会补回来，但补的是「当前版本」这句话本身没有意义）、
     * 两个 `*LegacyImported` 标记（删了就重新搬）、以及将来的迁移标记（同理）。 */
    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok((characters as i64, items as i64))
}

/* ======================================================================
 * 测试
 *
 * 全部直接对着一个临时目录里的 `Connection` 跑，**不构造 `AppHandle`**——
 * 那要起 Tauri 运行时，测试就不再是「一个函数 + 一个文件」了。这也正是把
 * `open_at` / `load_items` / `save_items` 从命令里拆出来的原因。
 *
 * 临时目录用 `std::env::temp_dir()` + `pid` + 序号手搓，**不新增 `tempfile` 依赖**：
 * 只为一件事引一个 crate，还得跟 `cargo` 的 feature 解析打交道，不划算。
 * 序号区分用例（同一进程里 `pid` 相同），`Drop` 负责收尾——`cargo test` 中途断言
 * 失败时 `Drop` 照样跑，不会在 `%TEMP%` 里留一地库文件。
 * ==================================================================== */

#[cfg(test)]
mod tests {
    use super::*;

    /// 一次性目录，离开作用域就删。
    struct TempDir {
        path: std::path::PathBuf,
    }

    impl TempDir {
        /// `seq` 是「第几个用例」，与 pid 一起构成唯一目录名。
        fn new(seq: u32) -> Self {
            let path =
                std::env::temp_dir().join(format!("mh-toolbox-test-{}-{seq}", std::process::id()));
            /* 上一轮被 kill 掉时可能残留，先清干净再建——否则上一轮的库文件
             * 会让「首次打开」的断言读到别人的数据。 */
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("建测试临时目录");
            Self { path }
        }

        fn base(&self) -> &std::path::Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn point(id: &str, date: &str, price: f64, created_at: i64) -> PricePoint {
        PricePoint {
            id: id.to_string(),
            date: date.to_string(),
            price,
            note: String::new(),
            created_at,
        }
    }

    fn item(id: &str, name: &str, points: Vec<PricePoint>) -> PriceItem {
        PriceItem {
            id: id.to_string(),
            name: name.to_string(),
            category: "宝石".to_string(),
            sub: "黑宝石".to_string(),
            unit: "颗".to_string(),
            note: String::new(),
            points,
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
        }
    }

    /// 建表必须幂等：每次命令都 `open` 一次，这条路要走几千遍。
    #[test]
    fn open_at_twice_is_fine() {
        let dir = TempDir::new(1);

        let first = open_at(dir.base()).expect("第一次打开数据库");
        drop(first);
        let second = open_at(dir.base()).expect("第二次打开数据库");

        let items_count: i64 = second
            .query_row("SELECT COUNT(*) FROM price_items", [], |row| row.get(0))
            .expect("查物品表");
        let points_count: i64 = second
            .query_row("SELECT COUNT(*) FROM price_points", [], |row| row.get(0))
            .expect("查价格表");
        let characters_count: i64 = second
            .query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))
            .expect("查名册表");
        assert_eq!(
            (items_count, points_count, characters_count),
            (0, 0, 0),
            "新库里三张表都该是空的"
        );
        /* `init` 每次都把 `schemaVersion` 覆写成当前版本，跑两遍不该报错也不该漂。 */
        assert_eq!(
            read_meta(&second, "schemaVersion").expect("读 schemaVersion"),
            Some(SCHEMA_VERSION.to_string())
        );
    }

    /// 写进去的能原样读回来，且一件物品下的历史按 `date DESC` 排——
    /// 这张卡上「最新一行在最上」是界面的默认预期，不靠前端再排一次。
    #[test]
    fn save_then_load_round_trips_in_date_desc() {
        let dir = TempDir::new(2);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        /* 故意让插入顺序与日期顺序相反：读回来若按插入顺序，断言就会挂。 */
        let sample = item(
            "item-1",
            "黑宝石",
            vec![
                point("p-old", "2026-01-02", 12.0, 1_700_000_000_001),
                point("p-new", "2026-03-05", 18.5, 1_700_000_000_002),
            ],
        );
        save_items(&mut conn, &[sample]).expect("写入一件物品");

        let loaded = load_items(&conn).expect("读回物价表");
        assert_eq!(loaded.len(), 1, "只写了一件，就该读回一件");

        let one = &loaded[0];
        assert_eq!(one.id, "item-1");
        assert_eq!(one.name, "黑宝石");
        assert_eq!(one.category, "宝石");
        assert_eq!(one.sub, "黑宝石");
        assert_eq!(one.unit, "颗");
        assert_eq!(one.points.len(), 2, "两条历史都要读回来");
        assert_eq!(
            one.points
                .iter()
                .map(|p| p.date.as_str())
                .collect::<Vec<_>>(),
            vec!["2026-03-05", "2026-01-02"],
            "历史要按 date 倒序，与插入顺序无关"
        );
        assert_eq!(one.points[0].price, 18.5);
        assert_eq!(one.points[0].id, "p-new");
    }

    /// 写一半撞 `PRIMARY KEY` 时必须整体回滚：表里还是上一份能用的数据，
    /// 不是「删光了 + 只写进去一半」。这是 `save` 那段「先清后写」的全部依据。
    #[test]
    fn save_rolls_back_when_a_row_conflicts() {
        let dir = TempDir::new(3);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        save_items(&mut conn, &[item("keep", "老数据", vec![])]).expect("先落一份能用的数据");

        /* 两条同一个 id：第二条 INSERT 撞 `price_items.id` 的主键，
         * 此时第一条已经写进去了、旧数据也已经删了——不回滚就是半截库。 */
        let duplicated = vec![item("dup", "重复甲", vec![]), item("dup", "重复乙", vec![])];
        let error = save_items(&mut conn, &duplicated).expect_err("id 重复必须失败");
        assert!(
            error.contains("写入物品"),
            "错误要说清是哪一条失败的，实际是：{error}"
        );

        let loaded = load_items(&conn).expect("读回物价表");
        assert_eq!(loaded.len(), 1, "整体回滚后只剩原来那一份");
        assert_eq!(loaded[0].id, "keep");
        assert_eq!(loaded[0].name, "老数据");
    }

    /* ---------- 迁移：三件套搬运 ----------
     * 这三个用例吃的是 `migrate_between`（两个目录，不要 `AppHandle`），
     * 所以「复制到一半失败」这种现场也能造：往一个同名**目录**上 copy 必失败。
     */

    /// 主库 + `-wal` + `-shm` 三件都要落地，且逐字节与源一致。
    /// 只搬主库会丢掉还没 checkpoint 的那几笔，所以这里不是「多复制了两个文件」。
    #[test]
    fn migrate_between_copies_all_three_wal_files() {
        let legacy = TempDir::new(4);
        let base = TempDir::new(5);

        /* 三个不同内容：一旦串了文件名，字节断言会立刻发现。 */
        let sources: [(&str, &[u8]); 3] = [
            ("", b"main-db-bytes"),
            ("-wal", b"wal-bytes"),
            ("-shm", b"shm-bytes"),
        ];
        for (suffix, bytes) in sources {
            std::fs::write(legacy.base().join(format!("{DB_FILE}{suffix}")), bytes)
                .expect("写旧库文件");
        }

        migrate_between(legacy.base(), base.base()).expect("三件套都该搬成功");

        for (suffix, bytes) in sources {
            let copied = std::fs::read(base.base().join(format!("{DB_FILE}{suffix}")))
                .unwrap_or_else(|error| panic!("目标里没有 {suffix}：{error}"));
            assert_eq!(copied, bytes.to_vec(), "{suffix} 的内容应与源逐字节相同");
        }
        /* 成功路径也不许留下 `.tmp`：那是给下一次启动制造困惑的东西。 */
        let names: Vec<String> = std::fs::read_dir(base.base())
            .expect("读目标目录")
            .map(|entry| {
                entry
                    .expect("读目录项")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(names.len(), 3, "目标目录里应只有三件套，实际：{names:?}");
        assert!(
            names.iter().all(|name| !name.ends_with(".tmp")),
            "搬成功后不该留 .tmp，实际：{names:?}"
        );
    }

    /// 复制阶段失败必须回退：正式名下一个文件都不许留，`.tmp` 也不许留，源文件一律不动。
    ///
    /// 制造失败的手法：把 `-wal` 的**源**做成一个目录——`std::fs::copy` 读目录必然失败。
    /// 这时 `mh-toolbox.db.tmp` 已经是一个完整的临时文件，正好验证「本轮 staged 过的东西
    /// 必须被清掉」这条。
    ///
    /// 说清一件事：真正的**写阶段**失败（ENOSPC / EIO 把 `.tmp` 写了一半）在测试里造不出来
    /// ——那要靠磁盘满或坏块。但 tmp+rename 的意义正在于此：半截文件只可能出现在 `.tmp`
    /// 名下，正式名要么不存在、要么完整，所以这条路径不需要用测试去证明。
    ///
    /// 早先这条测试是把同名的**目标**做成目录：那样 `copy` 在 open 阶段就返回，
    /// 结构上连 `.tmp` 都产生不出来，测不到真正的洞（假阳性）。也顺带说明为什么
    /// 不用只读文件：Windows 上只读属性挡的是「打开写」，`std::fs::copy` 仍可能成功。
    #[test]
    fn migrate_between_rolls_back_partial_copy() {
        let legacy = TempDir::new(6);
        let base = TempDir::new(7);

        std::fs::write(legacy.base().join(DB_FILE), b"main-db-bytes").expect("写旧主库");
        /* 源侧是个目录：复制它（或读它）一定失败。 */
        std::fs::create_dir_all(legacy.base().join(format!("{DB_FILE}-wal"))).expect("旧 WAL 位");

        let error = migrate_between(legacy.base(), base.base()).expect_err("复制目录必须失败");
        assert!(
            error.contains("已清理本次不完整的复制"),
            "文案要交代「已回退、可重试」，实际是：{error}"
        );

        /* 最强的一条断言：失败后目标目录必须是**空**的。既没有正式名（主库若留下，
         * 下次启动就会把它当成「已迁移」），也没有任何 `.tmp` 残留。 */
        let leftovers: Vec<String> = std::fs::read_dir(base.base())
            .expect("读目标目录")
            .map(|entry| {
                entry
                    .expect("读目录项")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert!(
            leftovers.is_empty(),
            "失败后目标目录必须干净，实际留下：{leftovers:?}"
        );
        assert!(
            legacy.base().join(DB_FILE).exists(),
            "旧主库不许删：那是用户唯一的一份数据"
        );
        assert!(
            legacy.base().join(format!("{DB_FILE}-wal")).exists(),
            "旧 WAL 不许删"
        );
    }

    /// 新路径已经有库就不再搬。这一步挡的是「用旧库覆盖用户这两天新记的账」。
    #[test]
    fn migrate_between_never_overwrites_existing_target() {
        let legacy = TempDir::new(8);
        let base = TempDir::new(9);

        std::fs::write(legacy.base().join(DB_FILE), b"legacy").expect("写旧库");
        std::fs::write(base.base().join(DB_FILE), b"existing").expect("写新库");

        /* 目标已存在是**正常**情况（第二次启动就是这样），不该报错。 */
        migrate_between(legacy.base(), base.base()).expect("目标已存在应视为已完成");

        let kept = std::fs::read(base.base().join(DB_FILE)).expect("读新库");
        assert_eq!(kept, b"existing".to_vec(), "新路径已有的库不许被旧的覆盖");
    }

    /// 名册里混进一行坏 JSON 时只跳过它，不许整份返回 `Err`。
    ///
    /// 整份 `Err` 的后果是**用户永久打不开这一页**：前端把 `null` 当读失败 →
    /// 立 `loadError` → 名册空白且写入口全禁，界面上又没有「修掉那一行」的地方。
    #[test]
    fn characters_load_skips_bad_json_row() {
        let dir = TempDir::new(10);
        let conn = open_at(dir.base()).expect("打开数据库");

        let rows = [
            ("c1", r#"{"id":"c1","name":"大唐"}"#),
            ("bad", "{这一行不是 JSON"),
            ("c3", r#"{"id":"c3","name":"化生"}"#),
        ];
        for (index, (id, data)) in rows.iter().enumerate() {
            conn.execute(
                "INSERT INTO characters (id, data, sort_order) VALUES (?1, ?2, ?3)",
                params![id, data, index as i64],
            )
            .expect("写名册行");
        }

        let list = load_characters(&conn).expect("一行坏 JSON 不该拖垮整份名册");
        assert_eq!(list.len(), 2, "坏的那一行应被跳过，其余照常返回");
        assert_eq!(list[0]["id"], "c1");
        assert_eq!(list[1]["id"], "c3");
    }

    /* ---------- 清空：只清账本，不碰 meta ---------- */

    /// 清空之后三张表都空，而 `meta` 三条**一条都不能少**。
    ///
    /// 这条钉的是一个**设计选择**，不是实现细节：`charactersLegacyImported` /
    /// `pricesLegacyImported` 一旦被清掉，下次启动 `roster.ts` / `prices-store.ts`
    /// 会认为「老数据还没搬过」，于是把旧 `localStorage` 里那份**再搬一遍**——
    /// 用户刚清干净、重启又回来一批，那正是这个功能最不该有的样子。
    /// 也正因为它是选择而不是细节，用注释说明不够：得有一条会红的测试。
    ///
    /// 变异测试很容易证明它的价值：在 `clear_records` 里补一句 `DELETE FROM meta`，
    /// 这条必须红（`schemaVersion` 那条断言也会红，因为 `init` 只在开库时写）。
    #[test]
    fn clear_records_keeps_meta_but_drops_ledger() {
        let dir = TempDir::new(13);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        /* 三张表各放一条：只清两张、把价格留给级联，正是实现里明确不做的事。 */
        save_items(
            &mut conn,
            &[item(
                "item-1",
                "黑宝石",
                vec![point("p-1", "2026-03-05", 18.5, 1_700_000_000_000)],
            )],
        )
        .expect("写一件带历史的物品");
        conn.execute(
            "INSERT INTO characters (id, data, sort_order) VALUES ('c1', '{\"id\":\"c1\"}', 0)",
            [],
        )
        .expect("写一条角色");
        write_meta(&conn, "charactersLegacyImported", "1").expect("写名册迁移标记");
        write_meta(&conn, "pricesLegacyImported", "1").expect("写物价迁移标记");

        let (characters, items) = clear_records(&mut conn).expect("清空");
        assert_eq!(
            (characters, items),
            (1, 1),
            "返回的两个数要报出清掉了多少，界面那两句提示靠它"
        );

        let count = |table: &str| -> i64 {
            conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap_or_else(|error| panic!("查 {table} 失败：{error}"))
        };
        assert_eq!(
            (
                count("characters"),
                count("price_items"),
                count("price_points")
            ),
            (0, 0, 0),
            "角色、物品、价格三张表都该清空"
        );

        assert_eq!(
            read_meta(&conn, "charactersLegacyImported").expect("读名册迁移标记"),
            Some("1".to_string()),
            "名册的迁移标记必须留着，否则下次启动会把旧 localStorage 再搬一遍"
        );
        assert_eq!(
            read_meta(&conn, "pricesLegacyImported").expect("读物价迁移标记"),
            Some("1".to_string()),
            "物价的标记同理"
        );
        assert_eq!(
            read_meta(&conn, "schemaVersion").expect("读 schemaVersion"),
            Some(SCHEMA_VERSION.to_string()),
            "schemaVersion 也在 meta 里，同样不许动"
        );
    }

    /// 目标里残留上一轮的 `-wal` / `-shm`（主库没赶上）时，重试必须能覆盖它们。
    ///
    /// 这条模拟的正是「rename 反序」引入的那个中间态：正式 `-wal` / `-shm` 已改名成功、
    /// 主库还叫 `.tmp` 时就断电了。下次启动重来，目标位置于是有 `-wal` / `-shm` 而无主库
    /// ——`target.exists()` 为假，迁移会真的再跑一遍。
    ///
    /// 它同时钉住两件事：① 残留文件**不会让 `rename` 报错**（`MoveFileExW` 带
    /// `MOVEFILE_REPLACE_EXISTING` / `rename(2)` 都覆盖已存在的目标）；② 残留的**内容**
    /// 会被 legacy 那份覆盖。哪个平台的 rename 没有覆盖语义，这条就会红——那正是需要
    /// 提前知道的事。
    #[test]
    fn migrate_between_overwrites_leftover_wal_from_interrupted_run() {
        let legacy = TempDir::new(11);
        let base = TempDir::new(12);

        std::fs::write(legacy.base().join(DB_FILE), b"legacy-db").expect("写旧主库");
        std::fs::write(legacy.base().join(format!("{DB_FILE}-wal")), b"legacy-wal")
            .expect("写旧 WAL");
        std::fs::write(legacy.base().join(format!("{DB_FILE}-shm")), b"legacy-shm")
            .expect("写旧 SHM");

        /* 上一轮只改成了这两件的名，主库没赶上——所以这里**不放** `mh-toolbox.db`。 */
        std::fs::write(base.base().join(format!("{DB_FILE}-wal")), b"stale-wal")
            .expect("写残留 WAL");
        std::fs::write(base.base().join(format!("{DB_FILE}-shm")), b"stale-shm")
            .expect("写残留 SHM");

        migrate_between(legacy.base(), base.base()).expect("残留的 WAL / SHM 不该挡住重试");

        /* 主库最后就位，它是「迁移完成」的标记。 */
        assert_eq!(
            std::fs::read(base.base().join(DB_FILE)).expect("主库该出现"),
            b"legacy-db".to_vec(),
            "主库内容应是 legacy 那份"
        );
        assert_eq!(
            std::fs::read(base.base().join(format!("{DB_FILE}-wal"))).expect("读 WAL"),
            b"legacy-wal".to_vec(),
            "残留的 WAL 必须被 legacy 那份覆盖，不能留着 stale-wal"
        );
        assert_eq!(
            std::fs::read(base.base().join(format!("{DB_FILE}-shm"))).expect("读 SHM"),
            b"legacy-shm".to_vec(),
            "残留的 SHM 必须被 legacy 那份覆盖，不能留着 stale-shm"
        );

        /* 成功路径不该留下 `.tmp`。 */
        let leftovers: Vec<String> = std::fs::read_dir(base.base())
            .expect("读目标目录")
            .map(|entry| {
                entry
                    .expect("读目录项")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "不该留 .tmp，实际：{leftovers:?}");
    }
}
