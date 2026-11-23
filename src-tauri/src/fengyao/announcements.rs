use std::collections::HashMap;

use super::{compact, rules, ReminderFilter, ReminderKind, SpawnAlert};

pub(super) struct Candidate {
    index: usize,
    kind: ReminderKind,
    key: String,
    pub(super) scene: String,
    coordinates: Option<String>,
    text: String,
}

pub(super) fn candidates(lines: &[String], filter: &ReminderFilter) -> Vec<Candidate> {
    let mut blocks: Vec<(usize, String)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let line = compact(line);
        if line.starts_with(['[', '【', '［']) {
            blocks.push((index, line));
        } else if let Some((_, block)) = blocks.last_mut() {
            block.push_str(&line);
        }
    }
    let mut result = Vec::new();
    for (index, block) in blocks {
        let Some(body) = ["[系统]", "【系统】", "［系统］"]
            .iter()
            .find_map(|label| block.strip_prefix(*label))
        else {
            continue;
        };
        let mut add = |scene: &str, source: &str, coordinates: Option<String>| {
            if filter.scenes.is_empty() || filter.scenes.iter().any(|name| name == scene) {
                result.push(Candidate {
                    index,
                    kind: filter.kind,
                    key: format!("{scene}:{source}"),
                    scene: scene.into(),
                    coordinates,
                    text: block.clone(),
                });
            }
        };
        match filter.kind {
            ReminderKind::Fengyao => ordinary_spawn(body, |scene, sender| add(scene, sender, None)),
            ReminderKind::Yaowang => {
                if let Some((sender, scene)) = yaowang(body) {
                    add(scene, sender, None);
                }
            }
            ReminderKind::Yecha => {
                if let Some((sender, scene)) = yecha(body) {
                    add(scene, sender, None);
                }
            }
            ReminderKind::Yiguan => {
                if let Some((scene, coordinates)) = yiguan(body) {
                    add(scene, &coordinates, Some(coordinates.clone()));
                }
            }
        }
    }
    result
}

fn ordinary_spawn(body: &str, mut add: impl FnMut(&str, &str)) {
    if ["妖王", "妖风四起", "半小时"]
        .iter()
        .any(|cue| body.contains(cue))
    {
        return;
    }
    let Some(cue) = ["挖塌", "放出"]
        .iter()
        .filter_map(|cue| body.find(cue))
        .min()
    else {
        return;
    };
    let (prefix, body) = body.split_at(cue);
    if !(body.contains("妖怪") || body.contains("妖魔")) {
        return;
    }
    let sender = prefix
        .split("挖宝")
        .next()
        .unwrap_or(prefix)
        .trim_start_matches([':', '：']);
    // 后续无频道的战斗回执不属于当前公告的地点。
    let body = body
        .split_once("正在")
        .map_or(body, |(_, location)| location);
    let end = ["寻衅", "肆虐", "各路英雄"]
        .iter()
        .filter_map(|ending| body.find(ending))
        .min()
        .unwrap_or(body.len());
    for scene in &rules().scenes {
        if std::iter::once(&scene.name)
            .chain(scene.aliases.iter())
            .any(|name| body[..end].contains(name))
        {
            add(&scene.name, sender);
        }
    }
}

fn map_name(name: &str) -> Option<&str> {
    let name = name.trim_matches([':', '：', '「', '」', '《', '》']);
    (name.chars().count() >= 2
        && name.chars().count() <= 40
        && name.chars().all(char::is_alphanumeric))
    .then_some(name)
}

fn yaowang(body: &str) -> Option<(&str, &str)> {
    let (intro, location) = body.split_once("妖王气得正在")?;
    if !intro.contains("妖王脑袋上敲出") || !intro.contains("一个大包") {
        return None;
    }
    let (sender, _) = intro.split_once("挖宝")?;
    let (scene, _) = location.split_once("寻衅闹事")?;
    Some((sender, map_name(scene)?))
}

fn yecha(body: &str) -> Option<(&str, &str)> {
    let (intro, location) = body.split_once("携带宝贝的梦魇夜叉")?;
    let sender = intro.strip_prefix("突然受到")?.split_once("的惊扰")?.0;
    let location = location.trim_start_matches('又').strip_prefix("跑到了")?;
    let (scene, _) = location.split_once(['，', ','])?;
    Some((sender, map_name(scene)?))
}

fn yiguan(body: &str) -> Option<(&str, String)> {
    let body = ["(衣冠古丘)", "（衣冠古丘）"]
        .iter()
        .find_map(|label| body.strip_prefix(*label))?;
    let (location, tail) = body.split_once("处忽然出现")?;
    if !tail.starts_with("一座诡异的墓碑") {
        return None;
    }
    let (_, location) = location.rsplit_once(['!', '！'])?;
    let (scene, coordinates) = location.split_once(['(', '（'])?;
    let coordinates = coordinates.strip_suffix([')', '）'])?;
    let (x, y) = coordinates.split_once([',', '，'])?;
    Some((
        map_name(scene)?,
        format!("{},{}", x.parse::<u16>().ok()?, y.parse::<u16>().ok()?),
    ))
}

#[derive(Default)]
pub(super) struct SeenMessages {
    ready: bool,
    seen: HashMap<String, i64>,
    last_spawn: HashMap<String, i64>,
}

