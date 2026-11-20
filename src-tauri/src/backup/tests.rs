use super::*;

#[test]
fn inline_payload_accepts_current_envelope_and_keeps_asset_snapshots() {
    let mut file = sample();
    file.warehouse = vec![serde_json::json!({
        "id": "demo-stock", "kind": "pet", "pet": { "name": "画魂" }
    })];
    let raw = serde_json::to_string(&file).unwrap();
    let parsed = parse_backup_payload(&raw).expect("内置数据使用当前信封");
    validate_backup(&parsed).unwrap();
    assert_eq!(parsed.warehouse, file.warehouse);
    assert_eq!(parsed.characters, file.characters);
    assert!(parse_backup_payload("{\"format\":").is_err());
    let mut wrong_app = serde_json::to_value(file).unwrap();
    wrong_app["app"] = serde_json::json!("other-app");
    assert!(parse_backup_payload(&wrong_app.to_string()).is_err());
}

#[test]
fn warehouse_backup_preserves_assets_and_accepts_v1_without_warehouse() {
    let mut file = sample();
    file.warehouse = vec![serde_json::json!({
        "id": "asset-1", "kind": "pet", "pet": { "name": "画魂", "growth": "1.287" }
    })];
    let value = serde_json::to_value(&file).unwrap();
    let restored: BackupFile = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(restored.warehouse, file.warehouse);
    validate_backup(&restored).unwrap();
    let mut old = value;
    old["format"] = serde_json::json!(1);
    old.as_object_mut().unwrap().remove("warehouse");
    let restored: BackupFile = serde_json::from_value(old).unwrap();
    check_envelope(&restored).unwrap();
    assert!(restored.warehouse.is_empty());
    file.warehouse.push(file.warehouse[0].clone());
    assert!(validate_backup(&file).is_err());
}

#[test]
fn native_backup_over_sixteen_mb_round_trips_and_rejects_truncated_json() {
    let path = std::env::temp_dir().join(format!("mh-large-backup-{}.json", now_ms()));
    let mut file = sample();
    file.income[0].note = "账".repeat(6 * 1024 * 1024);
    write_to(&path, &file).expect("流式导出大账本");
    assert!(std::fs::metadata(&path).unwrap().len() > MAX_LEGACY_BACKUP_BYTES);
    let restored = read_backup(&path).expect("同一读取入口支持导入和恢复");
    check_envelope(&restored).unwrap();
    validate_backup(&restored).unwrap();
    assert_eq!(restored.income[0].note, file.income[0].note);
    std::fs::write(&path, b"{\"format\":1,").unwrap();
    assert!(read_backup(&path).is_err());
    std::fs::remove_file(path).unwrap();
}

