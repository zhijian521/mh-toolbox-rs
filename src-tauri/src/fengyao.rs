//! 游戏系统公告的后台读取、分类筛选与去重；不依赖页面计时器。

mod announcements;

use announcements::{candidates, SeenMessages};

use std::collections::HashMap;
#[cfg(windows)]
use std::ops::Range;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

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
    Nursery,
}

impl ReminderKind {
    fn label(self) -> &'static str {
        match self {
            Self::Fengyao => "封妖",
            Self::Yaowang => "妖王",
            Self::Yecha => "梦魇夜叉",
            Self::Yiguan => "衣冠古丘",
            Self::Stars => "二十八星宿",
            Self::Nursery => "宝宝幼儿园",
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
    #[serde(default)]
    pub fast_ocr: bool,
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
    frame_wait_ms: u32,
    engine: String,
    engine_fallback: Option<String>,
    alert_timing: Option<AlertTiming>,
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
            frame_wait_ms: 0,
            engine: String::new(),
            engine_fallback: None,
            alert_timing: None,
            baseline_ready: false,
            alerts: Vec::new(),
            notification_error: String::new(),
            speech_error: String::new(),
            rules: rules().clone(),
        }
    }
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct AlertTiming {
    matched_ms: u32,
    playback_ms: Option<u32>,
    playback_p95_ms: Option<u32>,
    playback_samples: usize,
}

struct TimedMatch {
    arrived: Instant,
    matched_ms: u32,
    playback: Arc<OnceLock<Instant>>,
}

fn timing(samples: &std::collections::VecDeque<TimedMatch>) -> Option<AlertTiming> {
    let last = samples.back()?;
    let playback_ms = |sample: &TimedMatch| {
        sample
            .playback
            .get()
            .map(|at| at.duration_since(sample.arrived).as_millis() as u32)
    };
    let mut played: Vec<_> = samples.iter().filter_map(playback_ms).collect();
    played.sort_unstable();
    let p95 = (played.len() * 95)
        .div_ceil(100)
        .checked_sub(1)
        .map(|index| played[index]);
    Some(AlertTiming {
        matched_ms: last.matched_ms,
        playback_ms: playback_ms(last),
        playback_p95_ms: p95,
        playback_samples: played.len(),
    })
}

