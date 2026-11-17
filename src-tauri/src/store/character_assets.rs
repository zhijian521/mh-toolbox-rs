//! 角色与库存共用物品身份；整份名册保存时，同事务留存换下的物品。
use super::*;
use serde_json::{json, Value};

fn gear_filled(detail: &Value) -> bool {
    ["name", "kind", "flavor", "foot", "note"]
        .iter()
        .any(|key| {
            detail[*key]
                .as_str()
                .is_some_and(|value| !value.trim().is_empty())
        })
        || detail["level"].as_u64().unwrap_or(0) > 0
        || ["stats", "cond", "lines"].iter().any(|key| {
            detail[*key].as_array().is_some_and(|rows| {
                rows.iter().any(|row| {
                    ["value", "extra"].iter().any(|field| {
                        row[*field]
                            .as_str()
                            .is_some_and(|value| !value.trim().is_empty())
                    })
                })
            })
        })
        || detail["requires"].as_array().is_some_and(|rows| {
            rows.iter()
                .any(|row| row.as_str().is_some_and(|value| !value.trim().is_empty()))
        })
}

pub(super) fn merge(inventory: &[Value], roster: &[Value]) -> Result<Vec<Value>, String> {
    validate_record_ids(inventory, "仓库物品")?;
    let mut result = inventory.to_vec();
    let mut worn = HashSet::new();
    for character in roster {
        let character_id = character["id"].as_str().unwrap_or_default();
        let mut soul_saved = false;
        let mut pet_index = 0;
        for (field, kind) in [("gear", "gear"), ("pets", "pet")] {
            let Some(parts) = character[field].as_array() else {
                continue;
            };
            for part in parts {
                let caption = part["caption"].as_str().unwrap_or_default();
                if (kind == "gear" && !gear_filled(&part["detail"]) && caption.trim().is_empty())
                    || (kind == "pet"
                        && part["name"].as_str().unwrap_or_default().trim().is_empty())
                {
                    continue;
                }
                let location = if kind == "gear" {
                    part["slot"].as_str().unwrap_or_default().to_string()
                } else {
                    let location = pet_index.to_string();
                    pet_index += 1;
                    location
                };
                let fallback = format!("{character_id}/{kind}/{location}");
                let id = part["warehouseId"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .unwrap_or(&fallback);
                if id.trim() != id || !worn.insert(id.to_string()) {
                    return Err("同一件物品不能重复穿戴或携带".into());
                }
                let existing = result
                    .iter()
                    .position(|item| item["id"].as_str() == Some(id));
                if let Some(position) = existing {
                    let item = &result[position];
                    if item["kind"] != kind
                        || (kind == "gear" && item["gear"]["slot"] != part["slot"])
                    {
                        return Err("仓库物品种类或部位已变化，请重新选择".into());
                    }
                }
                let mut payload = part.clone();
                if let Some(object) = payload.as_object_mut() {
                    object.remove("warehouseId");
                }
                if kind == "gear" {
                    if !gear_filled(&payload["detail"]) && !caption.trim().is_empty() {
                        payload["detail"] = json!({ "name": caption, "kind": "", "stats": [] });
                    }
                    if payload["caption"].as_str().unwrap_or_default().is_empty() {
                        payload["caption"] = payload["detail"]["name"].clone();
                    }
                }
                let mut item = json!({
                    "id": id,
                    "kind": kind,
                    "server": character["server"].as_str().filter(|value| !value.is_empty())
                        .or_else(|| existing.and_then(|i| result[i]["server"].as_str())).unwrap_or_default(),
                    "createdAt": existing.map(|i| result[i]["createdAt"].clone()).unwrap_or(json!(0)),
                    "updatedAt": character["updatedAt"].as_i64().unwrap_or(0),
                });
                item[kind] = payload;
                if kind == "gear" && !soul_saved && location.starts_with("玉魄") {
                    if let Some(soul) = character["gearMeta"]["soul"]
                        .as_array()
                        .filter(|rows| !rows.is_empty())
                    {
                        item["soul"] = json!(soul);
                        soul_saved = true;
                    }
                }
                if let Some(position) = existing {
                    result[position] = item;
                } else {
                    result.push(item);
                }
            }
        }
    }
    Ok(result)
}

pub(super) fn load(conn: &Connection) -> Result<Vec<Value>, String> {
    merge(
        &load_records(conn, &WAREHOUSE)?,
        &load_records(conn, &CHARACTERS)?,
    )
}

pub(super) fn save_roster(conn: &mut Connection, roster: &[Value]) -> Result<(), String> {
    validate_record_ids(roster, "角色")?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("开事务失败：{error}"))?;
    let inventory = load(&tx)?;
    let next = merge(&inventory, roster)?;
    let stocked: HashSet<_> = inventory
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    let added: HashSet<_> = next
        .iter()
        .filter_map(|item| item["id"].as_str())
        .filter(|id| !stocked.contains(id))
        .collect();
    if !added.is_empty() {
        let sales = load_accounts(&tx)?;
        if sales
            .iter()
            .filter(|entry| entry.kind == "income")
            .flat_map(|entry| entry.assets.iter())
            .filter_map(|item| item["id"].as_str())
            .any(|id| added.contains(id))
        {
            return Err("所选物品已卖出，请重新选择仓库物品".into());
        }
    }
    for (table, values) in [(&CHARACTERS, roster), (&WAREHOUSE, next.as_slice())] {
        tx.execute(&format!("DELETE FROM {}", table.table), [])
            .map_err(|error| format!("清空{}失败：{error}", table.label))?;
        for (index, item) in values.iter().enumerate() {
            insert_record(&tx, table, index, item)?;
        }
    }
    tx.commit().map_err(|error| format!("提交失败：{error}"))
}

pub(super) fn check_worn(conn: &Connection, inventory: &[Value]) -> Result<(), String> {
    let worn = merge(&[], &load_records(conn, &CHARACTERS)?)?;
    if worn
        .iter()
        .any(|item| !inventory.iter().any(|one| one["id"] == item["id"]))
    {
        return Err("物品仍在角色身上，请先卸下或移除后再操作仓库".into());
    }
    Ok(())
}
