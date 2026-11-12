//! 本地数据层：物价、角色名册、收益账与速记单价落在同一个 SQLite 文件里。
//!
//! ## 为什么是「整份读写」而不是增量
//!
//! 前端原先用 `localStorage` 存整份数组，换过来时保持同一语义最省事：一次 `save`
//! 写库、一次 `load` 读全量。几十件物品、几百条价格，整份也就几十 KB，
//! 而增量（upsert / delete / 排序游标）会立刻引出「谁删了这一条」「并发写怎么合」
//! 这类问题——等到数据量真的撑不住再改，那时才有真实的性能数据可用。
//!
//! **收益那张表也是整份**：一天十几条、一年几千条，几千行写一次也就几百 KB，
//! 而速记的整套体验依赖「点一下立刻落账」——增量写的每一步都要考虑半途失败。
//!
//! ## 为什么加 `meta` 表
//!
//! 只有一件事：`schemaVersion` 让将来的表结构变更有个判断依据。早先还有一个
//! `legacyImported`（防「localStorage 老数据重复搬入」），随老版本兼容一起删了——
//! 新应用不接老数据，也就不存在「搬过没有」这个问题。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 数据库文件名。放在 `%APPDATA%\mh-tool-rs` 下，卸载也不清
/// （`deleteAppDataOnUninstall: false`）。红线 1 见 `AGENTS.md` §六。
///
/// 私有：拼路径的只有本文件的 `open_in`。早先 `pub(crate)` 是给 `migrate.rs` 搬家用的，
/// 那个模块随「不接老数据」一起删了（第 107 批），可见性也没必要再放宽。
const DB_FILE: &str = "mh-toolbox.db";

/// 表结构版本。
///
/// 规矩只有一条：**改表就要 +1**。加版本之后，`init` 会先读库里的值再决定怎么做：
/// 比当前版本大 → 拒绝打开（那个库是更新版的应用写的，这里的 SQL 不认识它的列）；
/// 相等 → 什么都不写；更小 → 也什么都不写（见最后一段）。
///
/// 这个读-比较-拒绝的顺序是**必须的**：早先这里是无条件把当前版本覆写回去，
/// 用户用旧 exe 打开过一次 v2 的库，版本号就被降成 1，升级回来后「小于才迁移」
/// 的判断永远不成立——表缺列且无法自愈。
///
/// **v2（2026-11-04，第 97 批）**：加 `income_entries` 与 `quick_prices` 两张表。
/// **v3（2026-11-05，第 112 批）**：加 `account_entries` 一张表。
/// **v4（2026-11-05，第 115 批）**：加 `goals` 一张表。
/// **v5（2026-11-11，第 145 批）**：加 `online_sessions` 与 `online_settings` 两张表。
/// 只加不改，旧版的 SQL 不认识它们、也不会碰；但版本号仍要 +1——这是「改表就要 +1」
/// 的规矩，代价是回退到旧 exe 时它会拒绝打开（`AGENTS.md` 里写明升级是单向的）。
///
/// 三次升版全是「只加表」，而建表一律 `IF NOT EXISTS`，所以「更小」这一支**故意是空的**：
/// 旧库打开时缺的表已经被同一次 `execute_batch` 建出来了，没有第二步可做。哪天真要
/// 改列 / 改语义，再按版本升序补分支——那时第一步是把库里的版本号先对齐。
const SCHEMA_VERSION: i64 = 5;

/// 一条价格记录。字段名与前端 `PricePoint` 一一对应（`serde` 自动转 camelCase）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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
 * 收益账与速记单价（第 97 批）
 *
 * 分成两件事是因为它们的寿命不同：**记录**是流水，越攒越多、按日期查；
 * **单价**是配置，一件物品一个数、随行就市地改。混在一张表里会让「改价」
 * 变成「重写所有引用它的记录」——而旧记录必须留着当时的价。
 * ==================================================================== */

/// 一条收益记录。
///
/// `amount` 存**原值**（`15000` 表示 1.5 万），与物价同一个口径：显示时才折万。
/// 前端已保证 `amount > 0`，方向由 `kind` 表达——负数与「支出」两套写法混用，
/// 汇总时漏掉一处就会把净额算反。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IncomeEntry {
    pub id: String,
    /// `YYYY-MM-DD`。
    pub date: String,
    /// 关联的角色 id；空串表示「未指定角色」（整号摆摊、代练收入）。
    pub character_id: String,
    /// `income` / `expense`。
    pub kind: String,
    pub amount: f64,
    /// 物品名（速记时带上，手记时可空）。
    pub item: String,
    pub note: String,
    pub created_at: i64,
}

/// 一件速记物品的单价。
///
/// `item_id` 是 `game/data/quick-items.json` 里的稳定编号；单价存**原值**。
/// 没有行 = 这件物品还没设过价，界面显示「未设价」。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct QuickPrice {
    pub item_id: i64,
    pub price: f64,
}

/// 收益页一次读回来的全部东西。
///
/// 两份一起读写，因为页面总是同时需要它们：速记格要显示单价，清单要显示今天的记录。
/// 分两条命令会让首屏闪一下（先有记录、后补单价）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IncomePayload {
    pub entries: Vec<IncomeEntry>,
    pub prices: Vec<QuickPrice>,
}

/// 一条账号账本记录（第 112 批）。
///
/// 与 `IncomeEntry` 是**两张表而不是加列**：收益页记的是「打金产出」（梦幻币、按物品），
/// 账号页记的是「钱包进出」（人民币与梦幻币、按分类与渠道）。共表就要在每一行上猜
/// 「这行的 amount 是万还是元、有没有渠道」，而这两个判断漏一次就会把汇总算错。
///
/// `amount` 的单位**跟着 `currency` 走**：`rmb` 按元、`cash` 按万（原值，与收益页同口径：
/// 存 46000 而不是 4.6）。两本账从不相加，所以不需要统一成一种单位；
/// 真要统一，反而会出现「1 元 = 1 万」这种离谱的中间态。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountEntry {
    pub id: String,
    /// `YYYY-MM-DD`。
    pub date: String,
    /// 来源：空串 = 用户手记，`"auto"` = 收益页按天自动同步写的。
    ///
    /// **单独一栏，不靠分类前缀猜**：用户完全可以手记一条「游戏收益」，
    /// 靠 `category` 反推来源的话，第二次同步就会写重复，认反了还会删掉他的手记。
    #[serde(default)]
    pub source: String,
    /// 关联的角色 id；空串表示「未指定角色」。
    pub character_id: String,
    /// `income` / `expense`。
    pub kind: String,
    /// `rmb`（人民币 · 元）/ `cash`（梦幻币 · 万）。
    pub currency: String,
    /// 分类，取值见前端 `accounts.ts` 的 `ACCOUNT_CATEGORIES`。
    pub category: String,
    /// 交易渠道，取值见前端 `CHANNELS`。
    pub channel: String,
    pub amount: f64,
    pub note: String,
    pub created_at: i64,
}

/* ======================================================================
 * 上线计时与点卡（第 145 批）
 *
 * 一次上线 = 一行：`end_at` 有值就是「已结束」，为空就是「还在计时」。
 * 不用「运行中」布尔列，也不用单独的「当前这次」表：计时中的那一段没有终点，
 * 前端拿 `Date.now()` 补——于是「关掉应用再打开」不需要任何补偿逻辑，
 * 钟表本来就是墙上的那个。
 *
 * `roster` 存 JSON 数组（多开时的角色 id）：列数固定，多加一个号不用改表；
 * 而它只在这一行内被读、从不做查询条件，摊成子表只会多一张永远两三行的表。
 *
 * `card_price` 是**当时那一刻的单价快照**：单价改了之后回头重算历史成本，
 * 每个月看到的账都不一样，而用户记得的是「昨天明明是那个数」。
 * ==================================================================== */

/// 点卡口径。库里只有一行（`id = 1`），一行都没有就是默认值。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSettings {
    /// 点卡单价，**原值**：`15000` 表示 1.5 万/点（与收益、物价同口径）。
    pub card_price: f64,
    /// 是否把点卡折算成账号支出。关掉只是口径开关：已算好的成本照旧显示，历史流水也不删。
    pub card_cost: bool,
}

