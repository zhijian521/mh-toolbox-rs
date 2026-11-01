//! 窗口枚举与截屏。
//!
//! 只用 GDI `BitBlt`，**不碰游戏进程内存**——那是内存挂，性质完全不同。
//! `BitBlt` 的代价是只能拿到**前台可见**的像素：窗口被别的窗口挡住时，
//! 截回来的是遮挡物。所以调用方必须保证游戏窗口在前台，且本应用的窗口不要压在它上面。
//!
//! 两条 DC 路线，**默认走屏幕 DC**（`grab`）：
//!
//! - **屏幕 DC**：像素与屏幕上看到的一致，什么时候都完整。
//! - **窗口 DC**：不要求窗口在前台，但对梦幻西游这种 DirectX 渲染的窗口，
//!   右边缘会整片返回**纯黑**。2026-10-31 真机实测：同一个 1295×1039 窗口、
//!   同一块区域（窗口内 x 从 0.72W 起），屏幕 DC 一路画到 363 列全有内容，
//!   窗口 DC 到第 207 列就全黑了。而任务面板正好贴在右边缘（文本 x 1080~1275），
//!   于是「开着游戏、任务栏明明在，却读到 0 行」。
//!
//! `PrintWindow` 对梦幻西游返回全黑（DirectX 渲染，GDI 取不到画面），已实测排除，
//! 连 `PW_RENDERFULLCONTENT`（flag=2）也一样黑。要截被遮挡的窗口只能上
//! Windows Graphics Capture，单窗口场景下暂时不需要。

use std::sync::Once;

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, HGDIOBJ,
    SRCCOPY,
};
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible,
};

