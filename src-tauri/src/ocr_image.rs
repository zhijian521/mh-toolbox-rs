//! 把**一张图片**送进 OCR——截图识别的 Rust 半边。
//!
//! 与 `ghost.rs` 的分工：那边自己找窗口、自己截、自己定 ROI，只服务任务栏那一列；
//! 这边**只认像素**，图从哪来（剪贴板粘的、选的文件、将来某天截的窗口）一概不管。
//! 两个调用方共用 `ocr_paddle` 的引擎（模型只加载一次，见那边的 `ENGINE`）。
//!
//! # 为什么收的是裸 BGRA，不是 PNG
//!
//! 前端把图先画到 canvas 上再 `getImageData`，于是 Rust 侧拿到的就是**已经解好的像素**。
//! 换 PNG 要多付两笔：`image` crate 得开 `png`/`jpeg` 特性（本仓只开了「无编码器」那档），
//! 以及「这张图坏了」会成为第二种错误分支。解码交给 WebView 是最短的一条路，
//! 而且顺带解决了「用户粘进来的是 webp / 剪贴板位图 / 拖进来的文件」这些格式差异。
//!
//! # 代价
//!
//! 一张 400 × 560 的面板图是 896KB 裸像素，base64 之后约 1.2MB 走一次 IPC。
//! 与「点一次识别」的频率相比可以接受；真嫌大就改成让前端先裁剪，
//! 而不是把解码搬回 Rust（那会让这条链多一个失败点，却省不下多少时间）。

use base64::Engine;

use crate::ocr::TextLine;

/// 送给检测模型的**长边目标**。
///
/// PP-OCRv4 的检测分支只缩不放（见 `ocr_paddle::recognize` 的文件头），所以「字够不够大」
/// 完全由这里的放大倍数决定。2000 是**实测出来的**（2026-11-07，两张真面板）：
///
/// | 原图 | 倍数 | 内部尺寸 | 耗时 | 结果 |
/// | ---- | ---- | -------- | ---- | ---- |
/// | 321 × 426（深蓝） | ×4 | 1284 × 1704 | 7.0s | 24 项全认到，只有「门贡 / 耐力」两个标签错（形近字规则兜住） |
/// | 同上 | ×3 | 963 × 1278 | 4.9s | 快 2 秒，但**漏掉「气血」这个标签** |
/// | 155 × 273（棕色） | ×4 | 620 × 1092 | 3.2s | 一半标签错（气电 / 活店 / 收害） |
/// | 同上 | ×6 | 930 × 1638 | 4.4s | 24 项全对 |
///
/// 两条结论：① 倍数是**标签能不能认出来**的分界，不是数字准不准——标签漏了那一项就整项
/// 读不到，用户得手填；② 慢的主因是**每次调用的固定开销（约 2s）+ 像素**，所以少放
/// 一档只省两秒，不值得拿一个字段去换。真正想快该减的是图（裁到面板），不是倍数。
const TARGET_LONG_SIDE: u32 = 2000;

/// 按图片尺寸挑放大倍数。
///
/// 单独拆出来是为了能测：这条策略一改，识别率与耗时会同时变，
/// 而它本身只是一次除法（见下面的单测）。
fn auto_scale(width: u32, height: u32) -> u32 {
    let long = width.max(height).max(1);
    (TARGET_LONG_SIDE / long).clamp(1, crate::ocr_paddle::MAX_IMAGE_SCALE)
}

/// 识别一张图。
///
/// `pixels` 是 **BGRA 裸像素的 base64**（长度必须是 `width × height × 4`）；
/// 坐标原点是图片左上角，单位是**原图像素**（放大倍数已经除回去了）。
///
/// 命令是 `async` 的：一次识别是**秒级**的（1~2M 像素的面板实测 3~7 秒，见上面
/// 那张表），同步命令会占住 UI 线程，窗口在这段时间里拖不动、按钮点不动，看起来
/// 就是「点了没反应」。真正干活的那一段又丢进 `spawn_blocking`——它是 CPU 密集的，
/// 不该占着 tokio 的 worker。
/// 命令写成 `async fn`（而不是 `#[tauri::command(async)]` + 同步函数）：这里要 `.await`
/// 那个 `spawn_blocking`，同步函数里根本写不出 `await`。
#[tauri::command]
#[specta::specta]
pub async fn ocr_frame(pixels: String, width: u32, height: u32) -> Result<Vec<TextLine>, String> {
    let raw = decode(&pixels, width, height)?;
    let scale = auto_scale(width, height);
    tauri::async_runtime::spawn_blocking(move || {
        crate::ocr_paddle::recognize_image(&raw, width, height, scale)
    })
    .await
    .map_err(|err| format!("识别任务没跑完：{err}"))?
}

/// 把 base64 解成像素并核尺寸。
///
/// 从命令里拆出来只有一个理由：**能测**。三处失败（尺寸为 0、base64 坏了、
/// 长度与尺寸不符）都在这里，而它们各自的报错文案是用户唯一能看到的东西。
fn decode(pixels: &str, width: u32, height: u32) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".to_string());
    }
    let raw = base64::engine::general_purpose::STANDARD
        .decode(pixels.as_bytes())
        .map_err(|err| format!("图片数据不是合法的 base64：{err}"))?;

    let expected = width as usize * height as usize * 4;
    if raw.len() != expected {
        return Err(format!(
            "位图长度不符：期望 {expected}（{width}×{height}×4），实际 {}",
            raw.len()
        ));
    }
    Ok(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 放大倍数只由长边决定，且永远落在 `1..=MAX_IMAGE_SCALE`。
    ///
    /// 这条测试的价值不在「除法对不对」，而在**两头的夹取**：截图识别会收到各种尺寸的图
    /// （手机截屏 1080×2400、游戏面板 400×560、裁过的一小块），任何一个方向漏了夹取，
    /// 要么把图放大到几十兆、要么让小字进检测时不足 10px——两种都是「识别率莫名很差」，
    /// 而且都不会报错。
    #[test]
    fn auto_scale_stays_in_range() {
        assert_eq!(auto_scale(321, 426), 4);
        assert_eq!(auto_scale(155, 273), 6);
        assert_eq!(auto_scale(1080, 2400), 1, "超大的图不该再放大");
        assert_eq!(auto_scale(100, 80), 6, "极小的图封顶在 MAX_IMAGE_SCALE");
        assert_eq!(auto_scale(0, 0), 6, "尺寸为 0 也要给出合法值，别在除法上崩");
    }

    /// base64 坏了要给出「数据不对」这一句，而不是到推理里才炸。
    #[test]
    fn rejects_bad_base64() {
        let error = decode("不是 base64", 2, 2).unwrap_err();
        assert!(error.contains("base64"), "错误信息不对：{error}");
    }

    /// 长度与尺寸不符必须在进推理前拦住。
    #[test]
    fn rejects_mismatched_length() {
        // 4 字节 = 1 个像素，但声称是 2×2。
        let error = decode("AAAAAA==", 2, 2).unwrap_err();
        assert!(error.contains("位图长度不符"), "错误信息不对：{error}");
    }

    #[test]
    fn rejects_zero_size() {
        let error = decode("", 0, 10).unwrap_err();
        assert!(error.contains("尺寸为 0"), "错误信息不对：{error}");
    }
}