/// 一行都没有时用的默认口径：1.5 万/点、计入成本。
///
/// 写成 `Default` 而不是在 `load_online` 里现拼：备份文件里的
/// `cardSettings` 是 `#[serde(default)]`，旧备份打开时也走这里。
impl Default for OnlineSettings {
    fn default() -> Self {
        Self {
            card_price: 15_000.0,
            card_cost: true,
        }
    }
}

/// 一次上线（一段计时）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSession {
    pub id: String,
    /// 开始那天的 `YYYY-MM-DD`。跨天的那一段由前端按天切开，这里只记起点落在哪天。
    pub date: String,
    /// 开始时刻（毫秒时间戳）。
    pub start_at: i64,
    /// 结束时刻；`null` = 还在计时。
    pub end_at: Option<i64>,
    /// 主体角色。多开时只是其中之一，完整名单在 `roster`。
    pub character_id: String,
    /// 多开的角色 id；空数组 = 单开（只有 `character_id`）。
    pub roster: Vec<String>,
    /// 这一刻的点卡单价快照（原值）。
    pub card_price: f64,
    pub note: String,
    pub created_at: i64,
}

/// 收益页一次读回来的上线数据：记录 + 口径。
///
/// 两份一起读写，因为「今天扣了多少点卡」需要同时用到时长与单价；
/// 分两条命令会让卡片先画时长、再补数，中间那一拍是错的。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnlinePayload {
    pub sessions: Vec<OnlineSession>,
    pub settings: OnlineSettings,
}

/* ======================================================================
 * 打开数据库：分两层
 *
 * `base_dir(app)` 只回答「目录在哪儿」，`open_at(base)` 只回答「怎么开」。
 * 拆开的理由不是好看：命令签名直接吃 `AppHandle` 时整个文件一条测试都写不了——
 * 构造 `AppHandle` 要起 Tauri 运行时。现在测试对着临时目录跑，跟命令走同一条代码。
 * ==================================================================== */

/// 数据目录：红线 1 的 `%APPDATA%\mh-tool-rs`。
///
/// `crate::data_dir_path()` 是这条红线的唯一真源；`None`（`APPDATA` 缺失：服务账户、
/// 极端精简环境）时才退到 `app_data_dir()`。**这条兜底只为「能用」**，正常路径永远
/// 不该走到它——走到就意味着数据落在 identifier 目录下，与打包的其余部分对不上。
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
    /* WAL 的标准搭配。默认的 `FULL` 在**每次提交**都 fsync 一次日志：一次读命令
     * 只要某个写操作（早先 `init` 每次都写 `schemaVersion`）就变成一次磁盘同步。
     * `NORMAL` 只在 checkpoint 时同步，断电最多丢最近一两个事务——而 WAL 本身的
     * 崩溃一致性不受影响，库不会坏。桌面小工具的数据价值与这个取舍正好对上。 */
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| format!("设置同步模式失败：{error}"))?;
    init(&conn)?;
    Ok(conn)
}

/// 打开连接。
///
/// 每次命令打开一次连接：SQLite 打开一个本地文件是微秒级，而把 `Connection`
/// 塞进 `State<Mutex<..>>` 会让每个命令都变成「先抢锁」——数据量这个级别不值得。
///
/// **这里只开库**：库就是 `%APPDATA%\mh-tool-rs\mh-toolbox.db` 这一份，不存在「从哪儿搬过来」
/// 这回事——老版本（Electron）的数据一概不接，只参考它的功能与样式。启动路径上没有任何
/// 文件复制，也就不存在「两个命令同时看到目标不存在、同时往同一处写」那个窗口。
///
/// `pub(crate)`：`backup::data_import` 要在**一个连接**里完成整份替换（见 `replace_all`），
/// 不能再走三次 `*_save` 命令各自开一次库。
pub(crate) fn open(app: &AppHandle) -> Result<Connection, String> {
    open_at(&base_dir(app)?)
}