/// 声明 per-monitor v2 DPI 感知，只做一次。
///
/// **不声明就会整体错位 25%**：Windows 对未声明 DPI 感知的进程虚拟化坐标。实测这台机器
/// （系统缩放 125%）上，1295×1039 的游戏窗口在未声明的进程里读回来是 1036×831，
/// 正好是 ÷1.25。ROI 是按窗口比例算的，比例本身没错，但算出来的像素位置全偏；
/// 而 `BitBlt` 拿的是**物理**像素——「按虚拟坐标算的位置」去截「物理像素」，两边对不上。
///
/// 2026-10-31 的对照很直接：当次能用的临时脚本第 10 行就有 `SetProcessDPIAware()`，
/// 搬进 Rust 后漏了这一句。
pub fn ensure_dpi_awareness() {
    static DPI: Once = Once::new();
    DPI.call_once(|| {
        // SAFETY: 纯进程级设置，无句柄、无生命周期问题。
        // 已经被 manifest 声明过时返回 `ERROR_ACCESS_DENIED`，那不是错误，忽略。
        unsafe {
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    });
}

/// 一个可见的顶层窗口。前端用它做「监听哪个客户端」的选择。
///
/// `hwnd` 用 `i64` 而非 `isize`：Windows 句柄是 64 位，`i64` 在 IPC 上是普通数字，
/// JS 的 `number` 能精确表示到 2^53，足够装下一个指针值。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub hwnd: i64,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 一帧截屏。像素顺序是 BGRA（`BitBlt` + 32 位 DIB 的原生顺序），
/// 正好等于 WinRT `BitmapPixelFormat::Bgra8`，不用再做通道交换。
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

impl Frame {
    /// 整帧几乎没有亮像素——不是「任务栏字很小」，是**根本没看到屏幕**。
    ///
    /// 三种情况都会得到这样的帧，而且症状完全一样：屏幕已锁定、窗口被完全遮住、
    /// 窗口不接受 `BitBlt`。不管哪一种，调用方都必须报错而不是当成「读到 0 行」：
    /// 任务栏永远是带纹理的深色面板，正常截到的区域不可能 99.8% 是纯黑。
    ///
    /// 这个判定的由来：2026-10-31 真机跑冒烟测试时屏幕锁着，`ghost_probe` 一路返回
    /// 「成功、0 行」，界面上成了「监听中、没有任务」——用户会以为鬼没刷。
    pub fn is_blank(&self) -> bool {
        let total = self.bgra.len() / 4;
        if total == 0 {
            return true;
        }
        let lit = self
            .bgra
            .chunks_exact(4)
            .filter(|p| p[0] > 8 || p[1] > 8 || p[2] > 8)
            .count();
        // 0.2% 以下算全黑。用乘法比较，避免引入浮点。
        lit * 500 < total
    }
}

fn title_of(hwnd: HWND) -> String {
    // SAFETY: 两个函数都只读窗口属性；缓冲区长度按 `GetWindowTextLengthW` 的返回值申请，
    // 并且多留一个位置放结尾的 0。
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        if n <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..n as usize])
    }
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` 由 `list` 传入，指向一个活到 `EnumWindows` 返回之后的 `CollectSink`。
    unsafe {
        let sink = &mut *(lparam.0 as *mut CollectSink);

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let title = title_of(hwnd);
        if title.is_empty() {
            return BOOL(1);
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        // 0 尺寸的是隐藏的工具窗，标题有但不值得列出来。
        if width <= 0 || height <= 0 {
            return BOOL(1);
        }

        sink.out.push(WindowInfo {
            hwnd: hwnd.0 as i64,
            title,
            x: rect.left,
            y: rect.top,
            width,
            height,
        });
        BOOL(1)
    }
}

struct CollectSink {
    out: Vec<WindowInfo>,
}

/// 列出全部有标题的可见顶层窗口，按面积从大到小。
///
/// 不在这里判断「哪个是梦幻」：客户端标题里带角色名与服务器，不同版本写法也不同，
/// 猜错一次就白等一轮。让前端把列表画出来、由用户选，比写一条会过期的规则稳。
pub fn list_windows() -> Vec<WindowInfo> {
    ensure_dpi_awareness();
    let mut sink = CollectSink { out: Vec::new() };
    // SAFETY: 回调只在本次调用期间被 Windows 调用，指针指向栈上的 `sink`。
    unsafe {
        let _ = EnumWindows(
            Some(collect_window),
            LPARAM(&mut sink as *mut CollectSink as isize),
        );
    }
    let mut out = sink.out;
    out.sort_by_key(|w| -(w.width as i64 * w.height as i64));
    out
}

/// 从窗口截一块区域（**客户区内**的相对像素坐标）。这是默认入口。
///
/// 顺序是「屏幕 DC 优先，窗口 DC 兜底」，不是反过来：
///
/// 1. 客户区原点用 `ClientToScreen` 换成屏幕坐标，从屏幕 DC 截。只要窗口在前台，
///    这样拿到的内容与眼睛看到的一致——而窗口 DC 对 DirectX 窗口会丢掉右边缘
///    （见模块顶部注释，实测丢 156px，正好盖住任务面板）。
/// 2. 屏幕 DC 截成全黑时（窗口被完全遮住、屏幕已锁）再退到窗口 DC：它对遮挡
///    相对宽容，偶尔还能救回一帧。两边都黑就把黑帧交回去，由调用方报错。
pub fn grab(hwnd: HWND, x: i32, y: i32, width: i32, height: i32) -> Result<Frame, String> {
    ensure_dpi_awareness();
    if width <= 0 || height <= 0 {
        return Err("截屏区域为空".to_string());
    }

    let (cx, cy, _, _) = client_box(hwnd);
    if cx != 0 || cy != 0 {
        if let Ok(frame) = grab_screen(cx + x, cy + y, width, height) {
            if !frame.is_blank() {
                return Ok(frame);
            }
        }
    }

    grab_window(hwnd, x, y, width, height)
}

/// 只走窗口 DC。不要求窗口在前台，但会丢右边缘（见模块顶部注释）。
///
/// 留着是因为它比屏幕 DC 更抗遮挡：自己的窗口压上去时屏幕 DC 截到的是自己的界面，
/// 而窗口 DC 有时还能拿到目标窗口的画面。
pub fn grab_window(hwnd: HWND, x: i32, y: i32, width: i32, height: i32) -> Result<Frame, String> {
    // SAFETY: hdc 在本函数返回前释放；`capture` 内部自己管位图的生命周期。
    unsafe {
        let hdc = GetDC(Some(hwnd));
        if hdc.is_invalid() {
            return Err("取窗口 DC 失败（窗口可能已关闭）".to_string());
        }
        let result = capture(hdc, x, y, width, height);
        release_dc(hdc, hwnd);
        result
    }
}

/// 从**屏幕** DC 截一块区域（屏幕绝对像素坐标）。
pub fn grab_screen(x: i32, y: i32, width: i32, height: i32) -> Result<Frame, String> {
    ensure_dpi_awareness();
    // SAFETY: hdc 在本函数返回前释放。
    unsafe {
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return Err("取屏幕 DC 失败".to_string());
        }
        let result = capture(hdc, x, y, width, height);
        let _ = ReleaseDC(None, hdc);
        result
    }
}

/// 客户区在屏幕坐标系下的矩形 `(x, y, width, height)`。
///
/// `grab` 的 `(x, y)` 是**客户区**坐标，而 `WindowInfo` 里的 `x/y/width/height` 来自
/// `GetWindowRect`（含标题栏与边框）。两者差一个客户区原点，屏幕 DC 要用绝对坐标。
pub fn client_box(hwnd: HWND) -> (i32, i32, i32, i32) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::UI::WindowsAndMessaging::GetClientRect;
    // SAFETY: 三个函数都只读窗口几何，失败时返回 `None` 由我们兜底。
    unsafe {
        let mut rect = RECT::default();
        if GetClientRect(hwnd, &mut rect).is_err() {
            return (0, 0, 0, 0);
        }
        let mut origin = POINT { x: 0, y: 0 };
        let _ = ClientToScreen(hwnd, &mut origin);
        (
            origin.x,
            origin.y,
            rect.right - rect.left,
            rect.bottom - rect.top,
        )
    }
}

/// 真正的截屏：从给定 DC 的 `(x, y)` 处拷一块出来。
fn capture(hdc: HDC, x: i32, y: i32, width: i32, height: i32) -> Result<Frame, String> {
    if width <= 0 || height <= 0 {
        return Err("截屏区域为空".to_string());
    }

    // SAFETY: 每个句柄都在下面按相反顺序释放；`buf` 的生命周期覆盖 `GetDIBits` 调用。
    unsafe {
        let hdc_mem = CreateCompatibleDC(Some(hdc));
        if hdc_mem.is_invalid() {
            return Err("建兼容 DC 失败".to_string());
        }

        let bitmap = CreateCompatibleBitmap(hdc, width, height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            return Err("建兼容位图失败".to_string());
        }

        let previous = SelectObject(hdc_mem, HGDIOBJ(bitmap.0));
        let blit = BitBlt(hdc_mem, 0, 0, width, height, Some(hdc), x, y, SRCCOPY);

        let mut result = Err("BitBlt 失败".to_string());
        if blit.is_ok() {
            // biHeight 取负数 = 自上而下的行序，与 WinRT 的位图约定一致。
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buf = vec![0u8; width as usize * height as usize * 4];
            let lines = GetDIBits(
                hdc_mem,
                bitmap,
                0,
                height as u32,
                Some(buf.as_mut_ptr() as *mut _),
                &mut info,
                DIB_RGB_COLORS,
            );
            if lines == 0 {
                result = Err("GetDIBits 失败".to_string());
            } else {
                result = Ok(Frame {
                    width: width as u32,
                    height: height as u32,
                    bgra: buf,
                });
            }
        }

        SelectObject(hdc_mem, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(hdc_mem);
        result
    }
}

/// `ReleaseDC` 的返回值不用：失败也没有补救手段，吞掉比在每条分支上重复 `let _ =` 干净。
unsafe fn release_dc(hdc: HDC, hwnd: HWND) {
    // SAFETY: 调用方保证 hdc 来自 GetDC 且未被释放。
    unsafe {
        windows::Win32::Graphics::Gdi::ReleaseDC(Some(hwnd), hdc);
    }
}

/// 把 BGRA 帧按整数倍双线性放大。
///
/// 现在只有**降级兜底**那条路用它：模型没加载时退回 `Windows.Media.Ocr`，
/// 而它的可靠下限在 20px 左右（任务栏正文字高约 13px）。PP-OCRv4 那条路自带
/// 检测分支，自己在 `ocr_paddle::upscale_rgb` 里放大，不经过这里。
///
/// 为什么不用最近邻：像素风字体放大后边缘是硬台阶，OCR 的笔画分割会把
/// `9` 的圆头读断。双线性糊一点，识别率反而更高（实测 3× 双线性与
/// PIL 的 LANCZOS 结果一致）。
pub fn upscale(src: &[u8], width: u32, height: u32, factor: u32) -> (Vec<u8>, u32, u32) {
    if factor <= 1 {
        return (src.to_vec(), width, height);
    }
    let w = width as usize;
    let h = height as usize;
    let nw = w * factor as usize;
    let nh = h * factor as usize;
    let mut out = vec![0u8; nw * nh * 4];
    let scale = factor as i64;

    for oy in 0..nh {
        let (sy0, sy1, wy) = sample_axis(oy as i64, scale, h);
        for ox in 0..nw {
            let (sx0, sx1, wx) = sample_axis(ox as i64, scale, w);

            let i00 = (sy0 * w + sx0) * 4;
            let i01 = (sy0 * w + sx1) * 4;
            let i10 = (sy1 * w + sx0) * 4;
            let i11 = (sy1 * w + sx1) * 4;
            let o = (oy * nw + ox) * 4;

            for c in 0..4 {
                let top = src[i00 + c] as u32 * (256 - wx) + src[i01 + c] as u32 * wx;
                let bottom = src[i10 + c] as u32 * (256 - wx) + src[i11 + c] as u32 * wx;
                let value = (top * (256 - wy) + bottom * wy) >> 16;
                out[o + c] = value.min(255) as u8;
            }
        }
    }
    (out, nw as u32, nh as u32)
}

/// 目标下标 → 源图上的两个采样点与权重（0~256）。
///
/// 采样点取**像素中心**：`src = (dst + 0.5) / factor - 0.5`。
/// 这一步必须用有符号数：`dst = 0` 时结果是负的半个像素（放大 3 倍是 −0.333），
/// 用无符号减法直接下溢——第一版就是这么写的，测试里 `attempt to subtract with overflow`
/// 当场炸掉。就算不提 `overflow` 检查，`>> 16` 对负数也会给出完全错误的整数部分，
/// 表现为整块文字向上向左偏一截，而 OCR 仍然认得出，只是行坐标全错。
fn sample_axis(dst: i64, factor: i64, limit: usize) -> (usize, usize, u32) {
    // 16.16 定点：`(2·dst + 1) · 32768 / factor − 32768`。
    let fixed = ((2 * dst + 1) * 32768) / factor - 32768;
    let base = fixed >> 16; // 向下取整（算术右移，负数也对）
    let fraction = fixed & 0xFFFF; // 补码下这就是小数部分
    let weight = (fraction * 256 / 65536) as u32;

    let last = limit.saturating_sub(1) as i64;
    let a = base.clamp(0, last) as usize;
    let b = (base + 1).clamp(0, last) as usize;
    (a, b, weight)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 枚举本身不崩、返回的每一项都合法。
    ///
    /// 不要求「至少有一个窗口」：这条断言在无头环境里不成立，而为了让它在无头下过
    /// 又得加跳过条件——跳过条件本身一旦写错，这条测试就永远是绿的。
    /// 这里只验「EnumWindows 的回调没崩、矩形与标题的形状对」。
    #[test]
    fn enumeration_returns_well_formed_windows() {
        for window in list_windows() {
            assert!(window.width > 0, "宽度不该 <= 0：{}", window.title);
            assert!(window.height > 0, "高度不该 <= 0：{}", window.title);
            assert!(!window.title.is_empty(), "不该列出无标题窗口");
        }
    }

    /// 放大 3 倍后尺寸正好是三倍，且逐像素对齐（左上角等于原图左上角）。
    /// 这条容易写错的地方是定点采样的偏移：写偏半格会让整块文字整体位移，
    /// OCR 仍然能认，但行的 y 坐标全是错的。
    #[test]
    fn upscale_triples_size_and_keeps_corners() {
        let (width, height) = (4u32, 3u32);
        let mut bgra = vec![0u8; (width * height * 4) as usize];
        // 左上角那个像素涂成纯白，其余全黑。
        bgra[0] = 255;
        bgra[1] = 255;
        bgra[2] = 255;
        bgra[3] = 255;

        let (scaled, scaled_width, scaled_height) = upscale(&bgra, width, height, 3);
        assert_eq!(scaled_width, 12);
        assert_eq!(scaled_height, 9);
        assert_eq!(scaled.len(), 12 * 9 * 4);

        // 输出左上角应仍是那个白点（边界采样夹到源像素）。
        assert!(scaled[0] > 200, "左上角被插值抹掉了：{}", scaled[0]);
    }

    /// 全黑判定：全 0 → 黑；零星亮到 0.2% 以下 → 仍算黑；超过 → 不算黑。
    ///
    /// 这条断言的用处是防止把阈值写反。写反了会怎样：正常帧被判成全黑，
    /// 于是每次识别都报「屏幕可能已锁定」，功能等于不可用，而且报的原因看起来
    /// 理直气壮——比不判更难查。
    #[test]
    fn blank_frame_threshold() {
        let (w, h) = (100u32, 100u32);
        let total = (w * h) as usize;

        let frame = Frame {
            width: w,
            height: h,
            bgra: vec![0u8; total * 4],
        };
        assert!(frame.is_blank(), "全 0 应判为全黑");

        // 19 个像素亮 → 19 * 500 = 9500 < 10000，仍在阈值内。
        let mut bgra = vec![0u8; total * 4];
        for i in 0..19 {
            bgra[i * 4] = 200;
        }
        let frame = Frame {
            width: w,
            height: h,
            bgra,
        };
        assert!(frame.is_blank(), "孤立亮点不该推翻「没看到屏幕」的判断");

        // 40 个像素亮 → 20000 > 10000，正常帧不该被误判。
        let mut bgra = vec![0u8; total * 4];
        for i in 0..40 {
            bgra[i * 4] = 200;
        }
        let frame = Frame {
            width: w,
            height: h,
            bgra,
        };
        assert!(!frame.is_blank(), "0.4% 亮像素不该判成全黑");
    }
}
