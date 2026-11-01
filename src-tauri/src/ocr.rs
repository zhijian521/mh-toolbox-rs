//! Windows 自带离线 OCR（`Windows.Media.Ocr`）——**降级兜底**，不是主引擎。
//!
//! 主引擎是 PP-OCRv4（`ocr_paddle.rs`）。这里只在模型加载失败时接管，
//! 好过「整页报错、什么都看不到」。它**认不出彩色字**：任务栏地名是纯黄 (255,255,0)，
//! 这个引擎对那一整类颜色的输出是错的——2026-11-01 之前的所有「识别很差」都是它。
//!
//! 已知短板要说清楚：`OcrEngine` **不返回置信度**（`TextLine::score` 恒为 0）。
//! 所以「这个 7 是不是 1」这种判断它帮不上忙，只能靠调用方的多帧保留 + 数字纠错表。
//! 「不用带模型」曾经是选它的理由，代价是彩色字读不出，最终换成了带模型的 PP-OCRv4。

use serde::Serialize;
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

/// 一行识别结果。
///
/// 坐标单位由调用方决定：`ocr::recognize` 原样返回**放大后**位图里的像素，
/// `ghost.rs::read_lines` 在兜底那条路上会把它除回放大倍数（等于 ROI 坐标），
/// `ocr_paddle::recognize` 同样返回 ROI 坐标。所以经 `read_lines` 出来的行，
/// 三种引擎口径一致。
/// 行序本身的先后比绝对坐标更重要——任务块拼接靠的是「同属一块的行挨在一起」。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TextLine {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    /// 识别置信度 0~1。**Windows 引擎永远给 0**（它不返回这个值），
    /// PaddleOCR 给真实分数。前端不靠它做判断，只在「识别原文」里显示，
    /// 用来分辨「读错了」和「根本没框到」这两种完全不同的失败。
    #[serde(default)]
    pub score: f32,
}

/// 初始化 WinRT apartment。
///
/// 进程里调一次就够，重复调用返回 `S_FALSE`（`RPC_E_CHANGED_MODE` 则说明已经是
/// 别的 apartment 模型，对只读 OCR 没有影响，一并当成功）。**不能放在 `main` 里**：
/// 主线程已经被 WebView2 占了，`RoInitialize` 在错误的线程上会让后面所有调用失败。
fn init_winrt() -> Result<(), String> {
    // SAFETY: 无参数、无别名，唯一的副作用是给当前线程设 COM apartment。
    unsafe {
        match RoInitialize(RO_INIT_MULTITHREADED) {
            Ok(()) => Ok(()),
            // S_FALSE：重复初始化。RPC_E_CHANGED_MODE (0x80010106)：已是 STA。
            Err(e) if e.code().0 == 0x0000_0001u32 as i32 => Ok(()),
            Err(e) if e.code().0 == 0x8001_0106u32 as i32 => Ok(()),
            Err(e) => Err(format!("WinRT 初始化失败：{e}")),
        }
    }
}

/// 识别一帧 BGRA 位图。
///
/// `scale` 由调用方先放大到位图里传进来（这里不再放大），这样「放大倍数」只有一处
/// 真源，行坐标除以同一个数就能还原。
pub fn recognize(bgra: &[u8], width: u32, height: u32) -> Result<Vec<TextLine>, String> {
    init_winrt()?;

    let expected = width as usize * height as usize * 4;
    if bgra.len() != expected {
        return Err(format!(
            "位图长度不符：期望 {expected}，实际 {}",
            bgra.len()
        ));
    }

    let writer = DataWriter::new().map_err(|e| format!("建缓冲区失败：{e}"))?;
    writer
        .WriteBytes(bgra)
        .map_err(|e| format!("写缓冲区失败：{e}"))?;
    let buffer = writer
        .DetachBuffer()
        .map_err(|e| format!("取缓冲区失败：{e}"))?;

    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        width as i32,
        height as i32,
    )
    .map_err(|e| format!("建 SoftwareBitmap 失败：{e}"))?;

    let language = Language::CreateLanguage(&HSTRING::from("zh-Hans-CN"))
        .map_err(|e| format!("加载中文语言包失败：{e}"))?;
    let engine = OcrEngine::TryCreateFromLanguage(&language)
        .map_err(|e| format!("创建 OCR 引擎失败：{e}"))?;

    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| format!("启动识别失败：{e}"))?
        .join()
        .map_err(|e| format!("识别失败：{e}"))?;

    let lines = result.Lines().map_err(|e| format!("取识别结果失败：{e}"))?;
    let mut out = Vec::with_capacity(lines.Size().unwrap_or(0) as usize);
    for index in 0..lines.Size().unwrap_or(0) {
        let line = match lines.GetAt(index) {
            Ok(line) => line,
            Err(_) => continue,
        };
        let text = line.Text().map(|t| t.to_string_lossy()).unwrap_or_default();
        if text.trim().is_empty() {
            continue;
        }
        // 取首词的矩形当整行的锚点：`OcrLine` 自身没有位置，只有 `Words` 有。
        let words = line.Words().map_err(|e| format!("取词列表失败：{e}"))?;
        let (x, y, w, h) = if words.Size().unwrap_or(0) > 0 {
            match words.GetAt(0).and_then(|w| w.BoundingRect()) {
                Ok(rect) => (
                    rect.X as i32,
                    rect.Y as i32,
                    rect.Width as i32,
                    rect.Height as i32,
                ),
                Err(_) => (0, 0, 0, 0),
            }
        } else {
            (0, 0, 0, 0)
        };
        out.push(TextLine {
            text,
            x,
            y,
            width: w,
            height: h,
            score: 0.0,
        });
    }

    // 按 y 排序：`OcrEngine` 的返回顺序大致自上而下，但多列排版时会被打乱。
    // 任务栏是单列，按 y 排完就能保证「同一块的行挨在一起」。
    out.sort_by_key(|line| line.y);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 验的是**链路能不能跑完**：WinRT apartment 初始化 → SoftwareBitmap →
    /// 引擎创建 → 异步识别 → 取行。不去断言识别出什么字：
    /// 合成图里的方块本来就没有文字，断言内容只会变成一条「验证 OCR 精度」的假测试。
    ///
    /// 这条测试的价值在于，上面每一步都有各自的失败方式（apartment 模型不对、
    /// 位图尺寸不符、语言包缺失），而它们只在真机上才暴露。
    #[test]
    fn pipeline_runs_on_a_synthetic_frame() {
        let (width, height) = (200u32, 60u32);
        let mut bgra = vec![255u8; (width * height * 4) as usize];
        for y in 20..40usize {
            for x in 40..160usize {
                let index = (y * width as usize + x) * 4;
                bgra[index] = 0;
                bgra[index + 1] = 0;
                bgra[index + 2] = 0;
            }
        }

        let lines = recognize(&bgra, width, height).expect("OCR 链路跑不通");
        // 空白图不该吐出几十行——吐了说明位图参数（宽高/像素格式）被读错了。
        assert!(lines.len() < 10, "空白图返回了 {} 行", lines.len());
    }

    /// 尺寸与缓冲区不符时必须报错而不是越界读。`CreateCopyFromBuffer` 收到
    /// 长度不对的 buffer 会自己抛错，但那是 WinRT 的错；这里要的是我们自己先拦住。
    #[test]
    fn rejects_mismatched_buffer() {
        let error = recognize(&[0u8; 16], 100, 100).unwrap_err();
        assert!(error.contains("位图长度不符"), "错误信息不对：{error}");
    }
}