/// 保留包含 WAL 已提交内容的完整原库，不解析业务 JSON，供损坏记录恢复前留底。
pub(crate) fn snapshot_database(conn: &Connection, path: &Path) -> Result<(), String> {
    let target = path
        .to_str()
        .ok_or_else(|| "原库快照路径不是有效文本".to_string())?;
    // 先独占创建空文件；VACUUM INTO 接受空文件，但不能覆盖已有快照。
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("创建原库快照 {} 失败：{error}", path.display()))?;
    let result = (|| -> Result<(), String> {
        conn.execute("VACUUM INTO ?1", [target])
            .map_err(|error| format!("保存原库快照失败：{error}"))?;
        // VACUUM INTO 不保证落到持久介质；同步成功之后才允许导入覆盖原库。
        std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("同步原库快照失败：{error}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(path);
    }
    result
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
        );

        /* 收益账：一行一笔。规范化列而不是一列 JSON，因为**按日期查与按角色汇总**
         * 是这一页的日常操作（今日清单、本周合计），而角色只要 id 不需要整份档案。
         * 角色改名/删号时这张表**不做级联**：记录里的 characterId 找不到人时，
         * 界面显示「未指定角色」，比把历史一并删掉安全——账不能因为改了个名字就少一笔。 */
        CREATE TABLE IF NOT EXISTS income_entries (
            id           TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            character_id TEXT NOT NULL,
            kind         TEXT NOT NULL,
            amount       REAL NOT NULL,
            item_name    TEXT NOT NULL,
            note         TEXT NOT NULL,
            created_at   INTEGER NOT NULL
        );

        /* 页面上每一次读都是「某几天 + 倒序」，复合索引让这条查询走覆盖索引。 */
        CREATE INDEX IF NOT EXISTS idx_income_entries_date
            ON income_entries(date DESC, created_at DESC);

        /* 速记单价：`item_id` 就是物品清单里的稳定编号，一件一行。
         * 没设过价的物品**没有行**（而不是 0），0 是「这件东西一文不值」，
         * 与「还没定价」在界面上要显示成两种东西。 */
        CREATE TABLE IF NOT EXISTS quick_prices (
            item_id INTEGER PRIMARY KEY,
            price   REAL NOT NULL
        );

        /* 账号账本：一行一笔，与 `income_entries` 分开（理由见 `AccountEntry` 的注释）。
         * `currency` 与 `category` / `channel` 都是低位数的枚举串，直接存字面量——
         * 存数字代号就要在两边各维护一张映射表，而对账时人是拿 sqlite 直接看库的。 */
        CREATE TABLE IF NOT EXISTS account_entries (
            id           TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            character_id TEXT NOT NULL,
            kind         TEXT NOT NULL,
            currency     TEXT NOT NULL,
            category     TEXT NOT NULL,
            channel      TEXT NOT NULL,
            amount       REAL NOT NULL,
            note         TEXT NOT NULL,
            created_at   INTEGER NOT NULL,
            /* 来源列（第 145 批）：`''` 用户手记，`'auto'` 收益页自动同步。
             * 老库没有这一列，靠下面的 `add_column_if_missing` 补，见 S5 那段。
             * 默认空串而不是 NULL：空串就是「手记」，语义直接，省掉每处取值时的判空。 */
            source       TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_account_entries_date
            ON account_entries(date DESC, created_at DESC);

        /* 目标（第 115 批）。与名册同一条路子：整条 JSON 透传，Rust 侧不认识任何字段。
         *
         * 为什么不像账号账本那样摊成列：目标没有「按日期查」「按角色汇总」这类库内操作——
         * 进度是现算的，排序是前端算的，读写只有「整份读 / 整份写」一种。摊成列只会让
         * 每次加一个字段（分类、期限、流水）都要改三处：建表、insert、select。
         *
         * 流水（`logs`）也不单开表：一条目标一年也就几十笔，整份写在同一个事务里，
         * 换来的是「改一笔 = 重算一次累计」，不会有「流水改了、累计没跟上」的中间态。 */
        CREATE TABLE IF NOT EXISTS goals (
            id   TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );

        /* 上线记录：一次计时一行。`end_at` 为 NULL 表示还在计时，
         * 前端拿当前时间补终点——所以「应用被关掉」不会留下一条永远闭合不了的记录，
         * 也不会在下次启动时编造一个假终点。
         *
         * 为什么摊成列而不是像目标那样整条 JSON：这几列正是页面要排序与筛选的依据
         * （按日期取今天、按角色算分摊），塞进 JSON 之后每次读都要全表反序列化。
         * 只有 `roster` 是 JSON——它是一个短数组，且从不参与查询。 */
        CREATE TABLE IF NOT EXISTS online_sessions (
            id           TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            start_at     INTEGER NOT NULL,
            end_at       INTEGER,
            character_id TEXT NOT NULL,
            roster       TEXT NOT NULL,
            card_price   REAL NOT NULL,
            note         TEXT NOT NULL,
            created_at   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_online_sessions_date ON online_sessions (date);

        /* 点卡口径：单行表（`CHECK (id = 1)` 把「只有一行」写进约束里）。
         * 不塞进 `meta`：那张表存的是「关于库的状态」，删了 `init` 会补回来；
         * 而单价是用户设定的业务数据，清除账本时该跟着一起清。 */
        CREATE TABLE IF NOT EXISTS online_settings (
            id         INTEGER PRIMARY KEY CHECK (id = 1),
            card_price REAL NOT NULL,
            card_cost  INTEGER NOT NULL
        );",
    )
    .map_err(|error| format!("建表失败：{error}"))?;

    /* S5（第 145 批）：给已有的 `account_entries` 补 `source` 列。
     *
     * `CREATE TABLE IF NOT EXISTS` 对**已存在**的表一个字都不改，所以加列不能只改建表语句：
     * 老库跑起来时那张表已经在了，新列不会凭空出现，之后所有账号读写都会报
     * 「no such column: source」。`ALTER TABLE ... ADD COLUMN` 带上同样的默认值，
     * 老行读出来就是「手记」——这正是它们本来的身份，不需要额外的数据迁移。
     *
     * 幂等：`PRAGMA table_info` 里已有这一列就跳过。SQLite 没有
     * `ADD COLUMN IF NOT EXISTS`，所以只能先查一遍。 */
    add_column_if_missing(
        conn,
        "account_entries",
        "source",
        "TEXT NOT NULL DEFAULT ''",
    )?;

    /* S4 + S5：**先读，再决定写不写**。
     *
     * 早先是无条件 `INSERT ... ON CONFLICT DO UPDATE`，于是每条读命令
     * （`prices_load` / `characters_load` / `income_load`）都开一次写事务：
     * WAL 下默认 `synchronous=FULL` 时那就是一次 fsync；并发时还要抢写锁，
     * `data_import`（async，跑在 worker 线程上）与主线程上的读命令撞在一起时，
     * 主线程会阻塞到 `busy_timeout`（rusqlite 默认 5 秒）——表现是窗口假死，
     * 或者直接拿到 `database is locked`。
     *
     * 四种情况：
     * - 没有值（首次建库）→ 写一次；
     * - 相等 → 什么都不做，这是常态；
     * - 库里比当前版本大 → 拒绝打开。旧 exe 跑过一次新库会把版本号**降级**写回去，
     *   之后「小于才迁移」永远不成立、表缺列也自愈不了；宁可在启动时说清
     *   「请升级应用」，也不要拿一个自己看不懂的库继续跑。
     * - 更小 → 什么都不做。三次升版都只是加表，而建表全是 `IF NOT EXISTS`，缺的表
     *   已经在上面那条 `execute_batch` 里建好了，没有第二步可做。版本号**也不回写**：
     *   它现在唯一的读者是「拒绝更新版」那道门，回写只让 `meta` 好看，代价是每次
     *   拿旧库启动都多一次 fsync。真出现「改列 / 改语义」时，在这里按版本升序补分支，
     *   第一步才是把库里的版本号对齐。 */
    match read_meta(conn, "schemaVersion")? {
        None => write_meta(conn, "schemaVersion", &SCHEMA_VERSION.to_string())?,
        Some(stored) => {
            let stored = stored
                .parse::<i64>()
                .map_err(|_| format!("库里的表结构版本不是数字（{stored}），不敢继续打开"))?;
            if stored > SCHEMA_VERSION {
                return Err(format!(
                    "这个数据文件是更新版本的应用写的（表结构 v{stored}，本版本只认 v{SCHEMA_VERSION}），\
                     请升级应用后再打开"
                ));
            }
        }
    }

    Ok(())
}

/// 给已有表补一列（第 145 批）。
///
/// `CREATE TABLE IF NOT EXISTS` 只管「表在不在」，**已经存在的表加列它一个字都不管**。
/// 老库升级上来时那个新列不会自己出现，之后所有 SELECT/INSERT 都会报 `no such column`。
///
/// SQLite 没有 `ADD COLUMN IF NOT EXISTS`，只能先问 `PRAGMA table_info` 再决定。
/// 返回是否真的加了——调用方目前不关心，但测试要断言「第二次调用是空操作」。
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("读不了 {table} 的列信息：{error}"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("读不了 {table} 的列信息：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读不了 {table} 的列信息：{error}"))?
        .iter()
        .any(|name| name == column);
    drop(stmt);

    if exists {
        return Ok(false);
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
        [],
    )
    .map_err(|error| format!("给 {table} 补 {column} 列失败：{error}"))?;
    Ok(true)
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
#[specta::specta]
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
#[specta::specta]
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
        insert_item(&tx, item)?;
    }

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 写一件物品连同它的全部历史。
///
/// 抽出来不是为了好看：`save_items`（整份覆盖）与 `replace_all`（导入，一个事务里连
/// 名册一起换）必须写出**一模一样**的行。两份各写一遍之后，只要有一边加列漏改，
/// 导入进来的数据就会与正常保存的不一致，而那种偏差在界面上看不出来。
///
/// 参数吃 `&Connection` 而不是 `&Transaction`：`Transaction` 实现了 `Deref<Target = Connection>`，
/// 于是传 `&tx` 能自动退化，两个调用点不必各写一份。
fn insert_item(conn: &Connection, item: &PriceItem) -> Result<(), String> {
    conn.execute(
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
        conn.execute(
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

    Ok(())
}

/* ======================================================================
 * 「整条 JSON 透传」的两张表：角色名册与目标
 *
 * 与物价不同，这两张表用 `serde_json::Value` 透传整条记录：结构深、字段还在演进，
 * 而唯一的操作就是「整份读 / 整份写」。Rust 侧不需要认识任何字段，
 * 也就不会因为前端加了一个属性而漏写。真正把关的是前端的 `normalizeCharacter` / `normalizeGoal`。
 *
 * 两张表的结构与行为一模一样，差的只有表名、有没有 `sort_order`、以及错误文案里的中文名，
 * 所以读写各只有一份（2026-11-05 合并；此前是两对几乎逐字相同的函数）。
 *
 * **判据不是「长得像」**：哪天某张表要按字段查询、或者 Rust 要认识它的字段了，
 * 它就该从这张表里退出去单独写。别在这份泛化上加 `if 是某某表` 的分支。
 * ==================================================================== */

/// 一张「整份读 / 整份写」的表长什么样。
struct RecordTable {
    /// 表名。只拼进 SQL，取值全是下面的常量，不接受外来输入。
    table: &'static str,
    /// 文案里的中文名（`角色` / `目标`），拼进「写入第 3 个角色失败」。
    label: &'static str,
    /// 日志导语（`名册有一行不是合法 JSON`）——两张表的说法不一样，各给一句。
    what: &'static str,
    /// 日志里标出是哪一行的那一列（`sort_order` / `id`）。
    key: &'static str,
    /// 有 `sort_order` 列的按它读回（名册是「用户排的顺序」，不按 id 或名字排）；
    /// 没有的按 `rowid`，也就是写入顺序——目标页自己排，库不管。
    ordered: bool,
}

const CHARACTERS: RecordTable = RecordTable {
    table: "characters",
    label: "角色",
    what: "名册",
    key: "sort_order",
    ordered: true,
};

const GOALS: RecordTable = RecordTable {
    table: "goals",
    label: "目标",
    what: "目标表",
    key: "id",
    ordered: false,
};

impl RecordTable {
    /// `key` 那一列只进日志，所以一律 `CAST(... AS TEXT)`：名册那边是 INTEGER、
    /// 目标那边是 TEXT，取成一个类型才写得出同一句 `format!`。
    fn select_sql(&self) -> String {
        let order = if self.ordered { "sort_order" } else { "rowid" };
        format!(
            "SELECT CAST({key} AS TEXT), data FROM {table} ORDER BY {order}",
            key = self.key,
            table = self.table
        )
    }

    fn insert_sql(&self) -> String {
        if self.ordered {
            format!(
                "INSERT OR REPLACE INTO {table} (id, data, sort_order) VALUES (?1, ?2, ?3)",
                table = self.table
            )
        } else {
            format!(
                "INSERT OR REPLACE INTO {table} (id, data) VALUES (?1, ?2)",
                table = self.table
            )
        }
    }
}

/// 读整份表。
///
/// 任一行损坏就拒绝整份读取，让前端暂停写入。保存采用整表替换，返回残缺列表
/// 会让下一次正常编辑把损坏行从主库删除，失去恢复原始内容的机会。
fn load_records(conn: &Connection, table: &RecordTable) -> Result<Vec<serde_json::Value>, String> {
    let what = table.what;
    let mut stmt = conn
        .prepare(&table.select_sql())
        .map_err(|error| format!("准备{what}查询失败：{error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("读{what}失败：{error}"))?;

    let mut list = Vec::new();
    for row in rows {
        let (key, raw) = row.map_err(|error| format!("解析{what}行失败：{error}"))?;
        let value = serde_json::from_str::<serde_json::Value>(&raw).map_err(|error| {
            format!(
                "{what}记录损坏（{}={key}），已暂停读取，请从备份恢复：{error}",
                table.key
            )
        })?;
        list.push(value);
    }
    validate_record_ids(&list, table.label)?;
    Ok(list)
}

/// 写入和导入共用的身份校验。ID 必须规范且唯一，拒绝静默合并和失效引用。
pub(crate) fn validate_record_ids(items: &[serde_json::Value], label: &str) -> Result<(), String> {
    let mut seen = HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
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

/// 整份写回：先校验身份，再在一个事务里替换，拒绝静默合并同 id 的记录。
fn save_records(
    conn: &mut Connection,
    table: &RecordTable,
    items: &[serde_json::Value],
) -> Result<(), String> {
    let label = table.label;
    validate_record_ids(items, label)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;
    tx.execute(&format!("DELETE FROM {}", table.table), [])
        .map_err(|error| format!("清空{label}失败：{error}"))?;

    for (index, item) in items.iter().enumerate() {
        insert_record(&tx, table, index, item)?;
    }

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 写一条记录。`index` 既是错误文案里的「第几条」，也是 `sort_order`（有这一列的表）——
/// 名册是「用户排的顺序」，不按 id 或名字排。
///
/// 身份由上游校验；这里仍拒绝缺失 ID，不在写库时生成另一个身份。
fn insert_record(
    conn: &Connection,
    table: &RecordTable,
    index: usize,
    item: &serde_json::Value,
) -> Result<(), String> {
    let label = table.label;
    let id = item
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| format!("第 {} 条{label}没有 id", index + 1))?;
    let data = serde_json::to_string(item)
        .map_err(|error| format!("序列化第 {index} 个{label}失败：{error}"))?;
    let sql = table.insert_sql();
    let written = if table.ordered {
        conn.execute(&sql, params![id, data, index as i64])
    } else {
        conn.execute(&sql, params![id, data])
    };
    written.map_err(|error| format!("写入第 {index} 个{label}失败：{error}"))?;
    Ok(())
}

/// 读整份名册，按 `sort_order` 还原顺序。
#[tauri::command]
#[specta::specta]
pub fn characters_load(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open(&app)?;
    load_records(&conn, &CHARACTERS)
}

/// 整份写回名册。
#[tauri::command]
#[specta::specta]
pub fn characters_save(app: AppHandle, items: Vec<serde_json::Value>) -> Result<(), String> {
    let mut conn = open(&app)?;
    save_records(&mut conn, &CHARACTERS, &items)
}

/// 导入用的整份替换：名册 + 物价，**一个事务**。
///
/// 为什么不能沿用 `clear_all` + `characters_save` + `prices_save`：那是三次 `open`、
/// 三次提交。第一步一提交，旧数据就没了；之后任何一步失败（磁盘满、备份里有点位 id
/// 撞主键）都会留下「旧账已删、新账只写了一半」的库，而用户手里那个 `Err` 里连备份
/// 路径都没有。这里把三张表的 DELETE 与全部 INSERT 放进同一个事务：中途 `?` 返回时
/// `Transaction` 被 drop → 回滚，库里仍是导入前那一份。
///
/// 返回**实际写入的条数**（角色数、物品数）给回执用。读者会问「为什么不是入参长度」：
/// `characters` 用的是 `INSERT OR REPLACE`，重复 id 会覆盖而不是新增，所以入参长度
/// 本来就不等于落库行数。查重已经在 `backup::validate` 里做了，这里仍然按
/// 「写成功了几条」数，两边口径才对得上。
///
/// 顺序（先子表后父表）与 `clear_records` 一致：不依赖 `PRAGMA foreign_keys`
/// 是不是在这个连接上开着。`open_at` 每次都会开，但依赖它就是要求每个未来的调用点
/// 都记得这一点。 */
/// 一次「整份替换 / 整份清空」实际动了几张表的几条。
///
/// 早先是个四元组，账号页（第 112 批）加进来之后叫 `(i64, i64, i64, i64)`——读调用点
/// 得先数到第四位才明白那是账号条数。目标页是第五张表，再往下加就该数不过来了：
/// 名字写在这里，调用点写 `counts.goals`，加表不再动签名。
#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct Counts {
    pub characters: i64,
    pub prices: i64,
    pub entries: i64,
    pub accounts: i64,
    pub goals: i64,
    pub online: i64,
}

pub(crate) fn replace_all(
    conn: &mut Connection,
    characters: &[serde_json::Value],
    prices: &[PriceItem],
    income: &IncomePayload,
    accounts: &[AccountEntry],
    goals: &[serde_json::Value],
    online: &OnlinePayload,
) -> Result<Counts, String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    tx.execute("DELETE FROM price_points", [])
        .map_err(|error| format!("清空价格失败：{error}"))?;
    tx.execute("DELETE FROM price_items", [])
        .map_err(|error| format!("清空物品失败：{error}"))?;
    tx.execute("DELETE FROM characters", [])
        .map_err(|error| format!("清空名册失败：{error}"))?;
    tx.execute("DELETE FROM income_entries", [])
        .map_err(|error| format!("清空收益失败：{error}"))?;
    tx.execute("DELETE FROM quick_prices", [])
        .map_err(|error| format!("清空单价失败：{error}"))?;
    tx.execute("DELETE FROM account_entries", [])
        .map_err(|error| format!("清空账号账本失败：{error}"))?;
    tx.execute("DELETE FROM goals", [])
        .map_err(|error| format!("清空目标失败：{error}"))?;
    tx.execute("DELETE FROM online_sessions", [])
        .map_err(|error| format!("清空上线记录失败：{error}"))?;

    let mut written_characters: i64 = 0;
    for (index, character) in characters.iter().enumerate() {
        insert_record(&tx, &CHARACTERS, index, character)?;
        written_characters += 1;
    }

    let mut written_items: i64 = 0;
    for item in prices {
        insert_item(&tx, item)?;
        written_items += 1;
    }

    let mut written_entries: i64 = 0;
    for entry in &income.entries {
        insert_income_entry(&tx, entry)?;
        written_entries += 1;
    }
    for price in &income.prices {
        insert_quick_price(&tx, price)?;
    }

    let mut written_accounts: i64 = 0;
    for entry in accounts {
        insert_account_entry(&tx, entry)?;
        written_accounts += 1;
    }

    let mut written_goals: i64 = 0;
    for (index, goal) in goals.iter().enumerate() {
        insert_record(&tx, &GOALS, index, goal)?;
        written_goals += 1;
    }

    let mut written_online: i64 = 0;
    for session in &online.sessions {
        insert_online_session(&tx, session)?;
        written_online += 1;
    }
    /* 口径是单行，不算进条数：回执里报「N 条上线记录」，
     * 把那一行口径也算进去会让「导入了 1 条」这种说法出现。 */
    tx.execute(
        "INSERT OR REPLACE INTO online_settings (id, card_price, card_cost) VALUES (1, ?1, ?2)",
        params![
            online.settings.card_price,
            if online.settings.card_cost { 1 } else { 0 },
        ],
    )
    .map_err(|error| format!("写点卡口径失败：{error}"))?;

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(Counts {
        characters: written_characters,
        prices: written_items,
        entries: written_entries,
        accounts: written_accounts,
        goals: written_goals,
        online: written_online,
    })
}

/* ======================================================================
 * 收益：账与速记单价一起读写
 * ==================================================================== */

/// 读回全部收益记录与速记单价。
///
/// 两份一次取回，因为收益页总要同时用：速记格显示单价、今日清单显示记录。
/// 分两条命令会让首屏闪一下（先有记录、后补单价），而这两块在同一屏内。
#[tauri::command]
#[specta::specta]
pub fn income_load(app: AppHandle) -> Result<IncomePayload, String> {
    let conn = open(&app)?;
    load_income(&conn)
}

/// `income_load` 的本体。与 `load_items` 同一个理由拆出来：测试能对着临时目录跑。
fn load_income(conn: &Connection) -> Result<IncomePayload, String> {
    let mut entry_stmt = conn
        .prepare(
            "SELECT id, date, character_id, kind, amount, item_name, note, created_at
             FROM income_entries ORDER BY date DESC, created_at DESC",
        )
        .map_err(|error| format!("准备收益查询失败：{error}"))?;
    let entries = entry_stmt
        .query_map([], |row| {
            Ok(IncomeEntry {
                id: row.get(0)?,
                date: row.get(1)?,
                character_id: row.get(2)?,
                kind: row.get(3)?,
                amount: row.get(4)?,
                item: row.get(5)?,
                note: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("读收益失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读收益失败：{error}"))?;

    let mut price_stmt = conn
        .prepare("SELECT item_id, price FROM quick_prices ORDER BY item_id")
        .map_err(|error| format!("准备单价查询失败：{error}"))?;
    let prices = price_stmt
        .query_map([], |row| {
            Ok(QuickPrice {
                item_id: row.get(0)?,
                price: row.get(1)?,
            })
        })
        .map_err(|error| format!("读单价失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读单价失败：{error}"))?;

    Ok(IncomePayload { entries, prices })
}

/// 整份写回收益账与速记单价。
///
/// **两张表同一个事务**：速记一次点击会同时产生「一条记录」与「可能改了单价」，
/// 分两次提交时若第二次失败，就会出现「账记上了、价没改」——下一次点同一件物品
/// 仍然按旧价入账，而用户以为自己刚刚改过。
#[tauri::command]
#[specta::specta]
pub fn income_save(app: AppHandle, payload: IncomePayload) -> Result<(), String> {
    let mut conn = open(&app)?;
    save_income(&mut conn, &payload)
}

fn save_income(conn: &mut Connection, payload: &IncomePayload) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    tx.execute("DELETE FROM income_entries", [])
        .map_err(|error| format!("清空收益失败：{error}"))?;
    tx.execute("DELETE FROM quick_prices", [])
        .map_err(|error| format!("清空单价失败：{error}"))?;

    for entry in &payload.entries {
        insert_income_entry(&tx, entry)?;
    }
    for price in &payload.prices {
        insert_quick_price(&tx, price)?;
    }

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 写一条收益。`INSERT OR REPLACE`：同一 id 再写一次是覆盖（与名册同一个语义）。
fn insert_income_entry(conn: &Connection, entry: &IncomeEntry) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO income_entries
            (id, date, character_id, kind, amount, item_name, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            entry.id,
            entry.date,
            entry.character_id,
            entry.kind,
            entry.amount,
            entry.item,
            entry.note,
            entry.created_at,
        ],
    )
    .map_err(|error| format!("写收益失败：{error}"))?;
    Ok(())
}

/// 写一件物品的单价。一件一行，主键是物品 id。
fn insert_quick_price(conn: &Connection, price: &QuickPrice) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO quick_prices (item_id, price) VALUES (?1, ?2)",
        params![price.item_id, price.price],
    )
    .map_err(|error| format!("写单价失败：{error}"))?;
    Ok(())
}

/* ======================================================================
 * 账号账本（第 112 批）
 *
 * 只有一对命令、没有配套的小表：账号页的筛选与汇总全在前端算（记录量级是每年几百条），
 * 库里只负责「原样存、原样取」。这与收益页不同——那边要 `quick_prices` 一起读，
 * 因为速记格要显示单价；这里没有第二个东西，多一条命令只会多一处可能忘了注册。
 * ==================================================================== */

#[tauri::command]
#[specta::specta]
pub fn account_load(app: AppHandle) -> Result<Vec<AccountEntry>, String> {
    let conn = open(&app)?;
    load_accounts(&conn)
}

/// `account_load` 的本体。与 `load_income` 同一个理由拆出来：测试能对着临时目录跑。
fn load_accounts(conn: &Connection) -> Result<Vec<AccountEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, date, character_id, kind, currency, category, channel, amount, note, \
             created_at, source FROM account_entries ORDER BY date DESC, created_at DESC",
        )
        .map_err(|error| format!("准备账号查询失败：{error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AccountEntry {
                id: row.get(0)?,
                date: row.get(1)?,
                character_id: row.get(2)?,
                kind: row.get(3)?,
                currency: row.get(4)?,
                category: row.get(5)?,
                channel: row.get(6)?,
                amount: row.get(7)?,
                note: row.get(8)?,
                created_at: row.get(9)?,
                source: row.get(10)?,
            })
        })
        .map_err(|error| format!("读账号账本失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读账号账本失败：{error}"))?;
    Ok(rows)
}

