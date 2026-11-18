//! 上线记录与点卡设置共用查询及写入；跨领域事务仍由父模块编排。
use rusqlite::{params, Connection, OptionalExtension};

use super::{OnlinePayload, OnlineSession, OnlineSettings};

/// `online_load` 的本体。拆出来的理由与 `load_income` 一样：测试能对着临时目录跑。
pub(super) fn load_online(conn: &Connection) -> Result<OnlinePayload, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, date, start_at, end_at, character_id, roster, card_price, note, created_at, card_cost \
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
                card_cost: row.get::<_, i64>(9)? != 0,
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

pub(super) fn save_online(conn: &mut Connection, payload: &OnlinePayload) -> Result<(), String> {
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
pub(super) fn insert_online_session(
    conn: &Connection,
    session: &OnlineSession,
) -> Result<(), String> {
    /* 名单序列化失败只可能是内有坏字符，这里退回空数组而不是让整次保存失败：
     * 一条记录写不进去，用户丢掉的是这段时间；名单丢了只影响分摊，还能手动补。 */
    let roster = serde_json::to_string(&session.roster).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO online_sessions
            (id, date, start_at, end_at, character_id, roster, card_price, note, created_at, card_cost)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
            session.card_cost,
        ],
    )
    .map_err(|error| format!("写上线记录失败：{error}"))?;
    Ok(())
}
