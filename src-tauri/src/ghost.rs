//! 捉鬼任务栏的读取：截屏 + OCR + 计时。
//!
//! 这一层只负责「把屏幕上的字变成字符串」，**不做任何语义解析**。
//! 为什么拆分：解析规则（大小鬼两种句式、数字纠错、`0,0` 白名单）全是纯函数，
//! 放在前端可以用假的识别结果反复试，不需要开着游戏；而截屏与 OCR 必须真机跑。
//! 混在一起的话，每改一次正则都要重新截一次屏。

use serde::{Deserialize, Serialize};

use crate::ocr::{self, TextLine};
use crate::ocr_paddle;
use crate::screen;

/// 关注区域，**按客户区像素**表达，不用归一化比例。
///
/// 为什么不是比例：梦幻的 UI 是**固定像素**，窗口变大只是露出更多地图，面板本身不长。
/// 2026-11-01 用三张 640×480 / 800×600 / 1025×768 的截图量的：面板宽度三张都是 205px，
/// 面板左缘距窗口右缘三张都是 210px。换算成比例就成了 0.742 / 0.79 / 0.838——
/// 拿同一组比例去截三种窗口，必然有两种切掉字。实测「按比例 0.82」时 640 与 800 两张
/// 的「法宝合成」都被切掉了「法」字，而地名正是任务栏里最先被切掉的东西。
///
/// 距离从**客户区右缘**量起（面板贴右边），而不是从左缘：右侧是固定锚点，
/// 窗口怎么拉宽，面板都跟着右边走。
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Roi {
    /// ROI 右边界距客户区右缘的像素。面板右边还有几像素留白，别把它截掉。
    pub right_px: i32,
    /// ROI 宽度：从右缘往左量这么多。面板实测 205px，留 10px 余量防切左边的字。
    pub width_px: i32,
    /// ROI 上边界距客户区顶部的像素。面板标题栏实测距顶 200px。
    pub top_px: i32,
    /// ROI 高度。面板随任务条数变长，400 够装下两条捉鬼任务外加一行余量。
    pub height_px: i32,
    /// 送去 OCR 前的放大倍数。
    ///
    /// PaddleOCR 实测 2 最好：ROI 215×400 放大到 430×800 时 11 行全对且最快
    /// （×3 会多框出一截杂字、耗时翻倍；×4 更慢且开始丢行）。
    /// 这与旧引擎的结论（×3）不同——PP-OCRv4 自带检测分支，倍数只需要「够检测
    /// 框住一行字」，不像纯识别引擎那样依赖放大来提升清晰度。
    pub scale: u32,
}