#[tauri::command]
#[specta::specta]
pub fn account_save(app: AppHandle, entries: Vec<AccountEntry>) -> Result<(), String> {
    let mut conn = open(&app)?;
    save_accounts(&mut conn, &entries)
}

/// 整份写回：清空 + 逐条插入，**一个事务**。
///
/// 与 `save_income` 同一套：整份写的代价是每次几毫秒，换来的是「不会出现界面有、库里没有」。
/// 账号页一次记一笔、一天记几十笔的量级，这点开销不值得用丢账去换。
fn save_accounts(conn: &mut Connection, entries: &[AccountEntry]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;
    tx.execute("DELETE FROM account_entries", [])
        .map_err(|error| format!("清空账号账本失败：{error}"))?;
    for entry in entries {
        insert_account_entry(&tx, entry)?;
    }
    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 写一条账号记录。`INSERT OR REPLACE`：同一 id 再写一次是覆盖（与收益、名册同语义）。
fn insert_account_entry(conn: &Connection, entry: &AccountEntry) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO account_entries
            (id, date, character_id, kind, currency, category, channel, amount, note, created_at, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            entry.id,
            entry.date,
            entry.character_id,
            entry.kind,
            entry.currency,
            entry.category,
            entry.channel,
            entry.amount,
            entry.note,
            entry.created_at,
            entry.source,
        ],
    )
    .map_err(|error| format!("写账号记录失败：{error}"))?;
    Ok(())
}

