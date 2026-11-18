//! 收益与速记单价共用查询及写入；跨领域事务仍由父模块编排。
use rusqlite::{params, Connection};

use super::{IncomeEntry, IncomePayload, QuickPrice};

/// `income_load` 的本体。与 `load_items` 同一个理由拆出来：测试能对着临时目录跑。
pub(super) fn load_income(conn: &Connection) -> Result<IncomePayload, String> {
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

pub(super) fn save_income(conn: &mut Connection, payload: &IncomePayload) -> Result<(), String> {
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
pub(super) fn insert_income_entry(conn: &Connection, entry: &IncomeEntry) -> Result<(), String> {
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
pub(super) fn insert_quick_price(conn: &Connection, price: &QuickPrice) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO quick_prices (item_id, price) VALUES (?1, ?2)",
        params![price.item_id, price.price],
    )
    .map_err(|error| format!("写单价失败：{error}"))?;
    Ok(())
}
