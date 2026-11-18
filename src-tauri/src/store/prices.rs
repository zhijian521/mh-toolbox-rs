//! 物价查询、整份保存与导入共用写入；连接和跨领域事务由父模块提供。
use std::collections::HashMap;

use rusqlite::{params, Connection};

use super::{PriceItem, PricePoint};

/// `prices_load` 的本体。命令只负责「怎么拿到连接」，这里只管 SQL——
/// 于是它可以在测试里直接对着一个临时目录跑。
pub(super) fn load_items(conn: &Connection) -> Result<Vec<PriceItem>, String> {
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

/// `prices_save` 的本体（事务在这里）。`Transaction` 在 `?` 提前返回时被 drop，
/// rusqlite 的默认 drop 行为是**回滚**——这就是「整体回滚」的实现，不需要手写 rollback。
pub(super) fn save_items(conn: &mut Connection, items: &[PriceItem]) -> Result<(), String> {
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
pub(super) fn insert_item(conn: &Connection, item: &PriceItem) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflicting_history_rolls_back_items_and_points() {
        let mut conn = Connection::open_in_memory().expect("创建测试数据库");
        super::super::init(&conn).expect("初始化业务表");
        let sample = |id: &str| PriceItem {
            id: id.to_string(),
            name: id.to_string(),
            category: "宝石".to_string(),
            sub: String::new(),
            unit: "颗".to_string(),
            note: String::new(),
            points: vec![PricePoint {
                id: "shared-history".to_string(),
                date: "2026-11-18".to_string(),
                price: 42.0,
                note: String::new(),
                created_at: 1,
            }],
            created_at: 1,
            updated_at: 1,
        };
        save_items(&mut conn, &[sample("keep")]).expect("保存原物品及历史");
        let before = serde_json::to_value(load_items(&conn).unwrap()).unwrap();

        let error = save_items(&mut conn, &[sample("first"), sample("second")])
            .expect_err("不同物品不能写入相同的历史编号");
        assert!(error.contains("写入价格"));
        assert_eq!(
            serde_json::to_value(load_items(&conn).unwrap()).unwrap(),
            before
        );
    }
}