/* ======================================================================
 * 目标（第 115 批）
 *
 * 与名册同一套：`serde_json::Value` 整条透传，Rust 不认识任何字段（理由见建表那段），
 * 读写共用上面那对 `load_records` / `save_records`。任一坏行都会阻止整份写回，
 * 避免一次正常编辑把原始坏行删除；恢复走设置页的备份导入入口。
 * ==================================================================== */

#[tauri::command]
#[specta::specta]
pub fn goals_load(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open(&app)?;
    load_records(&conn, &GOALS)
}

/// 整份写回。目标页的每一次改动（记一笔、改一条、删一个）都走这里。
#[tauri::command]
#[specta::specta]
pub fn goals_save(app: AppHandle, goals: Vec<serde_json::Value>) -> Result<(), String> {
    let mut conn = open(&app)?;
    save_records(&mut conn, &GOALS, &goals)
}

/* ======================================================================
 * 上线计时与点卡口径（第 145 批）
 *
 * 与收益那对命令同一个形状：两份一起读、一起写。分开会有中间态——
 * 「时长已经变了、单价还是旧的」那一拍，卡片上的点卡消耗是错的。
 * ==================================================================== */

#[tauri::command]
#[specta::specta]
pub fn online_load(app: AppHandle) -> Result<OnlinePayload, String> {
    let conn = open(&app)?;
    load_online(&conn)
}

