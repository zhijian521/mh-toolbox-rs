//! 本地中文语音通知。后台工具按来源入队和取消，共享一个串行播放器。
#[cfg(windows)]
mod windows;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock};

const QUEUE_LIMIT: usize = 8;
type PlaybackStart = Arc<OnceLock<std::time::Instant>>;
type Receipt = mpsc::Sender<Result<(), String>>;

struct Job {
    source: &'static str,
    text: String,
    cancelled: Arc<AtomicBool>,
    receipt: Option<Receipt>,
    playback_start: Option<PlaybackStart>,
}

#[derive(Default)]
struct Queue {
    pending: VecDeque<Job>,
    active: Option<(&'static str, Arc<AtomicBool>)>,
    worker: bool,
    errors: HashMap<&'static str, String>,
}

impl Queue {
    fn cancel(&mut self, source: &'static str) {
        self.pending.retain(|job| job.source != source);
        if let Some((current, flag)) = &self.active {
            if *current == source {
                flag.store(true, Ordering::Release);
            }
        }
        self.errors.remove(source);
    }
}

fn queue() -> MutexGuard<'static, Queue> {
    static QUEUE: OnceLock<Mutex<Queue>> = OnceLock::new();
    QUEUE
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn cancel(source: &'static str) {
    queue().cancel(source);
}

pub(crate) fn error(source: &'static str) -> String {
    queue().errors.get(source).cloned().unwrap_or_default()
}

pub(crate) fn announce(source: &'static str, text: String) -> PlaybackStart {
    let started = PlaybackStart::default();
    if let Err(error) = enqueue(source, text, None, Some(started.clone())) {
        queue().errors.insert(source, error);
    }
    started
}

pub(crate) fn preview(source: &'static str, sample: &str) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    enqueue(source, sample.into(), Some(tx), None)?;
    // 排队期间被取消也是正常结束。
    rx.recv().unwrap_or(Ok(()))
}

fn enqueue(
    source: &'static str,
    text: String,
    receipt: Option<Receipt>,
    playback_start: Option<PlaybackStart>,
) -> Result<(), String> {
    let mut q = queue();
    if receipt.is_some() && (q.active.is_some() || !q.pending.is_empty()) {
        return Err("正在播报，请稍后试听".into());
    }
    if q.pending.len() >= QUEUE_LIMIT {
        return Err("语音队列已满，请查看最近提醒".into());
    }
    if !q.worker {
        std::thread::Builder::new()
            .name("speech-notifications".into())
            .spawn(drain)
            .map_err(|e| format!("无法启动语音服务：{e}"))?;
        q.worker = true;
    }
    q.pending.push_back(Job {
        source,
        text: text.chars().take(160).collect(),
        cancelled: Arc::default(),
        receipt,
        playback_start,
    });
    Ok(())
}

fn drain() {
    loop {
        let job = {
            let mut q = queue();
            let Some(job) = q.pending.pop_front() else {
                q.worker = false;
                return;
            };
            q.active = Some((job.source, job.cancelled.clone()));
            job
        };
        #[cfg(windows)]
        let result = windows::play(&job);
        #[cfg(not(windows))]
        let result: Result<(), String> = Err("本地语音仅支持 Windows".into());
        let mut q = queue();
        q.active = None;
        if let Some(tx) = job.receipt {
            let _ = tx.send(result);
        } else if !job.cancelled.load(Ordering::Acquire) {
            match result {
                Ok(()) => {
                    q.errors.remove(job.source);
                }
                Err(message) => {
                    q.errors.insert(job.source, message);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_only_affects_jobs_from_the_requested_source() {
        let make_job = |source| Job {
            source,
            text: String::from("提醒"),
            receipt: None,
            playback_start: None,
            cancelled: Arc::default(),
        };
        let playing = Arc::new(AtomicBool::new(false));
        let mut queue = Queue {
            active: Some(("reminders", playing.clone())),
            pending: VecDeque::from([make_job("reminders"), make_job("timer")]),
            ..Default::default()
        };
        queue.cancel("other");
        assert!(!playing.load(Ordering::Acquire));
        queue.cancel("reminders");
        assert!(playing.load(Ordering::Acquire));
        assert_eq!(queue.pending.len(), 1);
        assert_eq!(queue.pending[0].source, "timer");
    }
}