impl Default for Roi {
    fn default() -> Self {
        // 实测来源（2026-11-01，1295×1038 客户区，125% 缩放）：
        // 面板左缘 x=1088 → 距右缘 207px；面板正文首行 y=210；两块任务正文到 y≈460。
        //
        // 三个尺寸的截图交叉验证过：815×679 / 1015×829 / 1295×1039 三种窗口下，
        // 面板宽度都是 205px、左缘距右缘都是 210px，所以这组像素值可以直接搬。
        //
        // 右边界贴着客户区右缘减 6px：面板右边还有一道细边，取 0 会把它截成半列。
        Self {
            right_px: 6,
            width_px: 215,
            top_px: 200,
            height_px: 400,
            scale: 2,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    /// 实际读的窗口。前端拿它做「正在监听谁」的显示。
    pub hwnd: i64,
    pub title: String,
    pub window_width: i32,
    pub window_height: i32,
    /// ROI 在窗口内的像素位置，缩放还原后可直接用于调试。
    pub roi_x: i32,
    pub roi_y: i32,
    pub roi_width: u32,
    pub roi_height: u32,
    /// 行坐标已除回放大倍数，等于 ROI 内的像素偏移。
    pub lines: Vec<TextLine>,
    /// 这一帧是哪个引擎认的：`paddle` / `windows`。
    /// 显示在「识别原文」标题上——两个引擎的错法完全不同，排查时先要知道看的是谁的输出。
    pub engine: String,
    /// 进命令到拿到底图：含窗口枚举、ROI 换算与 BitBlt。
    pub grab_ms: u64,
    /// 识别耗时，与 `grab_ms` 相加即这一帧的总开销。
    pub ocr_ms: u64,
}

/// 标题里出现这些字样就认为是梦幻客户端。
///
/// 只作为「没指定窗口时」的自动挑选依据：客户端标题里带角色名与服务器名，
/// 写法随版本变，所以匹配用的是**场景名**而不是完整标题。
///
/// **不能只写「梦幻」**：本应用叫「梦幻养老助手」，裸「梦幻」会把它自己选成靶子，
/// 于是自动识别一路 OCR 自己的界面——真机冒烟测试（`smoke_real_taskbar`）第一跑
/// 就撞上这个，读到的是「霞鹜文楷 Screen」这类界面文字，而界面上一切显示正常，
/// 只是任务列表永远空着。`mhtab` 是五开客户端的进程名列在标题里的兜底写法。
const TITLE_HINTS: [&str; 2] = ["梦幻西游", "mhtab"];

fn is_game_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    TITLE_HINTS
        .iter()
        .any(|hint| title.contains(hint) || lower.contains(&hint.to_lowercase()))
}

/// 列出可见窗口，供前端选择要监听哪一个。
///
/// 排序保持 Rust 侧的「面积从大到小」：客户端窗口通常是屏幕上前几名的大窗，
/// 前端不需要再排一次。
#[tauri::command(async)]
pub fn ghost_windows() -> Vec<screen::WindowInfo> {
    screen::list_windows()
}

/// 读一次任务栏。
///
/// `hwnd` 为空时自动挑一个标题像梦幻的窗口；挑不到返回错误而不是静默成功——
/// 静默成功会让前端显示「监听中」却一直读到空文本，比直接报错难查得多。
#[tauri::command(async)]
pub fn ghost_probe(hwnd: Option<i64>, roi: Option<Roi>) -> Result<ProbeResult, String> {
    let roi = roi.unwrap_or_default();
    // 上限取自 `ocr_paddle`，与引擎侧的 clamp 是同一个数：两处各写一个，
    // 「传 6 被静默压成 4」这种既不改结果、也不报错的情况就会一直存在。
    let scale = roi.scale.clamp(1, ocr_paddle::MAX_SCALE);

    // 计时从进命令就开始，把窗口枚举也算进 `grab_ms`：枚举一次要过一遍全部可见窗口，
    // 若放在计时之外，界面上的「截屏 + 识别」会比真实一帧的开销少一截，
    // 而这两个数字唯一的用途就是回答「一帧要多久」。
    let started = std::time::Instant::now();
    let windows = screen::list_windows();
    let target = match hwnd {
        Some(handle) => windows
            .into_iter()
            .find(|w| w.hwnd == handle)
            .ok_or_else(|| "窗口已关闭".to_string())?,
        None => windows
            .into_iter()
            .find(|w| is_game_title(&w.title))
            .ok_or_else(|| "没找到梦幻西游窗口，请先启动游戏".to_string())?,
    };

    let window = windows::Win32::Foundation::HWND(target.hwnd as *mut std::ffi::c_void);

    // 客户区拿不到（窗口已销毁、`GetClientRect` 失败）时退回窗口尺寸：
    // 那种情况下截屏本身也会失败，这里只是为了不让除零。
    let (x0, y0, rw, rh) = roi_of_window(&target, &roi);

    let frame = screen::grab(window, x0, y0, rw, rh)?;
    let grab_ms = started.elapsed().as_millis() as u64;

    // 全黑帧必须报错，不能当作「读到 0 行」往下走。
    // 锁屏、窗口被完全遮住、窗口不接受 BitBlt 都长这个样子，而它们共同的结果是
    // 「界面上显示监听中，任务列表永远空着」——看起来像没刷鬼，实际是没看见屏幕。
    if frame.is_blank() {
        return Err("截到的是全黑图：屏幕可能已锁定，或游戏窗口被完全遮住".to_string());
    }

    let ocr_started = std::time::Instant::now();
    let (lines, engine) = read_lines(&frame, scale)?;
    let ocr_ms = ocr_started.elapsed().as_millis() as u64;

    Ok(ProbeResult {
        hwnd: target.hwnd,
        title: target.title,
        window_width: target.width,
        window_height: target.height,
        roi_x: x0,
        roi_y: y0,
        roi_width: rw as u32,
        roi_height: rh as u32,
        lines,
        engine: engine.to_string(),
        grab_ms,
        ocr_ms,
    })
}

/// 把一帧交给 OCR：PaddleOCR 优先，不可用时退回 Windows 自带引擎。
///
/// 为什么留退路而不是硬依赖：模型文件在打包/搬运中丢失是完全可能的，
/// 那种情况下「读得差一点」远好于「整页报错、什么都看不到」。
/// 两条路的差别（模型没加载、CUDA 缺失、onnxruntime 版本不对）都会走到同一个分支，
/// 日志里打一行就够，不必在界面上再区分一遍。
///
/// 返回的坐标都已经除回放大倍数，等于 ROI 内的像素偏移。
fn read_lines(frame: &screen::Frame, scale: u32) -> Result<(Vec<TextLine>, &'static str), String> {
    match ocr_paddle::recognize(&frame.bgra, frame.width, frame.height, scale) {
        Ok(lines) => Ok((lines, "paddle")),
        Err(err) => {
            eprintln!("⚠ PaddleOCR 不可用，退回 Windows OCR：{err}");
            let (scaled, sw, sh) = screen::upscale(&frame.bgra, frame.width, frame.height, scale);
            let mut lines = ocr::recognize(&scaled, sw, sh)?;
            let factor = scale.max(1) as i32;
            for line in &mut lines {
                line.x /= factor;
                line.y /= factor;
                line.width /= factor;
                line.height /= factor;
            }
            Ok((lines, "windows"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 实时窗口上的冒烟测试。**默认不跑**（`#[ignore]`），因为它要求：
    /// 游戏开着、任务栏展开、窗口没被完全遮住、**屏幕没锁**——这四条 CI 里一条都不成立。
    /// 锁屏时 `BitBlt` 对任何窗口都返回全黑，整条链会以「没有一个窗口能截到像素」收场。
    ///
    /// ```text
    /// cargo test --lib -- --ignored --nocapture smoke_real_taskbar
    /// ```
    ///
    /// 它**不是一道门，是一把尺子**：断言只保证「链路能跑」（尺寸对得上、截到的不
    /// 是全黑、OCR 引擎返回 Ok），认出来的字对不对由人看着输出判断。空结果只警告
    /// 不失败，因为任务栏没展开时读到 0 行是正常状态，不是 bug。
    ///
    /// 单独写它的理由：`ocr.rs` 里那个测试用的是合成帧，只证明引擎能初始化；
    /// 真正会出问题的是「GDI 截 DirectX 窗口能不能拿到像素」和「ROI 比例框不框得住
    /// 正文」，这两个只有真窗口能回答。
    #[test]
    #[ignore = "需要真机开着游戏，手动运行"]
    fn smoke_real_taskbar() {
        let windows = screen::list_windows();
        assert!(!windows.is_empty(), "一个可见窗口都没有？");

        // 优先按梦幻的标题挑；没开游戏就退而求其次，逐个试别的窗口——
        // 这样至少能验证「截得到像素」这半条链，不至于整条测试没法跑。
        //
        // 为什么要「逐个试」而不是「挑面积最大的」：屏幕上有覆盖全屏的透明窗口
        // （输入法浮层、光标遮罩之类），面积排第一，但 BitBlt 截它得到纯黑。
        // 第一次写这条测试时就挑中了 `Cua.AgentCursorOverlay`，白屏一张。
        let mut candidates: Vec<&screen::WindowInfo> = windows.iter().collect();
        candidates.sort_by_key(|w| !is_game_title(&w.title));

        // ROI 到底框住了什么，光看 OCR 的字符串是猜不出来的：认出来的字碎了，
        // 可能是 ROI 切掉了左边，也可能是字号太大、也可能是框到了别的面板。
        // 把整窗与 ROI 各存一张 BMP（零依赖，54 字节头 + BGRA），人眼一看就清楚。
        dump_dir().ok();

        // 测试进程没走 `setup`，模型目录得自己指——否则 `read_lines` 会退回系统 OCR，
        // 而这条测试的全部意义恰恰是「线上那一帧到底认成了什么」。
        ocr_paddle::set_models_dir(ocr_paddle::locate_models(None));

        let roi = Roi::default();
        let mut chosen = None;

        for target in candidates {
            let real_game = is_game_title(&target.title);
            if target.width < 200 || target.height < 200 {
                continue;
            }
            let hwnd = windows::Win32::Foundation::HWND(target.hwnd as *mut std::ffi::c_void);
            let (x0, y0, rw, rh) = roi_of_window(target, &roi);

            let started = std::time::Instant::now();
            let Ok(frame) = screen::grab(hwnd, x0, y0, rw, rh) else {
                println!("跳过 {}「{}」：截屏失败", target.hwnd, target.title);
                continue;
            };
            let grab_ms = started.elapsed().as_millis();

            assert_eq!(frame.width, rw as u32, "截到的宽度与 ROI 不一致");
            assert_eq!(frame.height, rh as u32, "截到的高度与 ROI 不一致");

            // 「全黑」是 BitBlt 撞上锁屏、纯 DirectX 画面或透明窗口的典型症状
            // （`PrintWindow` 更严重，直接返回全黑图），所以这里单独判一次，
            // 别让它伪装成「OCR 没认出来」。判据与 `ghost_probe` 共用同一个函数，
            // 否则测试说「能截到」而线上说「全黑」，两者永远对不上。
            let lit = frame
                .bgra
                .chunks_exact(4)
                .filter(|p| p[0] > 8 || p[1] > 8 || p[2] > 8)
                .count();
            let ratio = lit as f64 / (frame.width * frame.height) as f64;

            let verdict = if real_game {
                "梦幻"
            } else {
                "非梦幻，只验截屏链路"
            };
            println!(
                "靶子：{}「{}」 {}×{}（{verdict}）截屏 {grab_ms}ms，ROI {}×{} @ ({x0},{y0})，非黑 {:.1}%",
                target.hwnd,
                target.title,
                target.width,
                target.height,
                frame.width,
                frame.height,
                ratio * 100.0
            );

            if !frame.is_blank() {
                chosen = Some((target, real_game, frame));
                break;
            }
            // 梦幻窗口截成全黑是真问题（说明这台机器上 BitBlt 看不见游戏），
            // 不能换个窗口糊过去——那会把最该报的故障藏起来。
            assert!(
                !real_game,
                "梦幻窗口截到的是全黑图：这台机器上 BitBlt 看不见游戏画面（也可能只是锁屏了）"
            );
            println!("  纯黑，跳过");
        }

        let (target, _real_game, frame) = chosen.expect(
            "没有一个窗口能截到像素：最常见的原因是屏幕锁着——锁屏时 BitBlt 对任何窗口都返回全黑",
        );
        println!("用 {}「{}」跑 OCR", target.hwnd, target.title);

        // 整窗一张、ROI 一张。调 ROI 比例时看的就是这两张的相对位置。
        if let Ok(dir) = dump_dir() {
            let hwnd = windows::Win32::Foundation::HWND(target.hwnd as *mut std::ffi::c_void);
            if let Ok(full) = screen::grab(hwnd, 0, 0, target.width, target.height) {
                dump_bmp(&dir.join("game-full.bmp"), &full);
            }
            dump_bmp(&dir.join("game-roi.bmp"), &frame);
        }

        // 走**线上那条链**（`read_lines`），不是单独调某个引擎：
        // 这把尺子的用处是回答「用户这一刻会看到什么」，所以引擎怎么选、退路怎么走
        // 都要和线上一致。只测 `ocr::recognize` 会得到一个永远通过、却和线上无关的结论。
        let ocr_started = std::time::Instant::now();
        let (lines, engine) = read_lines(&frame, roi.scale).expect("OCR 失败");
        println!(
            "OCR {}ms（引擎 {engine}，×{} 放大）",
            ocr_started.elapsed().as_millis(),
            roi.scale
        );

        if lines.is_empty() {
            println!("⚠ 认出 0 行。任务栏展开着的话，说明 ROI 没框住正文，调 Roi::default。");
        }
        // 行坐标已由 `read_lines` 除回放大倍数，直接就是 ROI 内的像素偏移。
        for line in &lines {
            println!("  y={:3} h={:2} | {}", line.y, line.height, line.text);
        }
        println!(
            "共 {} 行。逐行文本与游戏任务栏对照，确认坐标数字没错位。",
            lines.len()
        );
    }

    /// 实验台：在真实窗口上扫放大倍数，看每一档读到什么。
    ///
    /// ```text
    /// LAB_LIVE=1 cargo test --lib -- --ignored --nocapture ocr_lab_over_real_frames
    /// ```
    ///
    /// 要求**游戏在屏幕上可见**——屏幕 DC 看到什么就截什么，把自己的窗口压上去
    /// 就会读到自己的界面。
    ///
    /// 这里原先还有一条「离线样张 × 六种预处理」的分支（`prepare` / `otsu` /
    /// `sharpen` 那一套），是给 Windows OCR 试通道与二值化用的。换成 PP-OCRv4 后
    /// 它自带检测分支、直接吃彩色图，预处理整条路都不再被经过，那 200 多行也随之删掉：
    /// 留着会让人以为「线上还在做预处理」。
    ///
    /// 用测试而不是单元函数，是因为 `ocr` / `screen` 都是私有模块，只有 `#[cfg(test)]`
    /// 才够得着。这条测试**永不进 CI**，它的产物是一段人看的输出，不是一个断言。
    #[test]
    #[ignore = "需要真机开着游戏且窗口在前台"]
    fn ocr_lab_over_real_frames() {
        // 测试进程没有走 `setup`，模型目录得自己指——与线上同一个入口，
        // 少这一步会退化成「只在应用里能跑、测试里永远读不到模型」。
        ocr_paddle::set_models_dir(ocr_paddle::locate_models(None));
        lab_on_live_window();
    }

    /// 直接截真实窗口：ROI 与放大倍数一起扫，输出每种组合读到什么。
    fn lab_on_live_window() {
        let windows = screen::list_windows();
        let target = windows
            .iter()
            .find(|w| is_game_title(&w.title))
            .expect("没找到梦幻窗口");
        let hwnd = windows::Win32::Foundation::HWND(target.hwnd as *mut std::ffi::c_void);
        let (_, _, cw, ch) = screen::client_box(hwnd);
        println!(
            "\n靶子「{}」 窗口 {}×{}  客户区 {}×{}",
            target.title, target.width, target.height, cw, ch
        );

        let roi = Roi::default();
        let (x0, y0, rw, rh) = roi_of_window(target, &roi);
        let frame = screen::grab(hwnd, x0, y0, rw, rh).expect("截屏失败");
        println!("ROI {rw}×{rh} @ ({x0},{y0})");

        // 两个引擎、每档放大倍数各跑一遍。放大倍数对 PaddleOCR 的意义与
        // Windows OCR 不同：前者自带检测分支，太小会「框不到」，太大只是变慢；
        // 后者只做识别，越小越糊。所以倍数要分开扫，不能套用旧结论。
        for scale in [2u32, 3, 4] {
            println!("\n===== PaddleOCR ×{scale} =====");
            let started = std::time::Instant::now();
            match ocr_paddle::recognize(&frame.bgra, frame.width, frame.height, scale) {
                Ok(lines) => {
                    println!("  {}ms  {} 行", started.elapsed().as_millis(), lines.len());
                    for line in &lines {
                        println!(
                            "    y={:3} h={:2} x={:3} {:.2} | {}",
                            line.y, line.height, line.x, line.score, line.text
                        );
                    }
                }
                Err(err) => println!("  失败：{err}"),
            }
        }

        for scale in [3u32] {
            println!("\n===== Windows OCR ×{scale}（基线） =====");
            let (scaled, sw, sh) = screen::upscale(&frame.bgra, frame.width, frame.height, scale);
            let started = std::time::Instant::now();
            match ocr::recognize(&scaled, sw, sh) {
                Ok(lines) => {
                    println!("  {}ms  {} 行", started.elapsed().as_millis(), lines.len());
                    for line in &lines {
                        println!(
                            "    y={:3} h={:2} x={:3} | {}",
                            line.y / scale as i32,
                            line.height / scale as i32,
                            line.x / scale as i32,
                            line.text
                        );
                    }
                }
                Err(err) => println!("  失败：{err}"),
            }
        }
    }

    /// 截图落盘的目录：项目外的 `.runtime/shots`（工作目录是 `src-tauri`，所以退两级）。
    /// 放项目外是因为这些图只在手动调试时有意义，不该进仓库，也不该被 prettier 扫到。
    fn dump_dir() -> Result<std::path::PathBuf, std::io::Error> {
        let dir = std::path::Path::new("../../.runtime/shots");
        std::fs::create_dir_all(dir)?;
        Ok(dir.to_path_buf())
    }

    /// 把一帧写成 32 位 BMP。
    ///
    /// 为什么手写而不是加个 `image` crate：这里只需要「人在文件管理器里双击能看」，
    /// BMP 的头是固定的 54 字节，比引一个只在测试里用的依赖便宜。
    /// 注意 BMP 的行序是**自下而上**，漏了这一步图会上下颠倒——照样能看出布局，
    /// 但和 OCR 给出的 y 坐标就对不上了。
    fn dump_bmp(path: &std::path::Path, frame: &screen::Frame) {
        let row = frame.width as usize * 4;
        let body = row * frame.height as usize;
        let mut out = Vec::with_capacity(54 + body);
        out.extend_from_slice(b"BM");
        out.extend_from_slice(&((54 + body) as u32).to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&54u32.to_le_bytes());
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&(frame.width as i32).to_le_bytes());
        out.extend_from_slice(&(frame.height as i32).to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&32u16.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&(body as u32).to_le_bytes());
        out.extend_from_slice(&[0u8; 16]);
        for y in (0..frame.height as usize).rev() {
            out.extend_from_slice(&frame.bgra[y * row..(y + 1) * row]);
        }
        if let Err(err) = std::fs::write(path, &out) {
            println!("⚠ 写 {} 失败：{err}", path.display());
            return;
        }
        println!(
            "已存 {}（{}×{}）",
            path.display(),
            frame.width,
            frame.height
        );
    }
}

/// 按窗口几何算出 ROI 在**客户区坐标**下的矩形。
///
/// 三处调用（`ghost_probe`、冒烟测试、实验台）共用，免得每一处都手写
/// 「取客户区 → 减窗口原点 → 夹边界」这一串，也就不会出现「一处修了另一处没修」。
fn roi_of_window(window: &screen::WindowInfo, roi: &Roi) -> (i32, i32, i32, i32) {
    let hwnd = windows::Win32::Foundation::HWND(window.hwnd as *mut std::ffi::c_void);
    let (client_x, client_y, client_w, client_h) = screen::client_box(hwnd);
    let (offset_x, offset_y, client_w, client_h) = if client_w > 0 && client_h > 0 {
        (client_x - window.x, client_y - window.y, client_w, client_h)
    } else {
        (0, 0, window.width, window.height)
    };
    roi.pixel_box(
        (window.width, window.height),
        (client_w, client_h),
        (offset_x, offset_y),
    )
}

impl Roi {
    /// 把像素参数换成本次截屏要用的 `(x, y, width, height)`。
    ///
    /// 三个坐标系要说清楚，否则每改一次都要重踩：
    ///
    /// - **窗口坐标**（本结构的语义）：原点在 `GetWindowRect` 的左上角，含标题栏与边框。
    /// - **客户区坐标**：原点在游戏画面左上角，`screen::grab` 吃的就是这个。
    /// - 两者差 `offset`，即标题栏高度 + 左边框宽度。
    ///
    /// 为什么锚在窗口而不是客户区：三张 640/800/1025 的截图里，任务面板距**窗口**顶部
    /// 都是 210px、距**窗口**右缘都是 5px；而它们的客户区原点相差 71px（标题栏）。
    /// 换算成「距客户区顶部」就成了 210 与 139 两个值——同一套参数必然在一种窗口上切掉
    /// 面板标题栏。面板是跟着窗口边走的，参数就该跟窗口边量。
    ///
    /// 结果再夹回客户区内：客户区可能比 ROI 小（窗口被拉到极窄），
    /// `BitBlt` 拿到负宽高只会回一句「BitBlt 失败」，什么线索都没有。
    fn pixel_box(
        &self,
        window: (i32, i32),
        client: (i32, i32),
        offset: (i32, i32),
    ) -> (i32, i32, i32, i32) {
        let (window_w, window_h) = (window.0.max(1), window.1.max(1));
        let (client_w, client_h) = (client.0.max(1), client.1.max(1));

        // 先在窗口坐标里把矩形定下来。
        let x1 = window_w - self.right_px.clamp(0, window_w - 1);
        let x0 = x1 - self.width_px.clamp(1, window_w);
        let y0 = self.top_px.clamp(0, window_h - 1);
        let y1 = y0 + self.height_px.clamp(1, window_h);

        // 再换到客户区坐标，并夹进客户区。
        let cx0 = (x0 - offset.0).clamp(0, client_w - 1);
        let cy0 = (y0 - offset.1).clamp(0, client_h - 1);
        let cx1 = (x1 - offset.0).clamp(cx0 + 1, client_w);
        let cy1 = (y1 - offset.1).clamp(cy0 + 1, client_h);

        (cx0, cy0, cx1 - cx0, cy1 - cy0)
    }
}