/// 整份写回：记录清空重插，口径原地 upsert，**一个事务**。
#[tauri::command]
#[specta::specta]
pub fn online_save(app: AppHandle, payload: OnlinePayload) -> Result<(), String> {
    let mut conn = open(&app)?;
    save_online(&mut conn, &payload)
}

/// `online_load` 的本体。拆出来的理由与 `load_income` 一样：测试能对着临时目录跑。
fn load_online(conn: &Connection) -> Result<OnlinePayload, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, date, start_at, end_at, character_id, roster, card_price, note, created_at \
             FROM online_sessions ORDER BY start_at DESC",
        )
        .map_err(|error| format!("准备上线查询失败：{error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(OnlineSession {
                id: row.get(0)?,
                date: row.get(1)?,
                start_at: row.get(2)?,
                end_at: row.get(3)?,
                character_id: row.get(4)?,
                /* 一行坏 JSON 只让这一行的名单变空，不让整表读不出来：
                 * 名单只影响「分摊给谁」，而记录本身还有时长与单价。 */
                roster: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
                card_price: row.get(6)?,
                note: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|error| format!("查上线记录失败：{error}"))?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|error| format!("读上线记录失败：{error}"))?);
    }

    let settings = conn
        .query_row(
            "SELECT card_price, card_cost FROM online_settings WHERE id = 1",
            [],
            |row| {
                Ok(OnlineSettings {
                    card_price: row.get(0)?,
                    card_cost: row.get::<_, i64>(1)? != 0,
                })
            },
        )
        .optional()
        .map_err(|error| format!("读点卡口径失败：{error}"))?
        .unwrap_or_default();

    Ok(OnlinePayload { sessions, settings })
}

fn save_online(conn: &mut Connection, payload: &OnlinePayload) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;

    tx.execute("DELETE FROM online_sessions", [])
        .map_err(|error| format!("清空上线记录失败：{error}"))?;
    for session in &payload.sessions {
        insert_online_session(&tx, session)?;
    }

    /* 口径是单行：`INSERT OR REPLACE` 靠 `id = 1` 这条约束盖掉旧值。
     * 布尔存 0/1——SQLite 没有布尔类型，而 `INTEGER` 一列比多一张表省事得多。 */
    tx.execute(
        "INSERT OR REPLACE INTO online_settings (id, card_price, card_cost) VALUES (1, ?1, ?2)",
        params![
            payload.settings.card_price,
            if payload.settings.card_cost { 1 } else { 0 },
        ],
    )
    .map_err(|error| format!("写点卡口径失败：{error}"))?;

    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(())
}

/// 写一行上线记录。`INSERT OR REPLACE`：同一 id 再写一次是覆盖（与其余各表同语义）。
fn insert_online_session(conn: &Connection, session: &OnlineSession) -> Result<(), String> {
    /* 名单序列化失败只可能是内有坏字符，这里退回空数组而不是让整次保存失败：
     * 一条记录写不进去，用户丢掉的是这段时间；名单丢了只影响分摊，还能手动补。 */
    let roster = serde_json::to_string(&session.roster).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO online_sessions
            (id, date, start_at, end_at, character_id, roster, card_price, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            session.id,
            session.date,
            session.start_at,
            session.end_at,
            session.character_id,
            roster,
            session.card_price,
            session.note,
            session.created_at,
        ],
    )
    .map_err(|error| format!("写上线记录失败：{error}"))?;
    Ok(())
}

/* ======================================================================
 * 清空：给「设置 → 数据 → 清除」用，也给导入前那一手用（导入 = 整体替换）
 * ==================================================================== */

/// 清空角色、物价、收益，返回 (角色数, 物品数, 收益条数) 供界面提示。
///
/// **不动 `meta`**：它里面现在只有 `schemaVersion`，删了 `init` 会补回来，补的是「当前版本」
/// 这句话本身没有意义。通用的理由是：这张表存的是**关于库的状态**，将来一旦有别的标记
/// 落进来，删它就是把「这件事做过」抹成「没做过」——用户刚清干净、重启又变回去。
///
/// 四条 `DELETE` 显式写出来，不依赖 `ON DELETE CASCADE`：级联只在
/// `PRAGMA foreign_keys = ON` 时成立，而这个 pragma **是按连接设的**
/// （`open_at` 里为了别的场景打开过它，但那是「每次开到新连接都要记得再设一遍」的约定）。
/// 依赖它的后果不对称：漏删 `price_points` 不会报任何错，只会在库里攒一堆指向
/// 不存在物品的价格行，而下一次 `prices_save` 也是先清后写，**这些孤儿永远没人收拾**。
/// 显式四条把这个隐患从执行路径上摘掉，代价只是多写两行。
///
/// **收益与单价一起清**：用户点「清除全部数据」时想的是「回到刚装好那样」，
/// 留下收益账比留下物价更糟——那些记录还指着已经被清掉的角色。
///
/// **目标也一起清**：它不像账本那样自成一册，它的成员与指标都指向角色档案；角色没了、
/// 目标还在，那些卡片会显示成一排「已删除」，比没有更难看。
pub(crate) fn clear_all(app: &AppHandle) -> Result<Counts, String> {
    let mut conn = open(app)?;
    clear_records(&mut conn)
}

