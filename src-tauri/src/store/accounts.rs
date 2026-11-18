//! 账号账目共用查询及写入；跨领域事务仍由父模块编排。
use rusqlite::{params, Connection};

use super::AccountEntry;

/// `account_load` 的本体。与 `load_income` 同一个理由拆出来：测试能对着临时目录跑。
pub(super) fn load_accounts(conn: &Connection) -> Result<Vec<AccountEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, date, character_id, kind, currency, category, channel, amount, note, \
             created_at, source, assets FROM account_entries ORDER BY date DESC, created_at DESC",
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
                assets: serde_json::from_str(&row.get::<_, String>(11)?).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        11,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?,
            })
        })
        .map_err(|error| format!("读账号账本失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读账号账本失败：{error}"))?;
    Ok(rows)
}

/// 整份写回：清空 + 逐条插入，**一个事务**。
///
/// 与 `save_income` 同一套：整份写的代价是每次几毫秒，换来的是「不会出现界面有、库里没有」。
/// 账号页一次记一笔、一天记几十笔的量级，这点开销不值得用丢账去换。
pub(super) fn save_accounts(conn: &mut Connection, entries: &[AccountEntry]) -> Result<(), String> {
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
pub(super) fn insert_account_entry(conn: &Connection, entry: &AccountEntry) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO account_entries
            (id, date, character_id, kind, currency, category, channel, amount, note, created_at, source, assets)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
            serde_json::to_string(&entry.assets)
                .map_err(|error| format!("保存交易快照失败：{error}"))?,
        ],
    )
    .map_err(|error| format!("写账号记录失败：{error}"))?;
    Ok(())
}