/// 同一玩家名常因彩字多出或少掉一个字；短名字仍只做精确匹配。
fn same_source(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }
    let (Some((left_scene, left)), Some((right_scene, right))) =
        (left.split_once(':'), right.split_once(':'))
    else {
        return false;
    };
    if left_scene != right_scene {
        return false;
    }
    let left: Vec<_> = left.chars().collect();
    let right: Vec<_> = right.chars().collect();
    if left.len().min(right.len()) < 4 || left.len().abs_diff(right.len()) > 1 {
        return false;
    }
    let (mut a, mut b, mut edits) = (0, 0, 0);
    while a < left.len() && b < right.len() {
        if left[a] == right[b] {
            a += 1;
            b += 1;
            continue;
        }
        edits += 1;
        if edits > 1 {
            return false;
        }
        if left.len() >= right.len() {
            a += 1;
        }
        if right.len() >= left.len() {
            b += 1;
        }
    }
    edits + (left.len() - a) + (right.len() - b) <= 1
}

impl SeenMessages {
    pub(super) fn absorb(&mut self, hits: Vec<Candidate>, now: i64) -> Vec<(usize, SpawnAlert)> {
        self.seen.retain(|_, last| now - *last < 15 * 60_000);
        self.last_spawn.retain(|_, last| now - *last < 10_000);
        let mut alerts = Vec::new();
        for Candidate {
            index,
            kind,
            key,
            scene,
            coordinates,
            text,
        } in hits
        {
            let known = self
                .seen
                .keys()
                .find(|seen| {
                    if kind == ReminderKind::Yiguan {
                        *seen == &key
                    } else {
                        same_source(seen, &key)
                    }
                })
                .cloned();
            let recent_spawn =
                kind == ReminderKind::Fengyao && self.last_spawn.contains_key(&scene);
            if known.is_none() && !recent_spawn && self.ready {
                if kind == ReminderKind::Fengyao {
                    self.last_spawn.insert(scene.clone(), now);
                }
                alerts.push((
                    index,
                    SpawnAlert {
                        id: format!("{now}:{}:{key}", kind.label()),
                        kind,
                        scene,
                        coordinates,
                        text,
                        at: now,
                    },
                ));
            }
            // 同一条旧公告持续可见时不断续期，离屏十五分钟后才允许复用同源键。
            self.seen.insert(known.unwrap_or(key), now);
        }
        self.ready = true;
        alerts
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filter(kind: ReminderKind, scenes: &[&str]) -> ReminderFilter {
        ReminderFilter {
            kind,
            scenes: scenes.iter().map(|s| (*s).into()).collect(),
        }
    }

    #[test]
    fn parses_public_client_samples_with_wrapping_and_separate_type_filters() {
        let lines = [
            "[系统]花果山挖宝时候一不小心在妖王脑袋上敲出了一个大包，妖王气得正在",
            "女娲神迹寻衅闹事，各路英雄快前往平乱啊！",
            "【系统】突然受到逐鹿·天下的惊扰，一群携带宝贝的梦魇夜叉又跑到了花果山，",
            "三界勇士们赶紧去寻找他们吧！",
            "[系统]（梦魇夜叉）少侠积极追捕梦魇夜叉，获得了奖励！",
            "［系统］（衣冠古丘）谜墓现魔影，剑灵开古丘！大唐国境（321，123）处忽然出现一座诡异的墓碑，",
            "[世界]突然受到玩家的惊扰，一群携带宝贝的梦魇夜叉又跑到了花果山，",
            "[系统]（剑陵魔影）剑灵开古丘！大唐国境(321,123)处忽然出现一座诡异的墓碑，",
        ].map(String::from);
        let king = candidates(&lines, &filter(ReminderKind::Yaowang, &[]));
        let night = candidates(&lines, &filter(ReminderKind::Yecha, &["花果山"]));
        let tomb = candidates(&lines, &filter(ReminderKind::Yiguan, &[]));
        assert_eq!(king.len(), 1);
        assert_eq!(king[0].scene, "女娲神迹");
        assert_eq!(night.len(), 1);
        assert_eq!(night[0].scene, "花果山");
        assert_eq!(tomb.len(), 1);
        assert_eq!(tomb[0].scene, "大唐国境");
        assert_eq!(tomb[0].coordinates.as_deref(), Some("321,123"));
        assert!(candidates(&lines, &filter(ReminderKind::Yaowang, &["花果山"])).is_empty());
        assert!(candidates(&lines, &filter(ReminderKind::Fengyao, &[])).is_empty());
    }

    #[test]
    fn baseline_and_same_scene_bursts_are_independent_per_type() {
        let mut fengyao = SeenMessages::default();
        let mut yaowang = SeenMessages::default();
        let hit = |kind, who: &str| {
            vec![Candidate {
                index: 0,
                kind,
                key: format!("碗子山:{who}"),
                scene: "碗子山".into(),
                coordinates: None,
                text: who.into(),
            }]
        };
        let spawn = ReminderKind::Fengyao;
        let king = ReminderKind::Yaowang;
        assert!(fengyao.absorb(hit(spawn, "甲"), 0).is_empty());
        assert!(fengyao.absorb(hit(spawn, "甲"), 1).is_empty());
        assert_eq!(fengyao.absorb(hit(spawn, "陌轩心吓敛"), 2).len(), 1);
        assert!(fengyao.absorb(hit(spawn, "陌轩心敛"), 4000).is_empty());
        assert!(fengyao.absorb(hit(spawn, "另一位玩家"), 5000).is_empty());
        assert!(yaowang.absorb(hit(king, "甲"), 6000).is_empty());
        assert_eq!(yaowang.absorb(hit(king, "另一位玩家"), 6001).len(), 1);
        assert!(fengyao.absorb(hit(spawn, "陌轩心敛"), 16_000).is_empty());
        assert_eq!(
            fengyao.absorb(hit(spawn, "后来放妖的玩家"), 17_000).len(),
            1
        );
    }
}