#[derive(Default)]
struct Runtime {
    timings: std::collections::VecDeque<TimedMatch>,
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

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchSummary {
    running: bool,
    error: String,
    baseline_ready: bool,
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_summary() -> Result<WatchSummary, String> {
    let state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    Ok(WatchSummary {
        running: state.status.running,
        error: state.status.error.clone(),
        baseline_ready: state.status.baseline_ready,
    })
}

#[tauri::command(async)]
#[specta::specta]
pub fn fengyao_status() -> Result<WatchStatus, String> {
    let state = runtime().lock().map_err(|_| "监听状态不可读，请重启应用")?;
    let mut status = state.status.clone();
    status.alert_timing = timing(&state.timings);
    status.speech_error = crate::speech::error(SPEECH_SOURCE);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub async fn fengyao_preview_speech() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        crate::speech::preview(SPEECH_SOURCE, "花果山，发现梦魇夜叉。")
    })
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
        state.timings.clear();
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
                let system_body = raw
                    .strip_prefix("系统")
                    .or_else(|| raw.strip_prefix("（系统》"));
                if let Some(body) = system_body.filter(|_| line.x < 80 && text.is_empty()) {
                    text.push_str("[系统]");
                    text.push_str(body);
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
struct ChatFrame {
    pixels: Vec<u8>,
    lines: Vec<crate::ocr::TextLine>,
}

#[cfg(windows)]
fn line_intersects(line: &crate::ocr::TextLine, rows: &Range<usize>) -> bool {
    line.y < rows.end as i32 && line.y + line.height > rows.start as i32
}

#[cfg(windows)]
fn recognition_rows(
    changed: Range<usize>,
    height: usize,
    lines: &[crate::ocr::TextLine],
) -> Range<usize> {
    // 保留临近文字的留白；裁边碰到已知文字框时扩大到完整行。
    let mut rows = changed.start.saturating_sub(24)..(changed.end + 24).min(height);
    loop {
        let before = rows.clone();
        for line in lines {
            let top = (line.y - 4).max(0) as usize;
            let bottom = ((line.y + line.height + 4).max(0) as usize).min(height);
            if top < rows.end && bottom > rows.start {
                rows.start = rows.start.min(top);
                rows.end = rows.end.max(bottom);
            }
        }
        if rows == before {
            break;
        }
    }
    if rows.start < 24 {
        rows.start = 0;
    }
    if height - rows.end < 24 {
        rows.end = height;
    }
    rows
}

// 当聊天记录与另一处动画同时刷新时，在最长的静止区分开识别。
// 只复用逐行完全相同的像素，并在两侧保留完整文字和识别边距。
#[cfg(windows)]
fn changed_bands(previous: &[u8], pixels: &[u8], stride: usize) -> Vec<Range<usize>> {
    const MIN_GAP: usize = 128;
    let mut changed = previous
        .chunks_exact(stride)
        .zip(pixels.chunks_exact(stride))
        .enumerate()
        .filter_map(|(y, (before, after))| (before != after).then_some(y));
    let Some(first) = changed.next() else {
        return Vec::new();
    };
    let mut last = first;
    let mut gap = 0..0;
    for y in changed {
        let unchanged = last + 1..y;
        if unchanged.len() >= MIN_GAP && unchanged.len() > gap.len() {
            gap = unchanged;
        }
        last = y;
    }
    let mut bands = Vec::with_capacity(2);
    if gap.is_empty() {
        bands.push(first..last + 1);
    } else {
        bands.push(first..gap.start);
        bands.push(gap.end..last + 1);
    }
    bands
}

#[cfg(windows)]
fn read_changed_bands(
    previous: &ChatFrame,
    pixels: &[u8],
    width: u32,
    changed: &[Range<usize>],
    read: &mut impl FnMut(&[u8], u32, u32) -> Result<Vec<crate::ocr::TextLine>, String>,
) -> Option<Vec<crate::ocr::TextLine>> {
    let stride = width as usize * 4;
    let height = pixels.len() / stride;
    let mut bands: Vec<_> = changed
        .iter()
        .map(|rows| recognition_rows(rows.clone(), height, &previous.lines))
        .collect();
    let mut lines = Vec::new();
    for i in 0..bands.len() {
        for attempt in 0..2 {
            if bands.iter().map(Range::len).sum::<usize>() * 4 >= height * 3
                || bands.windows(2).any(|pair| pair[0].end >= pair[1].start)
            {
                return None;
            }
            let rows = &bands[i];
            let mut band = read(
                &pixels[rows.start * stride..rows.end * stride],
                width,
                rows.len() as u32,
            )
            .ok()?;
            if band.is_empty()
                && previous
                    .lines
                    .iter()
                    .any(|line| line_intersects(line, rows))
            {
                return None;
            }
            if band.iter().any(|line| {
                (rows.start > 0 && line.y <= 2)
                    || (rows.end < height && line.y + line.height >= rows.len() as i32 - 2)
            }) {
                // 小区域裁到文字时先扩大一圈；仍然不完整才整窗重读。
                if attempt == 1 || rows.len() * 3 >= height {
                    return None;
                }
                bands[i] = recognition_rows(rows.clone(), height, &previous.lines);
                continue;
            }
            for line in &mut band {
                line.y += rows.start as i32;
            }
            lines.extend(band);
            break;
        }
    }
    lines.extend(
        previous
            .lines
            .iter()
            .filter(|line| !bands.iter().any(|rows| line_intersects(line, rows)))
            .cloned(),
    );
    Some(lines)
}

#[cfg(windows)]
fn recognize_chat_frame(
    previous: Option<&ChatFrame>,
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    mut read: impl FnMut(&[u8], u32, u32) -> Result<Vec<crate::ocr::TextLine>, String>,
) -> Result<Option<ChatFrame>, String> {
    let updated = if let Some(previous) = previous {
        let changes = changed_bands(&previous.pixels, &pixels, width as usize * 4);
        if changes.is_empty() {
            return Ok(None);
        }
        read_changed_bands(previous, &pixels, width, &changes, &mut read)
    } else {
        None
    };
    let lines = match updated {
        Some(lines) => lines,
        None => read(&pixels, width, height)?,
    };
    Ok(Some(ChatFrame { pixels, lines }))
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
    use std::time::Duration;

    let mut capture = None;
    let mut chat_ocr = None;
    let mut previous = None;
    loop {
        if !runtime()
            .lock()
            .is_ok_and(|state| state.generation == generation && state.status.running)
        {
            return;
        }
        let mut arrived = None;
        let mut ocr_start = None;
        let mut ocr_duration = Duration::ZERO;
        let read = (|| -> Result<Option<ChatFrame>, String> {
            if capture.is_none() {
                capture = Some(crate::window_capture::WindowCapture::open(config.hwnd)?);
            }
            let Some((at, frame)) = capture.as_ref().ok_or("捕获尚未建立")?.next_frame()?
            else {
                return if previous.is_some() {
                    Ok(None)
                } else {
                    Err("等待聊天窗口首帧超时".into())
                };
            };
            arrived = Some(at);
            if frame.is_blank() {
                return Err("聊天窗口画面不可见，暂停读取；请还原窗口".into());
            }
            let r = &config.region;
            if frame.width != r.frame_width || frame.height != r.frame_height {
                return Err("聊天窗口尺寸或缩放已变化，请停止后重新开始监听".into());
            }
            let pixels = if r.width == frame.width && r.height == frame.height {
                frame.bgra
            } else {
                let mut pixels = Vec::with_capacity((r.width * r.height * 4) as usize);
                for y in r.y..r.y + r.height {
                    let offset = ((y * frame.width + r.x) * 4) as usize;
                    pixels.extend_from_slice(&frame.bgra[offset..offset + (r.width * 4) as usize]);
                }
                pixels
            };
            recognize_chat_frame(previous.as_ref(), pixels, r.width, r.height, |buf, w, h| {
                let started = Instant::now();
                ocr_start.get_or_insert(started);
                let engine = chat_ocr.get_or_insert_with(|| {
                    crate::ocr_paddle::ncnn::Recognizer::open(config.fast_ocr)
                });
                let lines = engine.recognize(buf, w, h);
                ocr_duration += started.elapsed();
                lines
            })
        })()
        .map(|frame| frame.map(|frame| (message_rows(frame.lines.clone()), frame)));
        let Ok(mut state) = runtime().lock() else {
            return;
        };
        if state.generation != generation || !state.status.running {
            return;
        }
        // 静态游戏也可能持续呈帧。只在连续相同画面后限频，刷屏时立即读最新帧。
        let unchanged = arrived.is_some() && matches!(&read, Ok(None));
        let failed = read.is_err();
        match read {
            Ok(result) => {
                state.status.error.clear();
                state.status.checked_at = now_ms();
                if let Some((text, frame)) = result {
                    previous = Some(frame);
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
                    state.status.ocr_ms = ocr_duration.as_millis() as u32;
                    let at = arrived.expect("识别结果来自捕获帧");
                    state.status.frame_wait_ms =
                        ocr_start.unwrap_or(at).duration_since(at).as_millis() as u32;
                    if let Some(engine) = &chat_ocr {
                        state.status.engine = engine.label().into();
                        state.status.engine_fallback.clone_from(&engine.fallback);
                    }
                    let matched_ms = at.elapsed().as_millis() as u32;
                    let mut playback = None;
                    state.status.baseline_ready = true;
                    if state.status.title.is_empty() {
                        state.status.title = crate::screen::list_windows()
                            .into_iter()
                            .find(|w| w.hwnd == config.hwnd)
                            .map(|w| w.title)
                            .unwrap_or_default();
                    }
                    if state
                        .status
                        .config
                        .as_ref()
                        .is_some_and(|cfg| cfg.speech_enabled)
                    {
                        for text in spoken_alerts(&alerts) {
                            let started = crate::speech::announce(SPEECH_SOURCE, text);
                            playback.get_or_insert(started);
                        }
                    }
                    if !alerts.is_empty() {
                        if state.timings.len() == 32 {
                            state.timings.pop_front();
                        }
                        state.timings.push_back(TimedMatch {
                            arrived: at,
                            matched_ms,
                            playback: playback.unwrap_or_default(),
                        });
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
                previous = None;
                state.status.baseline_ready = false;
                capture = None;
            }
        }
        drop(state);
        if failed {
            std::thread::sleep(Duration::from_millis(900));
        } else if unchanged {
            std::thread::sleep(Duration::from_millis(50));
        }
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

    #[test]
    fn playback_latency_ignores_alerts_that_never_played() {
        let at = Instant::now();
        let started = Arc::new(OnceLock::from(at + std::time::Duration::from_millis(310)));
        let samples = [
            TimedMatch {
                arrived: at,
                matched_ms: 110,
                playback: started,
            },
            TimedMatch {
                arrived: at,
                matched_ms: 90,
                playback: Arc::default(),
            },
        ]
        .into();
        let latest = timing(&samples).unwrap();
        assert_eq!((latest.matched_ms, latest.playback_ms), (90, None));
        assert_eq!(
            (latest.playback_samples, latest.playback_p95_ms),
            (1, Some(310))
        );
    }

    fn config() -> WatchConfig {
        WatchConfig {
            hwnd: 1,
            speech_enabled: false,
            fast_ocr: false,
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
        let sample = "（系统》突然受到少侠的惊扰，一群携带宝贝的梦魔夜叉跑到了花果山，";
        let filter = ReminderFilter {
            kind: ReminderKind::Yecha,
            scenes: vec![],
        };
        let rows = message_rows(vec![line(sample, 2, 20, 650)]);
        assert_eq!(candidates(&rows, &filter)[0].scene, "花果山");
        let rows = message_rows(vec![line("[世界]", 2, 20, 30), line(sample, 45, 20, 650)]);
        assert!(candidates(&rows, &filter).is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn changed_band_keeps_unchanged_start_of_a_wrapped_announcement() {
        let line = |text: &str, y| crate::ocr::TextLine {
            text: text.into(),
            x: 0,
            y,
            width: 70,
            height: 16,
            score: 0.99,
        };
        let width = 80;
        let height = 180;
        let stride = width as usize * 4;
        let previous = ChatFrame {
            pixels: vec![0; stride * height as usize],
            lines: vec![
                line("[系统]少侠甲挖塌了妖怪的房子，妖怪正在", 48),
                line("旧画面", 100),
            ],
        };
        let mut pixels = previous.pixels.clone();
        pixels[100 * stride] = 1;
        let frame = recognize_chat_frame(Some(&previous), pixels, width, height, |buf, w, h| {
            assert_eq!(w, width);
            assert_eq!(h, 49);
            assert_eq!(buf.len(), stride * h as usize);
            Ok(vec![line("碗子山四处肆虐！", 24)])
        })
        .unwrap()
        .unwrap();
        assert!(frame.lines.iter().any(|line| line.y == 100));
        let messages = message_rows(frame.lines);
        assert_eq!(
            candidates(&messages, &config().reminders[0])[0].scene,
            "碗子山"
        );
    }

    #[cfg(windows)]
    #[test]
    fn empty_crop_with_unchanged_text_in_its_margin_retries_the_full_frame() {
        let width = 80;
        let height = 200;
        let stride = width as usize * 4;
        let previous = ChatFrame {
            pixels: vec![0; stride * height as usize],
            lines: vec![crate::ocr::TextLine {
                text: "[系统]".into(),
                x: 0,
                y: 90,
                width: 50,
                height: 12,
                score: 0.99,
            }],
        };
        let mut pixels = previous.pixels.clone();
        pixels[110 * stride] = 1;
        let frame = recognize_chat_frame(Some(&previous), pixels, width, height, |_, _, h| {
            Ok(if h == height {
                previous.lines.clone()
            } else {
                Vec::new()
            })
        })
        .unwrap()
        .unwrap();
        assert_eq!(frame.lines[0].text, "[系统]");
    }

    #[cfg(windows)]
    #[test]
    fn unchanged_rows_skip_inference_and_large_changes_use_the_full_frame() {
        let previous = ChatFrame {
            pixels: vec![0; 4 * 80 * 160],
            lines: vec![],
        };
        let unchanged = recognize_chat_frame(
            Some(&previous),
            previous.pixels.clone(),
            80,
            160,
            |_, _, _| panic!("unchanged frame must skip OCR"),
        )
        .unwrap();
        assert!(unchanged.is_none());
        let mut pixels = previous.pixels.clone();
        pixels.fill(1);
        let frame = recognize_chat_frame(Some(&previous), pixels, 80, 160, |_, w, h| {
            assert_eq!((w, h), (80, 160));
            Ok(vec![])
        })
        .unwrap();
        assert!(frame.is_some());
    }

    #[cfg(windows)]
    #[test]
    fn distant_updates_keep_the_middle_and_recover_from_clipped_text() {
        let width = 80;
        let height = 400;
        let stride = width as usize * 4;
        let line = |text: &str, y| crate::ocr::TextLine {
            text: text.into(),
            x: 0,
            y,
            width: 60,
            height: 12,
            score: 0.99,
        };
        let previous = ChatFrame {
            pixels: vec![0; stride * height as usize],
            lines: vec![line("保留的文字", 190)],
        };
        let mut pixels = previous.pixels.clone();
        pixels[65 * stride] = 1;
        pixels[320 * stride] = 2;
        for clipped_reads in 0..=2 {
            let calls = std::cell::RefCell::new(Vec::new());
            let read = |_: &[u8], _: u32, h: u32| {
                let mut calls = calls.borrow_mut();
                calls.push(h);
                let result = match calls.len() {
                    1 => line("上方更新", 24),
                    4 => line("整帧结果", 320),
                    n if n <= clipped_reads + 1 => line("碰到裁边", 0),
                    _ => line("下方更新", (h / 2) as i32),
                };
                Ok(vec![result])
            };
            let frame = recognize_chat_frame(Some(&previous), pixels.clone(), width, height, read)
                .unwrap()
                .unwrap();
            let calls = calls.into_inner();
            if clipped_reads == 2 {
                assert_eq!(calls, [49, 49, 97, 400]);
                assert_eq!(message_rows(frame.lines), ["整帧结果"]);
            } else {
                assert_eq!(calls, [49, 49, 97][..2 + clipped_reads]);
                assert_eq!(
                    message_rows(frame.lines),
                    ["上方更新", "保留的文字", "下方更新"]
                );
            }
        }
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
            .absorb(candidates(std::slice::from_ref(&old_spawn), &spawn), 0);
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
