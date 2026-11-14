use super::*;

/// 一次性目录，离开作用域就删。
struct TempDir {
    path: std::path::PathBuf,
}

impl TempDir {
    /// `seq` 是「第几个用例」，与 pid 一起构成唯一目录名。
    fn new(seq: u32) -> Self {
        let path = std::env::temp_dir().join(format!("mh-toolbox-test-{}-{seq}", std::process::id()));
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
            card_cost: true,
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
        card_cost: true,
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
        card_cost: false,
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
    assert!(back.sessions[0].card_cost);
    assert!(!back.sessions[1].card_cost, "逐段快照与全局口径独立保存");
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

#[test]
fn old_online_rows_inherit_settings_once() {
    let conn = Connection::open_in_memory().expect("临时数据库");
    conn.execute_batch(
        "CREATE TABLE online_sessions (
            id TEXT PRIMARY KEY, date TEXT NOT NULL, start_at INTEGER NOT NULL,
            end_at INTEGER, character_id TEXT NOT NULL, roster TEXT NOT NULL,
            card_price REAL NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL
         );
         CREATE TABLE online_settings (id INTEGER PRIMARY KEY, card_price REAL NOT NULL, card_cost INTEGER NOT NULL);
         INSERT INTO online_settings VALUES (1, 15000, 0);
         INSERT INTO online_sessions VALUES ('old', '2026-11-12', 1000, 2000, 'c1', '[]', 15000, '', 1);",
    )
    .expect("创建旧结构");
    init(&conn).expect("升级");
    assert!(!load_online(&conn).expect("读旧记录").sessions[0].card_cost);
    conn.execute("UPDATE online_settings SET card_cost = 1", []).expect("切换口径");
    init(&conn).expect("重复初始化");
    assert!(!load_online(&conn).expect("再次读取").sessions[0].card_cost);
}

#[test]
fn old_online_json_defaults_to_included() {
    let value = serde_json::json!({
        "id": "old", "date": "2026-11-12", "startAt": 1000, "endAt": 2000,
        "characterId": "c1", "roster": [], "cardPrice": 15000,
        "note": "", "createdAt": 1
    });
    let session: OnlineSession = serde_json::from_value(value).expect("读取旧备份");
    assert!(session.card_cost);
}
