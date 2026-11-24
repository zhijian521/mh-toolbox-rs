//! 游戏系统公告的后台读取、分类筛选与去重；不依赖页面计时器。

mod announcements;

use announcements::{candidates, SeenMessages};

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

const SPEECH_SOURCE: &str = "reminder-assistant";

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

fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| {
        serde_json::from_str(include_str!("../../public/game/data/fengyao.json"))
            .expect("随包封妖规则无效")
    })
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ReminderKind {
    Fengyao,
    Yaowang,
    Yecha,
    Yiguan,
    Stars,
}

impl ReminderKind {
    fn label(self) -> &'static str {
        match self {
            Self::Fengyao => "封妖",
            Self::Yaowang => "妖王",
            Self::Yecha => "梦魇夜叉",
            Self::Yiguan => "衣冠古丘",
            Self::Stars => "二十八星宿",
        }
    }
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReminderFilter {
    kind: ReminderKind,
    scenes: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchConfig {
    pub hwnd: i64,
    #[serde(default)]
    pub speech_enabled: bool,
    pub reminders: Vec<ReminderFilter>,
    pub region: MessageRegion,
}

fn validate(config: &WatchConfig) -> Result<(), String> {
    let r = &config.region;
    if config.hwnd <= 0 {
        return Err("请选择独立聊天窗口".into());
    }
    if r.width < 80
        || r.height < 25
        || r.frame_width > 16384
        || r.frame_height > 16384
        || r.x.saturating_add(r.width) > r.frame_width
        || r.y.saturating_add(r.height) > r.frame_height
    {
        return Err("聊天窗口画面尺寸无效，请调整窗口大小后重试".into());
    }
    if config.reminders.is_empty() {
        return Err("请至少开启一种提醒".into());
    }
    validate_filters(&config.reminders)
}

fn validate_filters(filters: &[ReminderFilter]) -> Result<(), String> {
    let mut kinds = std::collections::HashSet::new();
    for filter in filters {
        if !kinds.insert(filter.kind) {
            return Err("提醒类型重复".into());
        }
        if filter.scenes.len() > 64
            || filter.scenes.iter().any(|name| {
                name.is_empty()
                    || name.chars().count() > 40
                    || !name.chars().all(char::is_alphanumeric)
                    || (filter.kind == ReminderKind::Fengyao
                        && !rules().scenes.iter().any(|scene| &scene.name == name))
            })
        {
            return Err("提醒地图设置无效".into());
        }
    }
    Ok(())
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAlert {
    id: String,
    pub kind: ReminderKind,
    pub scene: String,
    pub coordinates: Option<String>,
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
    speech_error: String,
    rules: Rules,
}

impl Default for WatchStatus {
    fn default() -> Self {
        Self {
            running: false,
            config: None,
            title: String::new(),
            error: String::new(),
            text: Vec::new(),
            last_read_at: 0,
            checked_at: 0,
            ocr_ms: 0,
            baseline_ready: false,
            alerts: Vec::new(),
            notification_error: String::new(),
            speech_error: String::new(),
            rules: rules().clone(),
        }
    }
}

#[derive(Default)]
struct Runtime {
    generation: u64,
    status: WatchStatus,
    seen: HashMap<ReminderKind, SeenMessages>,
}

impl Runtime {
    fn replace_filters(&mut self, filters: &[ReminderFilter]) -> Result<(), String> {
        let config = self.status.config.as_ref().ok_or("当前监听缺少设置")?;
        // 变化的类型从上一帧建立基线，保留下一帧里真正新增的公告。
        self.seen.retain(|kind, _| {
            filters
                .iter()
                .any(|filter| filter.kind == *kind && config.reminders.contains(filter))
        });
        if self.status.baseline_ready {
            for filter in filters {
                self.seen.entry(filter.kind).or_insert_with(|| {
                    let mut seen = SeenMessages::default();
                    seen.absorb(
                        candidates(&self.status.text, filter),
                        self.status.last_read_at,
                    );
                    seen
                });
            }
        }
        Ok(())
    }
}

fn runtime() -> &'static Mutex<Runtime> {
    static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(Runtime::default()))
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_status() -> Result<WatchStatus, String> {
    let state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    let mut status = state.status.clone();
    status.speech_error = crate::speech::error(SPEECH_SOURCE);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub async fn fengyao_preview_speech() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| crate::speech::preview(SPEECH_SOURCE, "花果山，发现梦魇夜叉。"))
        .await
        .map_err(|e| format!("试听失败：{e}"))?
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_set_speech(enabled: bool) -> Result<(), String> {
    let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    if let Some(config) = state.status.config.as_mut() {
        config.speech_enabled = enabled;
    }
    if !enabled {
        crate::speech::cancel(SPEECH_SOURCE);
    }
    Ok(())
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_stop() -> Result<WatchStatus, String> {
    let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    crate::speech::cancel(SPEECH_SOURCE);
    state.generation += 1;
    state.status.running = false;
    state.seen.clear();
    Ok(state.status.clone())
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_update(reminders: Vec<ReminderFilter>) -> Result<WatchStatus, String> {
    validate_filters(&reminders)?;
    let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    if !state.status.running {
        return Err("监听已停止，请重新开始".into());
    }
    state.replace_filters(&reminders)?;
    crate::speech::cancel(SPEECH_SOURCE);
    if reminders.is_empty() {
        state.generation += 1;
        state.status.running = false;
    }
    if let Some(config) = state.status.config.as_mut() {
        config.reminders = reminders;
    }
    Ok(state.status.clone())
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_start(app: tauri::AppHandle, config: WatchConfig) -> Result<WatchStatus, String> {
    validate(&config)?;
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("公告监听仅支持 Windows".into())
    }
    #[cfg(windows)]
    {
        let mut state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
        state.generation += 1;
        let generation = state.generation;
        crate::speech::cancel(SPEECH_SOURCE);
        state.seen.clear();
        state.status = WatchStatus {
            running: true,
            config: Some(config.clone()),
            alerts: state.status.alerts.clone(),
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
        let title = crate::screen::list_windows()
            .into_iter()
            .find(|w| w.hwnd == hwnd)
            .ok_or("聊天窗口已关闭，请刷新列表")?
            .title;
        let capture = crate::window_capture::WindowCapture::open(hwnd)?;
        let frame = capture.frame()?;
        if frame.is_blank() {
            return Err("聊天窗口画面不可见，请还原窗口".into());
        }
        Ok(WindowShot {
            image: crate::window_capture::image_url(&frame),
            width: frame.width,
            height: frame.height,
            title,
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
            if let Some(row) = rows.last_mut() {
                row.push(line);
            }
        } else {
            rows.push(vec![line]);
        }
    }
    rows.into_iter()
        .map(|mut row| {
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
                } else if line.x < 80
                    && ["世界", "当前", "队伍", "帮派", "传闻", "门派", "私聊"].contains(&label)
                {
                    text.push('[');
                    text.push_str(label);
                    text.push(']');
                } else {
                    text.push_str(&raw);
                }
            }
            text
        })
        .collect()
}

#[cfg(windows)]
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(windows)]
fn watch(app: tauri::AppHandle, config: WatchConfig, generation: u64) {
    use std::hash::{Hash, Hasher};
    use std::time::{Duration, Instant};

    let mut capture = None;
    let mut previous_hash = None;
    loop {
        if !runtime()
            .lock()
            .is_ok_and(|state| state.generation == generation && state.status.running)
        {
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
                Err(error) if previous_hash.is_some() && error.contains("捕获超时") => {
                    return Ok(None);
                }
                Err(error) => return Err(error),
            };
            if frame.is_blank() {
                return Err("聊天窗口画面不可见，暂停读取；请还原窗口".into());
            }
            let r = &config.region;
            if frame.width != r.frame_width || frame.height != r.frame_height {
                return Err("聊天窗口尺寸或缩放已变化，请停止后重新开始监听".into());
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
        let Ok(mut state) = runtime().lock() else {
            return;
        };
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
                    let filters = state
                        .status
                        .config
                        .as_ref()
                        .map(|current| current.reminders.clone())
                        .unwrap_or_default();
                    let mut alerts = Vec::new();
                    for filter in &filters {
                        let hits = candidates(&text, filter);
                        alerts.extend(state.seen.entry(filter.kind).or_default().absorb(hits, now));
                    }
                    alerts.sort_by_key(|(index, _)| *index);
                    state.status.text = text;
                    state.status.last_read_at = now;
                    state.status.ocr_ms = started.elapsed().as_millis() as u32;
                    state.status.baseline_ready = true;
                    state.status.title = crate::screen::list_windows()
                        .into_iter()
                        .find(|w| w.hwnd == config.hwnd)
                        .map(|w| w.title)
                        .unwrap_or_default();
                    if state.status.config.as_ref().is_some_and(|cfg| cfg.speech_enabled) {
                        for text in spoken_alerts(&alerts) {
                            crate::speech::announce(SPEECH_SOURCE, text);
                        }
                    }
                    for (_, alert) in alerts {
                        let title = if alert.scene.is_empty() {
                            format!("{}提醒", alert.kind.label())
                        } else {
                            format!("{}提醒 · {}", alert.kind.label(), alert.scene)
                        };
                        let body = match &alert.coordinates {
                            Some(coordinates) => format!("刷新坐标（{coordinates}）"),
                            None => "已读到刷新公告，请到游戏内确认".into(),
                        };
                        if let Err(error) = crate::notify_alarm(app.clone(), title, body) {
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
                // 恢复读取时重新建立基线，避免把暂停期间的公告当成新消息。
                state.seen.clear();
                previous_hash = None;
                state.status.baseline_ready = false;
                capture = None;
            }
        }
        drop(state);
        std::thread::sleep(Duration::from_millis(900).saturating_sub(started.elapsed()));
    }
}

#[cfg(any(windows, test))]
fn spoken_alerts(alerts: &[(usize, SpawnAlert)]) -> Vec<String> {
    let mut spoken = Vec::new();
    for (_, alert) in alerts {
        let mut text = if alert.scene.is_empty() {
            format!("{}提醒", alert.kind.label())
        } else {
            format!("{}，{}提醒", alert.scene, alert.kind.label())
        };
        if let Some(coordinates) = &alert.coordinates {
            text.push_str(&format!("，坐标{}", coordinates.replace(',', "，")));
        }
        text.push('。');
        if !spoken.contains(&text) {
            spoken.push(text);
        }
    }
    spoken
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> WatchConfig {
        WatchConfig {
            hwnd: 1,
            speech_enabled: false,
            reminders: vec![ReminderFilter {
                kind: ReminderKind::Fengyao,
                scenes: vec![],
            }],
            region: MessageRegion {
                x: 0,
                y: 0,
                width: 400,
                height: 200,
                frame_width: 800,
                frame_height: 600,
            },
        }
    }

    #[test]
    fn parses_wrapped_system_announcement_and_filters_selected_scenes_and_chat() {
        let lines = vec![
            "[系统]少侠甲挖塌了妖怪的房子，妖怪正在".into(),
            "碗子山四处肆虐！".into(),
        ];
        assert_eq!(
            candidates(&lines, &config().reminders[0])[0].scene,
            "碗子山"
        );
        let mut selected = config();
        selected.reminders[0].scenes.push("柳林坡".into());
        assert!(candidates(&lines, &selected.reminders[0]).is_empty());
        let high_scene = ["[系统]少侠甲挖塌了妖怪的房子，妖怪正在柳林坡肆虐！".into()];
        assert_eq!(
            candidates(&high_scene, &selected.reminders[0])[0].scene,
            "柳林坡"
        );
        assert!(candidates(
            &["[世界]少侠甲：挖塌妖怪房子，碗子山刷妖了".into()],
            &config().reminders[0]
        )
        .is_empty());
        assert!(candidates(
            &["[系统]少侠放出了妖王，碗子山".into()],
            &config().reminders[0]
        )
        .is_empty());
    }

    #[test]
    fn actual_chat_wording_keeps_spawn_scene_separate_from_later_receipts() {
        let lines = vec![
            "[系统]少侠甲挖宝时不慎挖塌了妖怪的房子，一群无家可归的妖怪正在大唐国境寻衅闹事，"
                .into(),
            "各路英雄快前往平乱啊！".into(),
            "你获得了经验，碗子山".into(),
        ];
        let hits = candidates(&lines, &config().reminders[0]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].scene, "大唐国境");
    }

    #[cfg(windows)]
    #[test]
    fn separate_channel_label_is_joined_by_baseline_before_parsing() {
        let line = |text: &str, x, y, width| crate::ocr::TextLine {
            text: text.into(),
            x,
            y,
            width,
            height: 16,
            score: 0.99,
        };
        let rows = message_rows(vec![
            line("少侠甲挖塌妖怪的房子，妖怪正在碗子山寻衅闹事", 42, 20, 550),
            line("系统", 2, 22, 30),
        ]);
        assert_eq!(candidates(&rows, &config().reminders[0]).len(), 1);
        let rows = message_rows(vec![line(
            "系统少侠乙挖塌了妖怪的房子，妖怪正在碗子山寻衅闹事",
            2,
            20,
            650,
        )]);
        assert_eq!(candidates(&rows, &config().reminders[0]).len(), 1);
    }

    #[test]
    fn live_filter_change_seeds_new_type_without_resetting_other_type() {
        let config = config();
        let spawn = config.reminders[0].clone();
        let king = ReminderFilter {
            kind: ReminderKind::Yaowang,
            scenes: vec![],
        };
        let previous = "[系统]少侠甲挖宝时在妖王脑袋上敲出了一个大包，妖王气得正在女娲神迹寻衅闹事"
            .to_string();
        let old_spawn = "[系统]少侠甲挖塌了妖怪房子，妖怪正在柳林坡寻衅闹事".to_string();
        let mut state = Runtime {
            status: WatchStatus {
                config: Some(config),
                baseline_ready: true,
                last_read_at: 1,
                text: vec![previous.clone()],
                ..WatchStatus::default()
            },
            ..Runtime::default()
        };
        state
            .seen
            .entry(spawn.kind)
            .or_default()
            .absorb(candidates(&[old_spawn.clone()], &spawn), 0);
        state
            .replace_filters(&[spawn.clone(), king.clone()])
            .unwrap();
        let next = vec![
            previous,
            "[系统]另一位少侠挖宝时在妖王脑袋上敲出了一个大包，妖王气得正在女娲神迹寻衅闹事".into(),
        ];
        assert_eq!(
            state
                .seen
                .get_mut(&king.kind)
                .unwrap()
                .absorb(candidates(&next, &king), 2)
                .len(),
            1
        );
        let new_spawn = "[系统]少侠乙挖塌了妖怪房子，妖怪正在柳林坡寻衅闹事".into();
        assert_eq!(
            state
                .seen
                .get_mut(&spawn.kind)
                .unwrap()
                .absorb(candidates(&[old_spawn, new_spawn], &spawn), 2)
                .len(),
            1
        );
    }

    #[test]
    fn rejects_bad_region_empty_selection_and_unknown_scene() {
        let mut c = config();
        c.region.x = u32::MAX;
        assert!(validate(&c).is_err());
        let mut c = config();
        c.reminders.clear();
        assert!(validate(&c).is_err());
        let mut c = config();
        c.reminders[0].scenes.push("不存在的场景".into());
        assert!(validate(&c).is_err());
        c.reminders[0].scenes = vec!["柳林坡".into(), "比丘国".into()];
        assert!(validate(&c).is_ok());
    }
}