#[test]
fn daily_backups_preserve_data_throttle_and_limit_only_daily_files() {
    let dir = std::env::temp_dir().join(format!("mh-daily-{}-{}", std::process::id(), now_ms()));
    let conn = store::open_at(&dir).expect("临时库");
    let mut conn = conn;
    let first = sample();
    store::replace_all(
        &mut conn,
        &first.characters,
        &first.prices,
        &IncomePayload {
            entries: first.income,
            prices: first.quick_prices,
        },
        &first.accounts,
        &first.goals,
        &OnlinePayload {
            sessions: first.online,
            settings: first.card_settings,
        },
    )
    .expect("写样本");
    let start = 1_800_000_000_000;
    let worker_dir = dir.clone();
    std::thread::spawn(move || daily_backup_at(&worker_dir, start))
        .join()
        .expect("后台线程退出")
        .expect("独立连接首次备份");
    daily_backup_at(&dir, start + 60_000).expect("同日不重复");
    assert_eq!(backup_entries(&dir.join("backups")).unwrap().len(), 1);
    let saved: BackupFile = serde_json::from_slice(
        &std::fs::read(
            dir.join("backups")
                .join(format!("{DAILY_PREFIX}{start}.json")),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(saved.characters, first.characters);
    assert_eq!(saved.accounts.len(), first.accounts.len());
    validate_backup(&saved).expect("备份完整有效");
    let original = dir.join("backups/旧版原件-1.json");
    std::fs::write(&original, b"{}").unwrap();
    for index in 1..=16 {
        daily_backup_at(&dir, start + index * 86_400_000).unwrap();
    }
    let entries = backup_entries(&dir.join("backups")).unwrap();
    assert_eq!(entries.len(), DAILY_KEEP);
    assert!(original.exists());
    assert!(backup_stamp("../账本-daily-123.json").is_none());
    assert!(backup_stamp("账本-daily-not-number.json").is_none());
    drop(conn);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn daily_backup_reads_committed_snapshot_without_waiting_for_pending_write() {
    let dir = std::env::temp_dir().join(format!(
        "mh-daily-snapshot-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let mut conn = store::open_at(&dir).expect("临时库");
    let tx = conn.transaction().expect("开始写事务");
    tx.execute(
        "INSERT INTO characters (id, data, sort_order) VALUES (?1, ?2, 0)",
        rusqlite::params!["pending", r#"{"id":"pending","name":"未提交角色"}"#],
    )
    .expect("未提交写入");
    let start = 1_800_000_000_000;
    let worker_dir = dir.clone();
    std::thread::spawn(move || daily_backup_at(&worker_dir, start))
        .join()
        .expect("后台线程退出")
        .expect("WAL 下读取已提交快照");
    let saved: BackupFile = serde_json::from_slice(
        &std::fs::read(
            dir.join("backups")
                .join(format!("{DAILY_PREFIX}{start}.json")),
        )
        .unwrap(),
    )
    .unwrap();
    assert!(saved.characters.is_empty());
    tx.rollback().expect("撤回未提交写入");
    drop(conn);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn legacy_source_requires_explicit_v10_full_backup() {
    let raw = r#"{"schemaVersion":10,"characters":[],"transactions":[]}"#;
    assert!(validate_legacy_source(raw).is_ok());
    assert!(validate_legacy_source(&format!("\u{feff}{raw}")).is_ok());
    assert!(
        validate_legacy_source(r#"{"schemaVersion":11,"characters":[],"transactions":[]}"#)
            .is_err()
    );
    assert!(validate_legacy_source(r#"{"format":1,"app":"mh-toolbox-rs"}"#).is_err());
    assert!(validate_legacy_source(r#"{"schemaVersion":10,"characters":[]}"#).is_err());
    assert!(validate_legacy_source(&" ".repeat(MAX_LEGACY_BACKUP_BYTES as usize + 1)).is_err());
}

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
        warehouse: vec![],
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
        /* 账号记录给一条人民币、一条梦幻币：往返测试要证明 `currency`
         * 原样过了一遍信封——两本账的单位不同，读回来混了就是一条算错的净额。 */
        accounts: vec![
            AccountEntry {
                assets: vec![],
                id: "a1".to_string(),
                date: "2026-11-05".to_string(),
                character_id: "c1".to_string(),
                kind: "expense".to_string(),
                currency: "rmb".to_string(),
                category: "点卡充值".to_string(),
                channel: "官方充值".to_string(),
                amount: 30.0,
                note: "月卡".to_string(),
                created_at: 2,
                source: String::new(),
            },
            AccountEntry {
                assets: vec![],
                id: "a2".to_string(),
                date: "2026-11-05".to_string(),
                character_id: String::new(),
                kind: "income".to_string(),
                currency: "cash".to_string(),
                category: "游戏币卖出".to_string(),
                channel: "游戏内".to_string(),
                amount: 4_600_000.0,
                note: String::new(),
                created_at: 3,
                /* 一条手记、一条自动：往返测试要证明 `source` 原样过了一遍信封，
                 * 否则「导入之后自动同步的记录变成手记」这种错查不出来。 */
                source: "auto".to_string(),
            },
        ],
        /* 目标也给一条：它同样是 `Value` 透传，「漏序列化」与「本来就没有」
         * 在空数组上长得一模一样，往返测试就抓不到。 */
        goals: vec![serde_json::json!({
            "id": "g1",
            "kind": "manual",
            "title": "攒一把无级别",
            "members": [{ "id": "c1", "name": "大唐" }],
            "target": 100_000_000,
        })],
        /* 上线记录给一条**计时中**的：`endAt` 为 null 才是真跑着的那一段，
         * 若序列化把它写成 0 或丢掉，往返之后会变成一条 1970 年结束的记录。 */
        online: vec![OnlineSession {
            id: "o1".to_string(),
            date: "2026-11-08".to_string(),
            start_at: 1_700_000_000_000,
            end_at: None,
            character_id: "c1".to_string(),
            roster: vec!["c1".to_string(), "c2".to_string()],
            card_price: 15_000.0,
            card_cost: true,
            note: String::new(),
            created_at: 4,
        }],
        card_settings: OnlineSettings {
            card_price: 16_500.0,
            card_cost: false,
        },
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
    /* 样张给过的四栏都要读回来：只断言角色与物价时，后加的四栏序列化漏了也测不出来
     * ——空数组与被吃掉长得一样，只有条数才是判据。 */
    assert_eq!(parsed.income.len(), 1);
    assert_eq!(parsed.income[0].item, "定魂珠");
    assert_eq!(parsed.quick_prices.len(), 1);
    assert_eq!(parsed.quick_prices[0].item_id, 9);
    assert_eq!(parsed.accounts.len(), 2);
    assert_eq!(parsed.accounts[1].currency, "cash");
    /* `source` 必须原样过信封：**导回来变成空串就等于把自动记录降级成手记**，
     * 之后那次同步会另写一条，同一天出现两笔。 */
    assert_eq!(parsed.accounts[1].source, "auto");
    assert_eq!(parsed.accounts[0].source, "");
    assert_eq!(parsed.goals.len(), 1);
    assert_eq!(parsed.goals[0]["title"], "攒一把无级别");
    assert_eq!(parsed.online.len(), 1);
    assert_eq!(parsed.online[0].end_at, None, "计时中的记录往返后仍是 null");
    assert_eq!(parsed.online[0].roster, vec!["c1", "c2"]);
    assert!(parsed.online[0].card_cost, "逐段口径跟随备份往返");
    assert_eq!(parsed.card_settings.card_price, 16_500.0);
    assert!(!parsed.card_settings.card_cost);

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
    let ok =
        validate(&[serde_json::json!({ "id": "c1" })], &[sample_item()]).expect("都有 id 时应通过");
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

#[test]
fn validate_all_collections_before_replacing() {
    validate_backup(&sample()).expect("完整备份可导入");
    for field in ["income", "accounts", "goals"] {
        for duplicate in [false, true] {
            let mut value = serde_json::to_value(sample()).unwrap();
            let records = value[field].as_array_mut().unwrap();
            if duplicate {
                records.push(records[0].clone());
            } else {
                records[0]["id"] = serde_json::json!(" ");
            }
            let file = serde_json::from_value(value).unwrap();
            let error = validate_backup(&file).expect_err("缺失或重复身份必须拒绝");
            assert!(error.contains(if duplicate { "重复" } else { "没有 id" }));
        }
    }
    let mut file = sample();
    file.quick_prices.push(QuickPrice {
        item_id: 9,
        price: 3.0,
    });
    assert!(validate_backup(&file).unwrap_err().contains("速记单价"));
    file.quick_prices.clear();
    file.goals[0]["logs"] = serde_json::json!([{ "id": "l1" }, { "id": "l1" }]);
    assert!(validate_backup(&file)
        .unwrap_err()
        .contains("目标 1 的流水"));
    file.goals[0]["logs"] = serde_json::json!([{}]);
    assert!(validate_backup(&file).unwrap_err().contains("没有 id"));
    file.goals[0]["logs"] = serde_json::json!([{ "id": "l1", "date": "2026-11-14", "delta": 1 }]);
    validate_backup(&file).expect("空单价与有身份的流水合法");
}

#[test]
fn reject_unreadable_goals_before_replacement() {
    let mut file = sample();
    for goal in [
        serde_json::json!({ "id": "g1" }),
        serde_json::json!({ "id": "g1", "kind": "manual", "target": 1, "members": [] }),
        serde_json::json!({ "id": "g1", "kind": "unknown", "target": 1 }),
    ] {
        file.goals = vec![goal];
        assert!(validate_backup(&file).is_err());
    }
    file = sample();
    file.goals[0]["logs"] = serde_json::json!([
        { "id": "l1", "date": "2026-02-31", "delta": 1 }
    ]);
    assert!(validate_backup(&file).is_err());
    for (date, expected) in [
        ("2024-02-29", true),
        ("2026-02-29", false),
        ("2026-13-01", false),
    ] {
        assert_eq!(valid_day(date), expected);
    }
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

    for id in [" c1", "c1 ", "   "] {
        validate(
            &[
                serde_json::json!({ "id": "c1" }),
                serde_json::json!({ "id": id }),
            ],
            &[],
        )
        .expect_err("不能接受空白或首尾带空白的角色 id");
    }

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

/// 单价文件：写得出去、读得回来；坏数据一律拒绝；整本备份也能当单价文件导。
///
/// 最后那条是**刻意保留**的能力，不是巧合：单价文件的信封字段与 `BackupFile` 同名，
/// 于是 serde 忽略多出来的 `characters` / `prices` 等栏，只取 `quickPrices`。
/// 谁哪天把 `PriceFile` 改成 `deny_unknown_fields`，这条会红——那是要知道的。
#[test]
fn price_file_round_trips_and_rejects_bad_rows() {
    let dir = std::env::temp_dir().join(format!("mh-toolbox-price-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("建临时目录");
    let path = dir.join("prices.json");

    let file = PriceFile {
        format: FORMAT,
        app: APP_TAG.to_string(),
        exported_at: 1_700_000_000_000,
        quick_prices: vec![QuickPrice {
            item_id: 9,
            price: 46_000.0,
        }],
    };
    write_to(&path, &file).expect("写单价文件");
    let text = std::fs::read_to_string(&path).expect("读单价文件");
    assert!(
        text.contains("\"quickPrices\""),
        "字段名应与账本备份同名，实际内容：{text}"
    );

    let parsed: PriceFile = serde_json::from_str(&text).expect("读回单价文件");
    check_tag(parsed.format, &parsed.app, "单价文件").expect("自己写的那份必须过");
    validate_prices(&parsed.quick_prices).expect("自己写的那份必须过");
    assert_eq!(parsed.quick_prices[0].item_id, 9);

    /* 空文件：导出可以是空的（一件都没设价），导入不能。 */
    assert!(
        validate_prices(&[])
            .expect_err("空单价必须拒绝")
            .contains("没有单价"),
        "空文件的说法要直白"
    );
    let bad_id = [QuickPrice {
        item_id: 0,
        price: 1.0,
    }];
    assert!(validate_prices(&bad_id).is_err(), "没有物品编号必须拒绝");
    for price in [-1.0, 0.0, f64::INFINITY, f64::NAN] {
        let bad_price = [QuickPrice { item_id: 3, price }];
        assert!(
            validate_prices(&bad_price).is_err(),
            "单价 {price} 必须拒绝"
        );
    }

    /* 信封不对：报错里的名词要跟着走（「单价文件」而不是「备份」）。 */
    let error = check_tag(FORMAT + 1, APP_TAG, "单价文件").expect_err("版本不对必须拒绝");
    assert!(
        error.contains("单价文件") && error.contains(&format!("format={}", FORMAT + 1)),
        "文案要带上名词与看不懂的版本号，实际是：{error}"
    );

    /* 整本备份当单价文件导：多出来的栏被忽略，`quickPrices` 照取。 */
    let backup = serde_json::to_string(&sample()).expect("序列化样张");
    let lifted: PriceFile = serde_json::from_str(&backup).expect("备份也是合法的单价文件");
    check_tag(lifted.format, &lifted.app, "单价文件").expect("备份的信封同样合格");
    assert_eq!(lifted.quick_prices.len(), 1);
    assert_eq!(lifted.quick_prices[0].item_id, 9);

    let _ = std::fs::remove_dir_all(&dir);
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
#[test]
fn combo_goal_backup_keeps_per_character_items_and_rejects_partial_definitions() {
    let goal = serde_json::json!({
        "id": "combo", "kind": "combo", "target": 0, "unit": "项", "tracking": null,
        "members": [{"id": "a", "name": "甲"}, {"id": "b", "name": "乙"}],
        "items": [
            {"characterId": "a", "tracking": {"category": "level", "key": "角色等级"}, "target": 130},
            {"characterId": "b", "tracking": {"category": "assist", "key": "强身术"}, "target": 120}
        ], "logs": []
    });
    assert!(validate_goal(&goal, 0).is_ok());
    let mut transitional = goal.clone();
    transitional["kind"] = serde_json::json!("growth");
    assert!(validate_goal(&transitional, 0).is_ok());
    for items in [
        serde_json::json!([]),
        serde_json::json!([goal["items"][0]]),
        serde_json::json!([goal["items"][0], goal["items"][1], goal["items"][0]]),
        serde_json::json!([
            {"characterId": "a", "tracking": {"category": "level", "key": "角色等级"}, "target": 1.5},
            goal["items"][1]
        ]),
    ] {
        let mut invalid = goal.clone();
        invalid["items"] = items;
        assert!(validate_goal(&invalid, 0).is_err());
    }
}
