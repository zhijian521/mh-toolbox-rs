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
            ReminderKind::Nursery => {
                if let Some((sender, scene)) = nursery(body) {
                    add(scene, sender, None);
                }
            }
            ReminderKind::Stars => {
                if let Some(locations) = star_locations(body) {
                    add(&locations, "星宿现身", None);
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

fn nursery(body: &str) -> Option<(&str, &str)> {
    let (intro, babies) = body.rsplit_once("幼儿园")?;
    let (actor, _) = [
        "砸坏", "挖塌", "挖破", "挖坏", "挖垮", "挖倒", "挖到", "挖出",
    ]
    .iter()
    .find_map(|cue| intro.split_once(cue))?;
    let sender = actor.split_once("挖宝").map_or(actor, |(name, _)| name);
    let sender = sender
        .trim_end_matches("一不小心")
        .trim_end_matches("不小心");
    let (_, message) = babies.split_once("宝宝")?;
    if !["哭闹", "领养", "逃", "跑到"]
        .iter()
        .any(|cue| message.contains(cue))
    {
        return None;
    }
    let place = ["跑到了", "跑到", "逃到了", "逃到", "正在", "在"]
        .iter()
        .find_map(|cue| message.split_once(cue).map(|(_, rest)| rest));
    let scene = place.and_then(|rest| {
        let end = [
            "哭闹", "等待", "等着", "，", ",", "。", "！", "!", "四处", "到处", "逃窜", "逃跑",
        ]
        .iter()
        .filter_map(|cue| rest.find(cue))
        .min()
        .unwrap_or(rest.len());
        map_name(&rest[..end]).filter(|name| name.chars().count() <= 8)
    });
    Some((sender, scene.unwrap_or_default()))
}

fn star_locations(body: &str) -> Option<String> {
    let (_, announcement) = body
        .split_once("二十八星宿")
        .or_else(|| body.split_once("传说中的二十八星"))?;
    // 战报也会提到星宿。只在结果词之前找到现身动作时才视作刷新公告。
    let arrival = ["降临", "下凡", "降落", "现身", "云游", "出现", "散落"]
        .iter()
        .filter_map(|cue| announcement.find(cue))
        .min()?;
    let before_arrival = &body[..body.len() - announcement.len() + arrival];
    if ["获得", "奖励", "称谓", "击败", "战胜", "击杀"]
        .iter()
        .any(|cue| before_arrival.contains(cue))
    {
        return None;
    }
    // 地点缺字仍提示。只播报原文中读到的地名，多地公告合为一条。
    let maps = [
        "傲来国",
        "蓬莱仙岛",
        "女儿村",
        "花果山",
        "龙宫",
        "东海湾",
        "普陀山",
        "大唐国境",
        "大唐境外",
        "大唐官府",
        "长安城",
        "建邺城",
        "长寿村",
        "长寿郊外",
        "北俱芦洲",
        "女娲神迹",
        "五庄观",
        "魔王寨",
        "阴曹地府",
        "盘丝岭",
        "墨家村",
        "狮驼岭",
        "化生寺",
        "方寸山",
        "天宫",
        "麒麟山",
        "宝象国",
        "碗子山",
        "凤巢一层",
        "凤巢二层",
        "龙窟一层",
        "龙窟二层",
        "西梁女国",
        "解阳山",
        "月宫",
        "朱紫国",
        "子母河底",
        "江南野外",
    ];
    let mut found: Vec<_> = maps
        .iter()
        .filter_map(|&map| announcement.find(map).map(|i| (i, map)))
        .collect();
    found.sort_by_key(|&(index, _)| index);
    Some(
        found
            .into_iter()
            .map(|(_, map)| map)
            .collect::<Vec<_>>()
            .join("、"),
    )
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
    if body.contains("幼儿园") || !(body.contains("妖怪") || body.contains("妖魔")) {
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
    let (intro, name_and_location) = body.split_once("携带宝贝的梦")?;
    // 快速引擎在公告中会把「魇」读成「魔」、「叉」读成「又」。仍须匹配完整的出现地点句式。
    let location = ["魇夜叉", "夜叉", "魔夜叉", "魔夜又"]
        .iter()
        .find_map(|name| name_and_location.strip_prefix(*name))?;
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
    let (x, y) = coordinates.split_once([',', '，', '.', '。'])?;
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
        let dotted = [lines[5].replace("321，123", "321.123")];
        let corrected = candidates(&dotted, &filter(ReminderKind::Yiguan, &[]));
        assert_eq!(corrected[0].coordinates.as_deref(), Some("321,123"));
        assert_eq!(tomb.len(), 1);
        assert_eq!(tomb[0].scene, "大唐国境");
        assert_eq!(tomb[0].coordinates.as_deref(), Some("321,123"));
        assert!(candidates(&lines, &filter(ReminderKind::Yaowang, &["花果山"])).is_empty());
        assert!(candidates(&lines, &filter(ReminderKind::Fengyao, &[])).is_empty());
    }

    #[test]
    fn nursery_reports_the_babies_location_once_and_only_from_system_chat() {
        let lines = [
            "[系统]长安城的小甲挖宝时砸坏了怪物幼儿园，一群宝宝正在",
            "建邺城哭闹，各路英雄快来领养！",
            "[世界]小乙挖宝时砸坏了怪物幼儿园，一群宝宝正在龙宫哭闹。",
            "[系统]小乙首次挖出怪物幼儿园，达成了成就。",
        ]
        .map(String::from);
        let hits = || candidates(&lines, &filter(ReminderKind::Nursery, &[]));
        assert!(SeenMessages::default().absorb(hits(), 0).is_empty());
        let mut seen = SeenMessages::default();
        seen.absorb(Vec::new(), 0);
        let alerts = seen.absorb(hits(), 1);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].1.scene, "建邺城");
        assert_eq!(
            nursery("小甲不小心挖塌了怪物幼儿园，一群宝宝逃到了花果山！"),
            Some(("小甲", "花果山"))
        );
        assert_eq!(
            nursery("小甲挖塌了怪物幼儿园，宝宝正在到处逃窜！"),
            Some(("小甲", ""))
        );
        let ordinary = ["[系统]幼儿园小甲挖塌了妖怪的房子，妖怪正在碗子山四处肆虐！".into()];
        assert_eq!(
            candidates(&ordinary, &filter(ReminderKind::Fengyao, &[])).len(),
            1
        );
        assert!(seen.absorb(hits(), 2).is_empty());
    }

    #[test]
    fn stars_only_report_new_system_announcements() {
        let lines = [
            "[世界]传说中的二十八星宿在花果山现身。",
            "[系统]传说中的二十八星宿降临花果山、",
            "龙宫，等待有缘人。",
            "[系统]少侠击败传说中的二十八星宿，获得奖励。",
            "[系统]传说中的二十八星宿挑战结束，少侠获得奖励。",
            "[系统]二十八星宿被击败，新的挑战者现身了。",
        ]
        .map(String::from);
        let hits = || candidates(&lines, &filter(ReminderKind::Stars, &[]));
        assert_eq!(hits().len(), 1);
        let mut seen = SeenMessages::default();
        assert!(seen.absorb(Vec::new(), 0).is_empty());
        let alerts = seen.absorb(hits(), 1);
        assert_eq!(alerts[0].1.scene, "花果山、龙宫");
        assert!(seen.absorb(hits(), 2).is_empty());
        assert_eq!(star_locations("二十八星宿已经下凡"), Some(String::new()));
    }

    #[test]
    fn matches_wrapped_yecha_announcement_with_missing_character() {
        assert_eq!(
            yecha("突然受到少侠的惊扰，一群携带宝贝的梦魔夜又跑到了花果山，"),
            Some(("少侠", "花果山"))
        );
        let lines = [
            "[系统]突然受到一梦8.年的惊扰，一群携带宝贝的梦夜叉跑到了花果山，三界勇士们赶",
            "紧去寻找他们吧，若有幸碰到多只携宝龙龟，将获得意想不到的物品奖励哦",
            "[世界]突然受到玩家的惊扰，一群携带宝贝的梦夜叉跑到了花果山，",
            "[系统]（梦夜叉）少侠追捕梦夜叉后获得了奖励！",
        ]
        .map(String::from);
        let hits = candidates(&lines, &filter(ReminderKind::Yecha, &[]));
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].scene, "花果山");
        assert_eq!(hits[0].key, "花果山:一梦8.年");
        assert!(hits[0].text.contains("赶紧去寻找他们吧"));

        let mut seen = SeenMessages::default();
        assert!(seen.absorb(Vec::new(), 1).is_empty());
        let alerts = seen.absorb(hits, 2);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].1.kind, ReminderKind::Yecha);
        let speech = super::super::spoken_alerts;
        assert_eq!(
            speech(&[alerts.clone(), alerts].concat()),
            ["花果山，梦魇夜叉提醒。"]
        );
        let hits = || candidates(&lines, &filter(ReminderKind::Yecha, &[]));
        assert!(speech(&seen.absorb(hits(), 3)).is_empty());
        assert!(speech(&SeenMessages::default().absorb(hits(), 4)).is_empty());
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