/// `clear_all` 的本体。与 `load_items` / `save_items` 同一个理由拆出来：
/// **能对着临时目录跑的那一半**留在这里，`AppHandle` 只留在薄薄的外壳上。
///
/// 于是「清空之后 `meta` 还在」这条设计可以写成测试，而不是只写在注释里。
fn clear_records(conn: &mut Connection) -> Result<Counts, String> {
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
    let entries = tx
        .execute("DELETE FROM income_entries", [])
        .map_err(|error| format!("清空收益失败：{error}"))?;
    tx.execute("DELETE FROM quick_prices", [])
        .map_err(|error| format!("清空单价失败：{error}"))?;
    let accounts = tx
        .execute("DELETE FROM account_entries", [])
        .map_err(|error| format!("清空账号账本失败：{error}"))?;
    let goals = tx
        .execute("DELETE FROM goals", [])
        .map_err(|error| format!("清空目标失败：{error}"))?;
    let online = tx
        .execute("DELETE FROM online_sessions", [])
        .map_err(|error| format!("清空上线记录失败：{error}"))?;
    /* 口径也清：单价是用户设定的业务数据，不是「关于库的状态」。留下的后果是
     * 「清空了全部数据，下一次记上线仍按我上次填的价扣点卡」——那不是回到刚装好。 */
    tx.execute("DELETE FROM online_settings", [])
        .map_err(|error| format!("清空点卡口径失败：{error}"))?;

    /* 这里**故意没有** `DELETE FROM meta`。`meta` 存的是关于库的状态而不是账本本身：
     * `schemaVersion`（删了 `init` 会补回「当前版本」，没有意义），以及将来任何
     * 「这件事做过没有」的标记（删了就等于让它重做一遍）。 */
    tx.commit().map_err(|error| format!("提交失败：{error}"))?;
    Ok(Counts {
        characters: characters as i64,
        prices: items as i64,
        entries: entries as i64,
        accounts: accounts as i64,
        goals: goals as i64,
        online: online as i64,
    })
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

    /// 空收益：`replace_all` / `clear_records` 的用例大多不关心收益，
    /// 但签名要求给一份——写一个具名 helper，比在每处写 `&IncomePayload { .. }` 短。
    fn no_income() -> IncomePayload {
        IncomePayload {
            entries: Vec::new(),
            prices: Vec::new(),
        }
    }

    /// 空上线数据：与 `no_income` 同一个理由——`replace_all` 的用例大多不关心它。
    fn no_online() -> OnlinePayload {
        OnlinePayload {
            sessions: Vec::new(),
            settings: OnlineSettings::default(),
        }
    }

    fn entry(id: &str, date: &str, kind: &str, amount: f64, item: &str) -> IncomeEntry {
        IncomeEntry {
            id: id.to_string(),
            date: date.to_string(),
            character_id: "c1".to_string(),
            kind: kind.to_string(),
            amount,
            item: item.to_string(),
            note: String::new(),
            created_at: 1,
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
        /* `init` 只在**缺失时**写 `schemaVersion`（见 `init` 里那段注释：无条件覆写会让
         * 每条读命令都变成一次写事务），所以跑两遍既不该报错，也不该把值改掉。 */
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

    /// 残缺读取必须报错，原始好行与坏行全部留在主库，前端据此暂停写入。
    #[test]
    fn characters_load_refuses_incomplete_roster_and_keeps_raw_rows() {
        let dir = TempDir::new(10);
        let mut conn = open_at(dir.base()).expect("打开数据库");

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

        let error = load_records(&conn, &CHARACTERS).expect_err("残缺名册不能作为可写数据返回");
        assert!(error.contains("记录损坏") && error.contains("sort_order=1"));
        let raw: String = conn
            .query_row("SELECT data FROM characters WHERE id = 'bad'", [], |row| {
                row.get(0)
            })
            .expect("保留坏行以供恢复");
        assert_eq!(raw, rows[1].1);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 3);

        let recovery_dir = dir.base().join("recovery");
        std::fs::create_dir(&recovery_dir).unwrap();
        let saved = recovery_dir.join(DB_FILE);
        snapshot_database(&conn, &saved).expect("业务 JSON 损坏仍可保存原库快照");
        snapshot_database(&conn, &saved).expect_err("不能覆盖已有原库快照");
        save_records(
            &mut conn,
            &CHARACTERS,
            &[serde_json::json!({ "id": "restored" })],
        )
        .expect("快照成功后可用有效名册替换");
        let recovery = open_at(&recovery_dir).expect("快照独立可读，包含已提交 WAL 数据");
        let raw: String = recovery
            .query_row("SELECT data FROM characters WHERE id = 'bad'", [], |row| {
                row.get(0)
            })
            .expect("替换原库之后，快照仍保留损坏行");
        assert_eq!(raw, rows[1].1);
        let count: i64 = recovery
            .query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 3);
    }

    /* ---------- 清空：只清账本，不碰 meta ---------- */

    /// 清空之后三张表都空，而 `meta` 一条都不能少。
    ///
    /// 这条钉的是一个**设计选择**，不是实现细节。`meta` 存的是「关于库的状态」而不是
    /// 账本本身：删掉 `schemaVersion`，`init` 会补一个「当前版本」回来——看着没坏，
    /// 但那是重新编造的状态；将来任何「这件事做过没有」的标记落进同名表，删了就等于
    /// 让它重做一遍。也正因为它是选择而不是细节，用注释说明不够：得有一条会红的测试。
    ///
    /// 探针键故意用一个与业务无关的名字：这条要挡的不是某一个具体标记，而是
    /// 「清账本 ≠ 清状态」这条边界。变异测试很容易证明它的价值——在 `clear_records`
    /// 里补一句 `DELETE FROM meta`，这条必须红。
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
        write_meta(&conn, "probe", "keep-me").expect("写一条与账本无关的状态");

        let counts = clear_records(&mut conn).expect("清空");
        assert_eq!(
            (
                counts.characters,
                counts.prices,
                counts.entries,
                counts.accounts,
                counts.goals,
                counts.online
            ),
            (1, 1, 0, 0, 0, 0),
            "返回的六个数要报出清掉了多少，界面那几句提示靠它"
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
            read_meta(&conn, "probe").expect("读探针键"),
            Some("keep-me".to_string()),
            "meta 里与账本无关的键必须留着——删了等于让「做过的事」变回没做过"
        );
        assert_eq!(
            read_meta(&conn, "schemaVersion").expect("读 schemaVersion"),
            Some(SCHEMA_VERSION.to_string()),
            "schemaVersion 也在 meta 里，同样不许动"
        );
    }

    /* ---------- schemaVersion：只读，不降级 ---------- */

    /// 库里的版本比当前高就拒绝打开。
    ///
    /// 这条挡的是「用户装回旧版本」：旧代码不认识新库的列，若无条件把版本号覆写成
    /// 自己的数字，升级回来之后「小于才迁移」永远不成立——表缺列且无法自愈。
    /// 现在宁可起不来，让用户看到一句「请升级应用」。
    #[test]
    fn open_at_refuses_database_written_by_newer_version() {
        let dir = TempDir::new(15);
        {
            let conn = open_at(dir.base()).expect("先建一个正常库");
            write_meta(&conn, "schemaVersion", &(SCHEMA_VERSION + 1).to_string())
                .expect("把版本改高，模拟更新的应用写过这个库");
        }

        let error = open_at(dir.base()).expect_err("更高版本的库必须拒绝打开");
        assert!(
            error.contains("更新版本") && error.contains("请升级应用"),
            "文案要告诉用户去升级，而不是只报一句看不懂的错误，实际是：{error}"
        );
    }

    /* ---------- 名册整份写回：身份校验 ---------- */

    /// 非法或重复身份必须在清表之前拒绝，原记录保持不变。
    #[test]
    fn save_records_rejects_invalid_ids_before_replacing() {
        let dir = TempDir::new(16);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        let original = vec![serde_json::json!({ "id": "keep", "name": "原有角色" })];
        save_records(&mut conn, &CHARACTERS, &original).unwrap();
        for id in ["c1", " c1 ", "   ", ""] {
            let items = vec![
                serde_json::json!({ "id": "c1" }),
                serde_json::json!({ "id": id }),
            ];
            save_records(&mut conn, &CHARACTERS, &items).expect_err("身份无效时整份拒绝");
            assert_eq!(load_records(&conn, &CHARACTERS).unwrap(), original);
        }
    }

    /* ---------- 导入：整份替换必须原子 ---------- */

    /// `replace_all` 中途撞主键时必须整体回滚：角色、物品、价格**三张表**都还是导入前
    /// 那一份。
    ///
    /// 这条是 M1 的全部依据。早先导入是 `clear_all` → `characters_save` → `prices_save`
    /// 三次提交：`clear_all` 一提交旧数据就没了，之后任一步失败都会留下「旧账已删、
    /// 新账只写了一半」的库，回执里还没有备份路径。
    #[test]
    fn replace_all_rolls_back_and_keeps_previous_ledger() {
        let dir = TempDir::new(17);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        save_items(
            &mut conn,
            &[item(
                "keep",
                "老物品",
                vec![point("keep-p", "2026-01-01", 1.0, 1)],
            )],
        )
        .expect("先落一份能用的物价");
        save_records(
            &mut conn,
            &CHARACTERS,
            &[serde_json::json!({ "id": "keep-c", "name": "老角色" })],
        )
        .expect("先落一份能用的名册");

        /* 两条同一个物品 id：第二次 INSERT 撞主键。模拟「校验漏了重复 id」的兜底。 */
        let duplicated = vec![item("dup", "重复甲", vec![]), item("dup", "重复乙", vec![])];
        let error = replace_all(
            &mut conn,
            &[],
            &duplicated,
            &no_income(),
            &[],
            &[],
            &no_online(),
        )
        .expect_err("重复 id 必须失败");
        assert!(
            error.contains("写入物品"),
            "错误要说清是哪一步失败的，实际是：{error}"
        );

        let items = load_items(&conn).expect("读回物价");
        assert_eq!(items.len(), 1, "整份替换失败后物价必须还是原来那一份");
        assert_eq!(items[0].id, "keep");
        assert_eq!(items[0].points.len(), 1, "历史也一并回滚");

        let characters = load_records(&conn, &CHARACTERS).expect("读回名册");
        assert_eq!(characters.len(), 1, "名册也必须回滚，不许被清空");
        assert_eq!(characters[0]["id"], "keep-c");
    }

    /// 成功路径的返回数是**实际写入条数**，回执直接用它。
    #[test]
    fn replace_all_reports_written_counts() {
        let dir = TempDir::new(18);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        let income = IncomePayload {
            entries: vec![entry("e1", "2026-11-04", "income", 4133.8, "定魂珠")],
            prices: vec![QuickPrice {
                item_id: 9,
                price: 4.6,
            }],
        };
        let accounts = vec![AccountEntry {
            id: "a1".into(),
            date: "2026-11-07".into(),
            character_id: "c1".into(),
            kind: "expense".into(),
            currency: "rmb".into(),
            category: "点卡充值".into(),
            channel: "官方充值".into(),
            amount: 30.0,
            note: "月卡".into(),
            created_at: 2,
            source: String::new(),
        }];
        let goals = vec![
            serde_json::json!({ "id": "g1", "title": "测试目标", "logs": [{ "id": "l1", "delta": 2 }] }),
        ];
        let online = OnlinePayload {
            sessions: vec![OnlineSession {
                id: "o1".into(),
                date: "2026-11-07".into(),
                start_at: 1_700_000_000_000,
                end_at: Some(1_700_000_360_000),
                character_id: "c1".into(),
                roster: vec!["c1".into(), "c2".into()],
                card_price: 15_000.0,
                note: String::new(),
                created_at: 3,
            }],
            settings: OnlineSettings {
                card_price: 18_000.0,
                card_cost: false,
            },
        };
        let counts = replace_all(
            &mut conn,
            &[
                serde_json::json!({ "id": "c1" }),
                serde_json::json!({ "id": "c2" }),
            ],
            &[item("i1", "黑宝石", vec![]), item("i2", "月亮石", vec![])],
            &income,
            &accounts,
            &goals,
            &online,
        )
        .expect("导入");

        assert_eq!(
            (
                counts.characters,
                counts.prices,
                counts.entries,
                counts.accounts,
                counts.goals,
                counts.online
            ),
            (2, 2, 1, 1, 1, 1)
        );
        assert_eq!(load_items(&conn).expect("读物价").len(), 2);
        assert_eq!(load_records(&conn, &CHARACTERS).expect("读名册").len(), 2);
        let back = load_income(&conn).expect("读收益");
        let saved_accounts = load_accounts(&conn).expect("读账号");
        assert_eq!(saved_accounts.len(), 1);
        assert_eq!(saved_accounts[0].note, "月卡");
        assert_eq!(saved_accounts[0].currency, "rmb");
        assert_eq!(load_records(&conn, &GOALS).expect("读目标"), goals);
        assert_eq!(back.entries.len(), 1);
        assert_eq!(back.prices.len(), 1, "单价也要跟着备份一起进来");

        let online_back = load_online(&conn).expect("读上线");
        assert_eq!(online_back.sessions.len(), 1);
        assert_eq!(online_back.sessions[0].roster, vec!["c1", "c2"]);
        assert_eq!(
            online_back.settings.card_price, 18_000.0,
            "口径是单行，整份替换要盖掉默认值"
        );
        assert!(!online_back.settings.card_cost, "开关也要跟着进来");
    }

    /// 收益与单价整份写回：两份一起进、一起出，读回来按日期倒排。
    ///
    /// 这条盯的是**整份语义**：速记的每次点击都是「拿内存里那份改一改再整份写回」，
    /// 若哪天改成增量却漏了「先清」，删掉的记录会悄悄留在库里，而界面永远看不到它。
    #[test]
    fn income_round_trip_keeps_entries_and_prices() {
        let dir = TempDir::new(19);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        save_income(
            &mut conn,
            &IncomePayload {
                entries: vec![
                    entry("e1", "2026-11-03", "income", 25.8, "舍利子 ×2"),
                    entry("e2", "2026-11-04", "expense", 15.0, "金香玉"),
                ],
                prices: vec![
                    QuickPrice {
                        item_id: 20,
                        price: 8.5,
                    },
                    QuickPrice {
                        item_id: 9,
                        price: 4.6,
                    },
                ],
            },
        )
        .expect("写收益");

        let back = load_income(&conn).expect("读收益");
        assert_eq!(back.entries.len(), 2);
        assert_eq!(back.entries[0].id, "e2", "按日期倒排：今天那条在前");
        assert_eq!(back.prices[0].item_id, 9, "单价按 item_id 升序");

        save_income(
            &mut conn,
            &IncomePayload {
                entries: vec![entry("e3", "2026-11-04", "income", 1.0, "")],
                prices: Vec::new(),
            },
        )
        .expect("再写一份");

        let back = load_income(&conn).expect("读收益");
        assert_eq!(back.entries.len(), 1, "整份替换：旧的两条不该留着");
        assert!(back.prices.is_empty(), "单价也是整份替换");
    }

    /// 上线记录与点卡口径整份写回：记录按开始时刻倒排，`end_at` 的 `None` 原样往返。
    ///
    /// `end_at` 那条是重点：计时中的记录靠它为 `NULL` 表达「还没结束」。若哪次
    /// 序列化把它写成 0，读回来就成了一条「1970 年结束」的记录——时长算出来是负数，
    /// 而界面上表现为「今天在线 −20000 小时」，看着像数据坏了。
    #[test]
    fn online_round_trip_keeps_sessions_and_settings() {
        let dir = TempDir::new(20);
        let mut conn = open_at(dir.base()).expect("打开数据库");

        let running = OnlineSession {
            id: "o2".into(),
            date: "2026-11-08".into(),
            start_at: 1_700_000_500_000,
            end_at: None,
            character_id: "c1".into(),
            roster: Vec::new(),
            card_price: 15_000.0,
            note: String::new(),
            created_at: 2,
        };
        let done = OnlineSession {
            id: "o1".into(),
            date: "2026-11-07".into(),
            start_at: 1_700_000_000_000,
            end_at: Some(1_700_000_360_000),
            character_id: "c1".into(),
            roster: vec!["c1".into(), "c2".into()],
            card_price: 15_000.0,
            note: "双开".into(),
            created_at: 1,
        };

        save_online(
            &mut conn,
            &OnlinePayload {
                sessions: vec![done, running],
                settings: OnlineSettings {
                    card_price: 16_500.0,
                    card_cost: true,
                },
            },
        )
        .expect("写上线");

        let back = load_online(&conn).expect("读上线");
        assert_eq!(back.sessions.len(), 2);
        assert_eq!(back.sessions[0].id, "o2", "按开始时刻倒排：最近那段在前");
        assert_eq!(back.sessions[0].end_at, None, "计时中的那一段必须还是 None");
        assert_eq!(back.sessions[1].end_at, Some(1_700_000_360_000));
        assert_eq!(back.sessions[1].roster, vec!["c1", "c2"]);
        assert_eq!(back.settings.card_price, 16_500.0);
        assert!(back.settings.card_cost);

        /* 整份写回：旧的两条不该留着，口径也要被盖掉。 */
        save_online(&mut conn, &no_online()).expect("写空");
        let back = load_online(&conn).expect("再读上线");
        assert!(back.sessions.is_empty());
        assert_eq!(
            back.settings.card_price, 15_000.0,
            "清空之后回到默认口径，而不是留着上一次填的价"
        );
    }

    /// 一行都没有时，口径必须是 1.5 万/点、计入成本。
    ///
    /// 这条挡的是「首次启动读到 0」：单价若是 0，记一天上线算出来的点卡消耗永远是 0，
    /// 而卡片上它长得像「今天没扣点卡」——用户不会去怀疑单价没被读到。
    #[test]
    fn online_settings_default_to_15000_per_point() {
        let dir = TempDir::new(21);
        let conn = open_at(dir.base()).expect("打开数据库");

        let back = load_online(&conn).expect("读空库");
        assert!(back.sessions.is_empty());
        assert_eq!(back.settings.card_price, 15_000.0, "默认 1.5 万/点");
        assert!(back.settings.card_cost, "默认计入成本");
    }
}
