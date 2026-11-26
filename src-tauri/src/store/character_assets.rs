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

/// 旧档缺省字段与前端补全的零／空值等价；非空字段和数组顺序仍参与快照核对。
fn snapshot_content(value: &Value) -> Option<Value> {
    match value {
        Value::Null | Value::Bool(false) => None,
        Value::String(text) if text.is_empty() => None,
        Value::Number(number) if number.as_f64() == Some(0.0) => None,
        Value::Array(items) if items.is_empty() => None,
        Value::Array(items) => Some(Value::Array(
            items
                .iter()
                .map(|item| snapshot_content(item).unwrap_or(Value::Null))
                .collect(),
        )),
        Value::Object(fields) => {
            let fields: serde_json::Map<String, Value> = fields
                .iter()
                .filter_map(|(key, value)| {
                    snapshot_content(value).map(|value| (key.clone(), value))
                })
                .collect();
            (!fields.is_empty()).then_some(Value::Object(fields))
        }
        _ => Some(value.clone()),
    }
}

/// 只有本次新增且快照匹配的卖出才能解除归属，旧账和普通删库存不获得权限。
pub(super) fn detach_sales(
    conn: &Connection,
    entries: &[AccountEntry],
    inventory: &[Value],
) -> Result<(), String> {
    let previous: HashSet<_> = load_accounts(conn)?
        .into_iter()
        .map(|entry| entry.id)
        .collect();
    let mut roster = load_records(conn, &CHARACTERS)?;
    let worn = merge(&[], &roster)?;
    let current = load(conn)?;
    let mut sold = HashSet::new();
    for item in worn {
        if inventory.iter().any(|one| one["id"] == item["id"]) {
            continue;
        }
        let snapshot = current
            .iter()
            .find(|one| one["id"] == item["id"])
            .and_then(snapshot_content);
        let matched = entries.iter().any(|entry| {
            !previous.contains(&entry.id)
                && entry.kind == "income"
                && entry.source != "auto"
                && ((item["kind"] == "gear" && entry.category == "装备交易")
                    || (item["kind"] == "pet" && entry.category == "召唤兽交易"))
                && entry
                    .assets
                    .iter()
                    .any(|asset| snapshot_content(asset) == snapshot)
        });
        if !matched {
            return Err("穿戴物品的成交资料已变化，请重新选择后出售".into());
        }
        if let Some(id) = item["id"].as_str() {
            sold.insert(id.to_string());
        }
    }
    if sold.is_empty() {
        return Ok(());
    }
    for character in &mut roster {
        let mut sold_jade = false;
        let mut has_jade = false;
        if let Some(gear) = character.get_mut("gear").and_then(Value::as_array_mut) {
            for part in gear {
                let jade = part["slot"]
                    .as_str()
                    .is_some_and(|slot| slot.starts_with("玉魄"));
                if part["warehouseId"]
                    .as_str()
                    .is_some_and(|id| sold.contains(id))
                {
                    sold_jade |= jade;
                    *part = json!({ "slot": part["slot"].clone() });
                } else {
                    has_jade |= jade
                        && part["warehouseId"]
                            .as_str()
                            .is_some_and(|id| !id.is_empty());
                }
            }
        }
        if let Some(pets) = character.get_mut("pets").and_then(Value::as_array_mut) {
            pets.retain(|pet| {
                !pet["warehouseId"]
                    .as_str()
                    .is_some_and(|id| sold.contains(id))
            });
        }
        if sold_jade && !has_jade {
            if let Some(meta) = character.get_mut("gearMeta").and_then(Value::as_object_mut) {
                meta.remove("soul");
            }
        }
    }
    conn.execute("DELETE FROM characters", [])
        .map_err(|error| format!("更新售出归属失败：{error}"))?;
    for (index, character) in roster.iter().enumerate() {
        insert_record(conn, &CHARACTERS, index, character)?;
    }
    Ok(())
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
