//! Vulkan 子进程读取 BGRA 图片并返回原图坐标。聊天独享会话，前台任务短时复用模型。
use super::{chat::ChatOcr, TextLine, MODELS_DIR};
use std::io::{self, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Recognizer {
    worker: Option<Worker>,
    paddle: Option<ChatOcr>,
    pub fallback: Option<String>,
}

impl Recognizer {
    pub fn open(fast: bool) -> Self {
        let mut engine = Self {
            worker: None,
            paddle: None,
            fallback: None,
        };
        if fast {
            match Worker::open() {
                Ok(worker) => engine.worker = Some(worker),
                Err(err) => engine.fallback = Some(err.to_string()),
            }
        }
        engine
    }

    pub fn label(&self) -> &'static str {
        if self.worker.is_some() {
            "ncnn / Vulkan"
        } else {
            "PP-OCRv4"
        }
    }

    pub fn recognize(&mut self, pixels: &[u8], w: u32, h: u32) -> Result<Vec<TextLine>, String> {
        if let Some(worker) = self.worker.as_mut() {
            match worker.recognize(pixels, w, h, 2) {
                Ok(lines) => return Ok(lines),
                Err(err) => {
                    self.fallback = Some(err.to_string());
                    self.worker = None;
                }
            }
        }
        let engine = match &mut self.paddle {
            Some(engine) => engine,
            None => self.paddle.insert(ChatOcr::new()?),
        };
        engine.recognize(pixels, w, h)
    }
}

// 角色面板会连续提交整图和小裁片。捉鬼与截图只共用一个进程，监听公告不在这把锁上排队。
const IDLE: Duration = Duration::from_secs(45);
static FOREGROUND: Mutex<Option<Foreground>> = Mutex::new(None);

struct Foreground {
    worker: Option<Worker>,
    last_used: Instant,
}

fn release_idle_worker() {
    let mut remaining = IDLE;
    loop {
        std::thread::sleep(remaining);
        let mut slot = FOREGROUND.lock().unwrap_or_else(|error| error.into_inner());
        let Some(session) = slot.as_ref() else { return };
        remaining = IDLE.saturating_sub(session.last_used.elapsed());
        if remaining.is_zero() {
            *slot = None;
            return;
        }
    }
}

pub fn foreground(pixels: &[u8], width: u32, height: u32, scale: u32) -> Option<Vec<TextLine>> {
    let bytes = super::bgra_bytes(width, height)?;
    if bytes != pixels.len()
        || !(1..=6).contains(&scale)
        || bytes as u64 / 4 * u64::from(scale).pow(2) > 64 * 1024 * 1024
    {
        return None;
    }
    let mut slot = FOREGROUND.lock().unwrap_or_else(|error| error.into_inner());
    let session = slot.get_or_insert_with(|| {
        let worker = Worker::open()
            .inspect_err(|e| eprintln!("快速 OCR 初始化失败：{e}"))
            .ok();
        std::thread::spawn(release_idle_worker);
        Foreground {
            worker,
            last_used: Instant::now(),
        }
    });
    let result = session
        .worker
        .as_mut()?
        .recognize(pixels, width, height, scale);
    session.last_used = Instant::now();
    match result {
        Ok(lines) => Some(lines),
        Err(error) => {
            eprintln!("快速 OCR 不可用，使用标准识别：{error}");
            session.worker = None;
            None
        }
    }
}

struct Patch {
    scale: u32,
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

struct Worker {
    child: Child,
    input: Sender<Patch>,
    output: Receiver<io::Result<Vec<TextLine>>>,
}

impl Worker {
    fn open() -> io::Result<Self> {
        let dir = MODELS_DIR
            .get()
            .ok_or_else(|| io::Error::other("OCR 模型目录未初始化"))?
            .join("chat-ncnn");
        let mut child = Command::new(dir.join("chat-ocr.exe"))
            .current_dir(dir)
            .creation_flags(0x08000000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let mut input = child.stdin.take().expect("已配置输入管道");
        let mut output = BufReader::new(child.stdout.take().expect("已配置输出管道"));
        let (tx, requests) = mpsc::channel::<Patch>();
        let (replies, rx) = mpsc::channel();
        let mut worker = Self {
            child,
            input: tx,
            output: rx,
        };
        std::thread::Builder::new()
            .name("chat-ocr-pipe".into())
            .spawn(move || {
                let exchange = || -> io::Result<()> {
                    let mut magic = [0; 4];
                    output.read_exact(&mut magic)?;
                    if &magic != b"OCR2" {
                        return Err(io::Error::other("识别器版本不匹配"));
                    }
                    let _ = replies.send(Ok(Vec::new()));
                    for patch in requests {
                        input.write_all(&patch.width.to_le_bytes())?;
                        input.write_all(&patch.height.to_le_bytes())?;
                        input.write_all(&patch.scale.to_le_bytes())?;
                        input.write_all(&patch.pixels)?;
                        input.flush()?;
                        let lines = read_lines(&mut output)?;
                        if replies.send(Ok(lines)).is_err() {
                            break;
                        }
                    }
                    Ok(())
                };
                if let Err(err) = exchange() {
                    let _ = replies.send(Err(err));
                }
            })?;
        worker.receive()?;
        Ok(worker)
    }

    fn receive(&mut self) -> io::Result<Vec<TextLine>> {
        self.output
            .recv_timeout(Duration::from_secs(8))
            .map_err(|_| io::Error::other("识别器超时或已退出"))?
    }

    fn recognize(
        &mut self,
        pixels: &[u8],
        width: u32,
        height: u32,
        scale: u32,
    ) -> io::Result<Vec<TextLine>> {
        self.input
            .send(Patch {
                width,
                height,
                scale,
                pixels: pixels.to_vec(),
            })
            .map_err(|_| io::Error::other("识别器已退出"))?;
        self.receive()
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        // 同时解开可能阻塞在驱动／管道中的读写，快速重启监听时不共用 GPU 对象。
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn word(input: &mut impl Read) -> io::Result<[u8; 4]> {
    let mut bytes = [0; 4];
    input.read_exact(&mut bytes)?;
    Ok(bytes)
}

fn read_lines(input: &mut impl Read) -> io::Result<Vec<TextLine>> {
    let mut lines: Vec<TextLine> = Vec::new();
    loop {
        let size = u32::from_le_bytes(word(input)?) as usize;
        if size == 0 {
            lines.sort_by_key(|line| (line.y, line.x));
            return Ok(lines);
        }
        if size > 16384 || lines.len() >= 4096 {
            return Err(io::Error::other("识别器返回的数据过大"));
        }
        let x = i32::from_le_bytes(word(input)?);
        let y = i32::from_le_bytes(word(input)?);
        let width = i32::from_le_bytes(word(input)?);
        let height = i32::from_le_bytes(word(input)?);
        let score = f32::from_le_bytes(word(input)?);
        let mut bytes = vec![0; size];
        input.read_exact(&mut bytes)?;
        let text = String::from_utf8(bytes).map_err(io::Error::other)?;
        if !text.trim().is_empty() {
            lines.push(TextLine {
                text,
                x,
                y,
                width,
                height,
                score,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blank_frame_is_distinct_from_worker_failure() {
        assert!(read_lines(&mut &0u32.to_le_bytes()[..]).unwrap().is_empty());
        assert!(read_lines(&mut &[0, 0][..]).is_err());
        assert!(read_lines(&mut &u32::MAX.to_le_bytes()[..]).is_err());
    }
}
