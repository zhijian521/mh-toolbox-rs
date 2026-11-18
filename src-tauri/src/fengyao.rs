//! 普通封妖公告的后台读取、场景筛选与去重；不依赖页面计时器。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SceneRule {
    name: String,
    min_level: u32,
    aliases: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    source_url: String,
    checked_on: String,
    note: String,
    scenes: Vec<SceneRule>,
}

fn rules() -> Rules {
    serde_json::from_str(include_str!("../../public/game/data/fengyao.json"))
        .expect("随包封妖规则无效")
}

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MessageRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub frame_width: u32,
    pub frame_height: u32,
}

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchConfig {
    pub hwnd: i64,
    pub scenes: Vec<String>,
    pub region: MessageRegion,
}

fn validate(config: &WatchConfig) -> Result<(), String> {
    let r = &config.region;
    if config.hwnd <= 0 {
        return Err("请选择游戏窗口".into());
    }
    if r.width < 80 || r.height < 25 || r.frame_width > 16384 || r.frame_height > 16384
        || r.x.saturating_add(r.width) > r.frame_width
        || r.y.saturating_add(r.height) > r.frame_height
    {
        return Err("请在游戏截图中重新框选消息区域".into());
    }
    let available = rules();
    if config.scenes.is_empty() || config.scenes.iter().any(|name| {
        !available.scenes.iter().any(|s| &s.name == name)
    }) {
        return Err("请至少开启一个提醒场景".into());
    }
    Ok(())
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAlert {
    id: String,
    pub scene: String,
    pub text: String,
    at: i64,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchStatus {
    running: bool,
    config: Option<WatchConfig>,
    title: String,
    error: String,
    text: Vec<String>,
    last_read_at: i64,
    checked_at: i64,
    ocr_ms: u32,
    baseline_ready: bool,
    alerts: Vec<SpawnAlert>,
    notification_error: String,
    rules: Rules,
}

impl Default for WatchStatus {
    fn default() -> Self {
        Self {
            running: false, config: None, title: String::new(), error: String::new(),
            text: Vec::new(), last_read_at: 0, checked_at: 0, ocr_ms: 0,
            baseline_ready: false, alerts: Vec::new(), notification_error: String::new(),
            rules: rules(),
        }
    }
}

#[derive(Default)]
struct Runtime {
    generation: u64,
    status: WatchStatus,
}

fn runtime() -> &'static Mutex<Runtime> {
    static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(Runtime::default()))
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_status() -> Result<WatchStatus, String> {
    let state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    Ok(state.status.clone())
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_stop() -> Result<WatchStatus, String> {
    let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    state.generation += 1;
    state.status.running = false;
    Ok(state.status.clone())
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_start(app: tauri::AppHandle, config: WatchConfig) -> Result<WatchStatus, String> {
    validate(&config)?;
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("封妖监听仅支持 Windows".into())
    }
    #[cfg(windows)]
    {
        let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
        state.generation += 1;
        let generation = state.generation;
        state.status = WatchStatus {
            running: true, config: Some(config.clone()), alerts: state.status.alerts.clone(),
            ..WatchStatus::default()
        };
        let snapshot = state.status.clone();
        std::thread::spawn(move || watch(app, config, generation));
        Ok(snapshot)
    }
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowShot {
    image: String,
    width: u32,
    height: u32,
    title: String,
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_capture(hwnd: i64) -> Result<WindowShot, String> {
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        Err("窗口捕获仅支持 Windows".into())
    }
    #[cfg(windows)]
    {
        let title = crate::screen::list_windows().into_iter().find(|w| w.hwnd == hwnd)
            .ok_or("游戏窗口已关闭，请刷新列表")?.title;
        let capture = crate::window_capture::WindowCapture::open(hwnd)?;
        let frame = capture.frame()?;
        if frame.is_blank() {
            return Err("游戏画面全黑，请还原游戏窗口".into());
        }
        Ok(WindowShot {
            image: crate::window_capture::image_url(&frame),
            width: frame.width, height: frame.height, title,
        })
    }
}

fn compact(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

#[cfg(windows)]
fn message_rows(mut lines: Vec<crate::ocr::TextLine>) -> Vec<String> {
    lines.sort_by_key(|line| line.y + line.height / 2);
    let mut rows: Vec<Vec<crate::ocr::TextLine>> = Vec::new();
    for line in lines {
        let same_row = rows.last().is_some_and(|row| {
            let first = &row[0];
            let distance = (first.y + first.height / 2 - line.y - line.height / 2).abs();
            distance <= first.height.max(line.height) / 2
        });
        if same_row {
            if let Some(row) = rows.last_mut() { row.push(line); }
        } else {
            rows.push(vec![line]);
        }
    }
    rows.into_iter().map(|mut row| {
        row.sort_by_key(|line| line.x);
        let mut text = String::new();
        for line in row {
            let raw = compact(&line.text).replace("系統", "系统");
            // 独立聊天窗的频道签会被检测成单独的文字框，必须按同一行拼回。
            let label = raw.trim_matches(['[', ']', '【', '】', '［', '］']);
            if line.x < 80 && raw.starts_with("系统") {
                text.push_str("[系统]");
                text.push_str(raw.trim_start_matches("系统"));
            } else if line.x < 80 && label == "系统" {
                text.push_str("[系统]");
            } else if line.x < 80 && ["世界", "当前", "队伍", "帮派", "传闻", "门派", "私聊"].contains(&label) {
                text.push('[');
                text.push_str(label);
                text.push(']');
            } else {
                text.push_str(&raw);
            }
        }
        text
    }).collect()
}

/// 只接受系统频道的放妖句式；场景名或“妖怪”单独出现都不触发。
fn announcements(lines: &[String], config: &WatchConfig) -> Vec<(String, String, String)> {
    let mut blocks: Vec<String> = Vec::new();
    for line in lines {
        let line = compact(line);
        if line.starts_with(['[', '【', '［']) {
            blocks.push(line);
        } else if let Some(block) = blocks.last_mut() {
            block.push_str(&line);
        }
    }
    let rules = rules();
    let mut result = Vec::new();
    for block in blocks {
        if !(block.starts_with("[系统]") || block.starts_with("【系统】") || block.starts_with("［系统］")) {
            continue;
        }
        if block.contains("妖王") || block.contains("妖风四起") || block.contains("半小时") {
            continue;
        }
        let Some(cue) = ["挖塌", "放出"].iter().filter_map(|cue| block.find(cue)).min() else {
            continue;
        };
        if !(block.contains("妖怪") || block.contains("妖魔")) {
            continue;
        }
        // 人名可能与地图同名；只在公告正文里匹配地点。
        let body = &block[cue..];
        // 后续无频道的战斗回执不属于放妖地点，不能把其中的场景名也算进来。
        let end = ["寻衅", "肆虐", "各路英雄"].iter()
            .filter_map(|ending| body.find(ending)).min().unwrap_or(body.len());
        let body = &body[..end];
        for scene in &rules.scenes {
            if !config.scenes.contains(&scene.name) {
                continue;
            }
            if !std::iter::once(&scene.name).chain(scene.aliases.iter()).any(|name| body.contains(name)) {
                continue;
            }
            let sender = block[..cue].trim_start_matches(['[', '【', '［'])
                .trim_start_matches("系统").trim_start_matches([']', '】', '］', ':', '：']);
            let sender = sender.split("挖宝").next().unwrap_or(sender);
            let key = format!("{}:{}", scene.name, sender);
            result.push((key, scene.name.clone(), block.clone()));
        }
    }
    result
}

#[derive(Default)]
struct SeenMessages {
    ready: bool,
    seen: HashMap<String, i64>,
    last_scene: HashMap<String, i64>,
}

/// 同一玩家名常因彩字多出或少掉一个字；短名字仍只做精确匹配。
fn same_source(left: &str, right: &str) -> bool {
    if left == right { return true; }
    let (Some((left_scene, left)), Some((right_scene, right))) = (left.split_once(':'), right.split_once(':')) else {
        return false;
    };
    if left_scene != right_scene { return false; }
    let left: Vec<_> = left.chars().collect();
    let right: Vec<_> = right.chars().collect();
    if left.len().min(right.len()) < 4 || left.len().abs_diff(right.len()) > 1 { return false; }
    let (mut a, mut b, mut edits) = (0, 0, 0);
    while a < left.len() && b < right.len() {
        if left[a] == right[b] { a += 1; b += 1; continue; }
        edits += 1;
        if edits > 1 { return false; }
        if left.len() >= right.len() { a += 1; }
        if right.len() >= left.len() { b += 1; }
    }
    edits + (left.len() - a) + (right.len() - b) <= 1
}

impl SeenMessages {
    fn absorb(&mut self, candidates: Vec<(String, String, String)>, now: i64) -> Vec<SpawnAlert> {
        self.seen.retain(|_, last| now - *last < 15 * 60_000);
        let mut alerts = Vec::new();
        for (key, scene, text) in candidates {
            let known = self.seen.keys().find(|seen| same_source(seen, &key)).cloned();
            let recent = self.last_scene.get(&scene).is_some_and(|last| now - *last < 10_000);
            if known.is_none() && !recent && self.ready {
                alerts.push(SpawnAlert { id: format!("{now}:{key}"), scene: scene.clone(), text, at: now });
                self.last_scene.insert(scene, now);
            }
            // 持续可见的旧公告永不过期；只对离屏十五分钟以上的同源公告重新提醒。
            self.seen.insert(known.unwrap_or(key), now);
        }
        self.ready = true;
        alerts
    }
}

#[cfg(windows)]
fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_millis() as i64
}

#[cfg(windows)]
fn watch(app: tauri::AppHandle, config: WatchConfig, generation: u64) {
    use std::hash::{Hash, Hasher};
    use std::time::{Duration, Instant};

    let mut capture = None;
    let mut seen = SeenMessages::default();
    let mut previous_hash = None;
    loop {
        if !runtime().lock().is_ok_and(|state| state.generation == generation && state.status.running) {
            return;
        }
        let started = Instant::now();
        let read = (|| -> Result<Option<(Vec<String>, u64)>, String> {
            if capture.is_none() {
                capture = Some(crate::window_capture::WindowCapture::open(config.hwnd)?);
            }
            let frame = match capture.as_ref().ok_or("捕获尚未建立")?.frame() {
                Ok(frame) => frame,
                // 静止聊天窗没有新帧是正常等待，不能清掉基线后漏报下一条公告。
                Err(error) if previous_hash.is_some() && error.contains("捕获超时") => return Ok(None),
                Err(error) => return Err(error),
            };
            if frame.is_blank() {
                return Err("捕获画面全黑，暂停读取；请检查游戏或锁屏状态".into());
            }
            let r = &config.region;
            if frame.width != r.frame_width || frame.height != r.frame_height {
                return Err("游戏窗口尺寸或缩放已变化，请停止并重新框选消息区域".into());
            }
            let mut pixels = Vec::with_capacity((r.width * r.height * 4) as usize);
            for y in r.y..r.y + r.height {
                let offset = ((y * frame.width + r.x) * 4) as usize;
                pixels.extend_from_slice(&frame.bgra[offset..offset + (r.width * 4) as usize]);
            }
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            pixels.hash(&mut hasher);
            let hash = hasher.finish();
            if previous_hash == Some(hash) {
                return Ok(None);
            }
            let lines = crate::ocr_paddle::recognize(&pixels, r.width, r.height, 2)?;
            // 只在完整 OCR 成功后更新指纹；失败的画面下一轮仍须重试。
            Ok(Some((message_rows(lines), hash)))
        })();
        let Ok(mut state) = runtime().lock() else { return };
        if state.generation != generation || !state.status.running {
            return;
        }
        match read {
            Ok(result) => {
                state.status.error.clear();
                state.status.checked_at = now_ms();
                if let Some((text, hash)) = result {
                    previous_hash = Some(hash);
                    let now = now_ms();
                    let alerts = seen.absorb(announcements(&text, &config), now);
                    state.status.text = text;
                    state.status.last_read_at = now;
                    state.status.ocr_ms = started.elapsed().as_millis() as u32;
                    state.status.baseline_ready = true;
                    state.status.title = crate::screen::list_windows().into_iter()
                        .find(|w| w.hwnd == config.hwnd).map(|w| w.title).unwrap_or_default();
                    for alert in alerts {
                        let body = format!("{}刷妖了 · 请到游戏中确认妖怪仍在", alert.scene);
                        if let Err(error) = crate::notify_alarm(app.clone(), format!("封妖提醒 · {}", alert.scene), body) {
                            state.status.notification_error = format!("系统通知发送失败：{error}");
                        } else {
                            state.status.notification_error.clear();
                        }
                        state.status.alerts.insert(0, alert);
                    }
                    state.status.alerts.truncate(30);
                }
            }
            Err(error) => {
                state.status.error = error;
                // 恢复读取时重新建立基线，不能把暂停期间的旧消息当成刚刷妖。
                seen.ready = false;
                previous_hash = None;
                state.status.baseline_ready = false;
                capture = None;
            }
        }
        drop(state);
        std::thread::sleep(Duration::from_millis(900).saturating_sub(started.elapsed()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> WatchConfig {
        WatchConfig {
            hwnd: 1, scenes: rules().scenes.into_iter().map(|s| s.name).collect(),
            region: MessageRegion { x: 0, y: 0, width: 400, height: 200, frame_width: 800, frame_height: 600 },
        }
    }

    #[test]
    fn parses_wrapped_system_announcement_and_filters_selected_scenes_and_chat() {
        let lines = vec!["[系统]少侠甲挖塌了妖怪的房子，妖怪正在".into(), "碗子山四处肆虐！".into()];
        assert_eq!(announcements(&lines, &config())[0].1, "碗子山");
        let mut selected = config();
        selected.scenes.clear();
        assert!(announcements(&lines, &selected).is_empty());
        selected.scenes.push("柳林坡".into());
        assert!(announcements(&lines, &selected).is_empty());
        let high_scene = ["[系统]少侠甲挖塌了妖怪的房子，妖怪正在柳林坡肆虐！".into()];
        assert_eq!(announcements(&high_scene, &selected)[0].1, "柳林坡");
        assert!(announcements(&["[世界]少侠甲：挖塌妖怪房子，碗子山刷妖了".into()], &config()).is_empty());
        assert!(announcements(&["[系统]少侠放出了妖王，碗子山".into()], &config()).is_empty());
    }

    #[test]
    fn actual_chat_wording_keeps_spawn_scene_separate_from_later_receipts() {
        let lines = vec![
            "[系统]少侠甲挖宝时不慎挖塌了妖怪的房子，一群无家可归的妖怪正在大唐国境寻衅闹事，".into(),
            "各路英雄快前往平乱啊！".into(),
            "你获得了经验，碗子山".into(),
        ];
        let hits = announcements(&lines, &config());
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].1, "大唐国境");
    }

    #[cfg(windows)]
    #[test]
    fn separate_channel_label_is_joined_by_baseline_before_parsing() {
        let line = |text: &str, x, y, width| crate::ocr::TextLine {
            text: text.into(), x, y, width, height: 16, score: 0.99,
        };
        let rows = message_rows(vec![
            line("少侠甲挖塌妖怪的房子，妖怪正在碗子山寻衅闹事", 42, 20, 550),
            line("系统", 2, 22, 30),
        ]);
        assert_eq!(announcements(&rows, &config()).len(), 1);
        let rows = message_rows(vec![line("系统少侠乙挖塌了妖怪的房子，妖怪正在碗子山寻衅闹事", 2, 20, 650)]);
        assert_eq!(announcements(&rows, &config()).len(), 1);
    }

    #[test]
    fn baseline_old_messages_and_distinct_senders_do_not_repeat() {
        let mut seen = SeenMessages::default();
        let hit = |who: &str| vec![(format!("碗子山:{who}"), "碗子山".into(), who.into())];
        assert!(seen.absorb(hit("甲"), 1).is_empty());
        assert!(seen.absorb(hit("甲"), 2).is_empty());
        assert_eq!(seen.absorb(hit("乙"), 3).len(), 1);
        assert!(seen.absorb(hit("乙"), 4).is_empty());
        seen.ready = false;
        assert!(seen.absorb(hit("丙"), 5).is_empty());
        assert!(seen.absorb(hit("丁"), 6).is_empty());
        assert_eq!(seen.absorb(hit("戊"), 11_000).len(), 1);
    }

    #[test]
    fn real_name_ocr_drift_and_same_scene_bursts_are_merged() {
        let mut seen = SeenMessages::default();
        seen.absorb(Vec::new(), 0);
        let hit = |who: &str| vec![(format!("碗子山:{who}"), "碗子山".into(), who.into())];
        assert_eq!(seen.absorb(hit("陌轩心吓敛"), 1).len(), 1);
        assert!(seen.absorb(hit("陌轩心敛"), 4000).is_empty());
        assert!(seen.absorb(hit("另一位玩家"), 5000).is_empty());
        assert!(seen.absorb(hit("陌轩心敛"), 16_000).is_empty());
        assert_eq!(seen.absorb(hit("后来放妖的玩家"), 17_000).len(), 1);
    }

    #[test]
    fn rejects_bad_region_empty_selection_and_unknown_scene() {
        let mut c = config();
        c.region.x = u32::MAX;
        assert!(validate(&c).is_err());
        let mut c = config();
        c.scenes.clear();
        assert!(validate(&c).is_err());
        c.scenes.push("不存在的场景".into());
        assert!(validate(&c).is_err());
        c.scenes = vec!["柳林坡".into(), "比丘国".into()];
        assert!(validate(&c).is_ok());
    }
}
