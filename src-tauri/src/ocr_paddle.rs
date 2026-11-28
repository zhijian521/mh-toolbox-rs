//! PaddleOCR（PP-OCRv4）离线识别：检测 + 方向分类 + 识别三个 ONNX 模型。
//!
//! 为什么换掉 `Windows.Media.Ocr`（原实现保留在 `ocr.rs` 作兜底）：那个引擎
//! 对**彩色描边大字**几乎必错。2026-11-01 用三张真机截图量过同一帧——
//! 白字全对，而黄色高亮的「金钱镖」「金童子」「龙女妹妹」整段读不出来，
//! 且它**不返回置信度**，错了也无从判断。PP-OCRv4 是中文专门训练的，
//! 且分成「检测 → 识别」两步：先在图上框出文本行，再把每行拉正、缩放到统一高度
//! 送去识别。暗底亮字、半透明面板、黄绿白三色混排对它不是难题。
//!
//! 代价是模型 16MB 随包分发 + onnxruntime 约 12MB。这一页的全部价值就是「认得准」，
//! 值得。
//!
//! # 坐标系
//!
//! `detect` 返回的 `box_points` 是**传进去那张图**的坐标（它内部先 padding 再缩小，
//! 最后减掉 padding 还原）。它**只缩不放**：`max_side_len` 大于原图长边时按原图跑。
//! 所以「放大到能认」必须自己先做，见 `recognize` 的 `scale` 参数。

pub mod chat;
#[cfg(windows)]
pub mod ncnn;

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use paddle_ocr_rs::ocr_lite::OcrLite;

use crate::ocr::TextLine;

/// 模型文件（四者缺一不可）。
///
/// 字典必须显式传：crate 的 `init_models`（四参数版）内置了一份，但实测调用后
/// 识别阶段直接 panic「crnn_net character not initialized」——内置字典那条路径
/// 在 0.6.1 上不可用。显式给 `ppocr_keys_v1.txt` 是唯一能跑通的入口。
const DET: &str = "ch_PP-OCRv4_det_infer.onnx";
const CLS: &str = "ch_ppocr_mobile_v2.0_cls_infer.onnx";
const REC: &str = "ch_PP-OCRv4_rec_infer.onnx";
const KEYS: &str = "ppocr_keys_v1.txt";

/// 低于这个置信度的行直接丢掉。
///
/// 实测（2026-11-01，真机任务栏）：正确的行都在 0.81~1.00，而放大倍数过大时
/// 检测分支会在标题栏上方框出一小截杂字（如「百女」，0.34）。这类行留着有害：
/// 前端是把所有行拼成一串再跑正则的，多一截杂字就多一次「正文被切开」的机会。
/// 阈值取 0.5，离两侧都留了余量。
const MIN_SCORE: f32 = 0.5;

/// 放大倍数的上限。**唯一一份**，`ghost.rs` 夹参数时也读它。
///
/// 分成两处各写一个数字的后果是静默截断：调用方按 `clamp(1, 6)` 觉得传了 6，
/// 到这里被压成 4，耗时和结果都和「用户以为传的值」不符，却不报错。
/// 4 是实测上限：×4 起开始丢行，×5 以上只是更慢。
pub const MAX_SCALE: u32 = 4;

/// 截图识别那条链的上限。为什么它能到 6 而捉鬼那条不能：见 `recognize_image`。
pub const MAX_IMAGE_SCALE: u32 = 6;

/// 与原生 OCR2 的输入预算一致，先校验尺寸再分配 BGRA 缓冲区。
pub(super) fn bgra_bytes(width: u32, height: u32) -> Option<usize> {
    let area = u64::from(width) * u64::from(height);
    (width.max(height) <= 16384 && (1..=16 * 1024 * 1024).contains(&area))
        .then(|| area as usize * 4)
}

/// 模型目录由 `lib.rs` 在启动时注入（开发时是 `<manifest>/models`，
/// 打包后是资源目录）。放 `OnceLock` 而不是配置项：目录在进程生命周期里不会变。
static MODELS_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 引擎只建一次。`OcrLite::detect` 要 `&mut self`，所以必须包一层 `Mutex`。
///
/// 串行化在这里不是妥协：任务栏一次只读一帧，真正要防的是「两次识别并发把
/// ONNX session 跑成竞态」。轮询间隔远大于单帧耗时，锁几乎从不被争到。
static ENGINE: OnceLock<Result<Mutex<OcrLite>, String>> = OnceLock::new();

/// 告诉本模块模型在哪。
///
/// 只在进程启动时调一次。**不返回错误**：目录不对的后果推迟到第一次识别时
/// 以正常错误返回，这样「模型缺失」和「截屏失败」在界面上是同一种提示，
/// 不会因为启动顺序问题让整个应用起不来。
pub fn set_models_dir(dir: PathBuf) {
    let _ = MODELS_DIR.set(dir);
}

fn engine() -> Result<&'static Mutex<OcrLite>, String> {
    let result = ENGINE.get_or_init(|| {
        let dir = MODELS_DIR
            .get()
            .ok_or_else(|| "OCR 模型目录未初始化".to_string())?;
        for name in REQUIRED {
            if !dir.join(name).is_file() {
                return Err(format!("缺少 OCR 模型：{}", dir.join(name).display()));
            }
        }
        let dict = prepared_dict(dir)?;
        let mut ocr = OcrLite::new();
        /* 线程数。捉鬼那条链（215 × 400 的 ROI、约 0.25M 像素）两线程就够，
         * 识别一帧 200~400ms，多开反而和截屏轮询抢核。
         *
         * **2026-11-07 提到 4**：截图识别要处理 1~2M 像素的面板图，两线程下一张
         * 321 × 426 的面板要 7.8s，四线程 7.0s。省得不多（约一成）——慢的主因是
         * **每次调用都有一个两秒左右的固定开销**，再往下是像素（空白图 1284 × 1704
         * 单检测就要 5~6s），不是线程。留着 4 是因为它没坏处，而「点一次等七秒」
         * 里能省一点是一点；真要在小机器上跑，改回 2 也行。 */
        ocr.init_models_with_dict(
            &dir.join(DET).to_string_lossy(),
            &dir.join(CLS).to_string_lossy(),
            &dir.join(REC).to_string_lossy(),
            &dict.0.to_string_lossy(),
            4,
        )
        .map_err(|err| format!("加载 OCR 模型失败：{err}"))?;
        Ok(Mutex::new(ocr))
    });
    match result {
        Ok(engine) => Ok(engine),
        Err(err) => Err(err.clone()),
    }
}

/// 把原始字典补成模型索引期待的样子，临时文件仅保留到模型完成加载。
///
/// 这一步不能省，也不能把补好的字典直接当资源发出去：
///
/// PP-OCRv4 的分类分支输出 `[blank, 6623 个字, 空格]`，共 6625 类。crate 从
/// **模型元数据**读字典时会自己做这件事（`keys = ["#"] + 元数据 + [" "]`），
/// 但这份 ONNX 是从 Paddle 转来的、**不带 `character` 元数据**，走元数据那条路
/// 直接 panic「crnn_net character not initialized」。退到「传字典文件」时，
/// crate 又只是 `content.split('\n')`——不做任何补位，于是整体错开一格：
/// 「任务追踪」被读成「潘指词喵」。两者都对不上，只能由我们补全后喂进去。
///
/// 补好的字典写到临时文件而不是随包分发：`ppocr_keys_v1.txt` 保持与上游逐字节
/// 一致（可校验、可替换），错位规则留在代码里，不会被一次「顺手更新字典」弄丢。
struct PreparedDict(PathBuf);

impl Drop for PreparedDict {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn prepared_dict(dir: &Path) -> Result<PreparedDict, String> {
    let raw =
        std::fs::read_to_string(dir.join(KEYS)).map_err(|err| format!("读 OCR 字典失败：{err}"))?;
    let text = normalize_dict(&raw);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| format!("创建 OCR 临时字典失败：{err}"))?
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "mh-toolbox-ocr-keys-{}-{stamp}.txt",
        std::process::id()
    ));
    // 独占创建，避免不同实例或权限的应用共用旧临时文件；字典读入内存后自动删除。
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|err| format!("创建 OCR 临时字典失败（{}）：{err}", path.display()))?;
    let dict = PreparedDict(path);
    let result = file.write_all(text.as_bytes());
    drop(file);
    result.map_err(|err| format!("写 OCR 临时字典失败（{}）：{err}", dict.0.display()))?;
    Ok(dict)
}

fn normalize_dict(raw: &str) -> String {
    let mut text = String::with_capacity(raw.len() + 4);
    text.push_str("#\n");
    for line in raw.split('\n') {
        // 逐行剥掉 `\r`：crate 只按 `\n` 切，字典若被转成 CRLF（换机器、换 git 配置、
        // 用记事本另存一次都会），每个字都会带着 `\r` 进表——模型加载成功、识别框也对，
        // 只是输出的每个字都是错的。仓库里已用 `-text` 声明不转换，这里是第二道。
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        text.push_str(line);
        text.push('\n');
    }
    text.push_str(" \n");

    text
}

/// 首个业务页面绘制后后台预热；提前识别仍复用同一份按需初始化的引擎。
pub fn warm_up() -> Result<(), String> {
    engine().map(|_| ())
}

/// 识别一帧 BGRA 位图。
///
/// `scale` 是送进检测前的放大倍数：PP-OCRv4 的检测模型**只缩不放**，
/// 直接把 215×400 的 ROI 喂进去，正文那 15px 高的汉字在检测分支里
/// 只剩几个像素，框都框不出来。放大到 45px 左右再送，检测与识别都稳。
///
/// 返回的坐标已除回 `scale`，等于 ROI 内的像素偏移，调用方不必关心倍数。
pub fn recognize(
    bgra: &[u8],
    width: u32,
    height: u32,
    scale: u32,
) -> Result<Vec<TextLine>, String> {
    run(bgra, width, height, scale, MAX_SCALE)
}

/// 截图识别的入口：**允许放到 6 倍**（`ghost` 那条链仍封顶在 4）。
///
/// 为什么两条链不一样：捉鬼一次拿 215 × 400 的 ROI，字高 15px，×3 已经到 45px，
/// 再往上只是白烧 CPU；而截图识别收到的图**尺寸不受控**——一张 155 × 273 的低分辨率
/// 面板（用户从聊天窗口里截的）字高只有 6~7px，×4 之后检测分支仍然框不稳，
/// 实测标签会认成「气电 / 活店 / 收害」这种，而 ×6 之后「气血 / 活力 / 伤害」全对。
///
/// 代价是像素多了一半、耗时从约 3.2s 涨到 4.4s——但那是用户主动点的一次识别，
/// 认错一个字要手动改一行，比多等一秒贵得多。
pub fn recognize_image(
    bgra: &[u8],
    width: u32,
    height: u32,
    scale: u32,
) -> Result<Vec<TextLine>, String> {
    run(bgra, width, height, scale, MAX_IMAGE_SCALE)
}

/// 两条链共用的一段：放大 → 检测 → 逐框识别 → 坐标除回。
fn run(
    bgra: &[u8],
    width: u32,
    height: u32,
    scale: u32,
    max_scale: u32,
) -> Result<Vec<TextLine>, String> {
    let expected = width as usize * height as usize * 4;
    if bgra.len() != expected {
        return Err(format!(
            "位图长度不符：期望 {expected}，实际 {}",
            bgra.len()
        ));
    }
    let ocr = engine()?;

    let scale = scale.clamp(1, max_scale);
    let (rgb, rw, rh) = upscale_rgb(bgra, width, height, scale);

    // max_side_len 给得比放大后的长边大，等于「不做任何缩放」：
    // 缩放交给上面的整数倍放大统一控制，否则「放大 3 倍」实际被它又缩回去一半，
    // 参数就失去意义了。padding 24 是 RapidOCR 的常用值，给旋转框留出余量。
    let mut ocr = ocr
        .lock()
        .map_err(|_| "OCR 引擎状态被污染，需要重启应用".to_string())?;
    let result = ocr
        .detect(
            &rgb,
            24,
            (rw.max(rh) + 64).max(640),
            0.5,   // box_score_thresh：检测框是否算文本的阈值
            0.3,   // box_thresh：框内平均概率的阈值
            1.6,   // un_clip_ratio：文字框向外扩张，防止笔画被裁
            false, // do_angle：任务栏是横排，不做 180° 翻转判断，省一次前向
            false, // most_angle
        )
        .map_err(|err| format!("OCR 推理失败：{err}"))?;
    drop(ocr);

    let mut out: Vec<_> = result
        .text_blocks
        .into_iter()
        .filter_map(|block| text_line(&block.box_points, &block.text, block.text_score, scale, 0))
        .collect();

    // 按 y 排：任务是单列，排完保证「同一块的行挨在一起」。
    // 同一行被检测成两段时按 x 排，免得右半截跑到左半截前面。
    out.sort_by(|a, b| a.y.cmp(&b.y).then(a.x.cmp(&b.x)));
    Ok(out)
}

/// 检测框坐标换回原图。直接使用检测网络时，框坐标仍包含模型的留白。
fn text_line(
    points: &[paddle_ocr_rs::ocr_result::Point],
    text: &str,
    score: f32,
    scale: u32,
    padding: u32,
) -> Option<TextLine> {
    let text = text.trim();
    if points.is_empty() || text.is_empty() || score < MIN_SCORE {
        return None;
    }
    let (mut x0, mut y0) = (u32::MAX, u32::MAX);
    let (mut x1, mut y1) = (0, 0);
    for point in points {
        let x = point.x.saturating_sub(padding);
        let y = point.y.saturating_sub(padding);
        x0 = x0.min(x);
        y0 = y0.min(y);
        x1 = x1.max(x);
        y1 = y1.max(y);
    }
    Some(TextLine {
        text: text.to_owned(),
        x: (x0 / scale) as i32,
        y: (y0 / scale) as i32,
        width: ((x1 - x0) / scale) as i32,
        height: ((y1 - y0) / scale) as i32,
        score,
    })
}

/// BGRA → RGB，同时按整数倍放大。
///
/// 用**最近邻**而不是双三次：任务栏的字是游戏直接点阵渲染的，边缘本来就硬，
/// 双三次插值会把 2px 宽的笔画糊成 4px 的灰边，反而降识别率。
/// 这一点与「照片放大」的直觉相反，是 RapidOCR 在游戏截图上的常见结论。
fn upscale_rgb(bgra: &[u8], width: u32, height: u32, scale: u32) -> (image::RgbImage, u32, u32) {
    let scale = scale.max(1);
    let (sw, sh) = (width * scale, height * scale);
    let mut out = vec![0u8; (sw * sh * 3) as usize];
    for y in 0..sh {
        let source_y = (y / scale) as usize;
        let source_row = source_y * width as usize;
        let target_row = y as usize * sw as usize;
        for x in 0..sw {
            let source = (source_row + (x / scale) as usize) * 4;
            let target = (target_row + x as usize) * 3;
            out[target] = bgra[source + 2]; // R（BMP 的字节序是 BGRA）
            out[target + 1] = bgra[source + 1]; // G
            out[target + 2] = bgra[source]; // B
        }
    }
    let image = image::RgbImage::from_raw(sw, sh, out).expect("缓冲区尺寸与图像尺寸一致，不会失败");
    (image, sw, sh)
}

/// 四件必须齐全才算「这个目录可用」。
///
/// 单看 `DET` 存在就选中是**不够的**，而且真的踩过：`tauri.conf.json` 的
/// `resources` 只写了 `models/*.onnx`，字典 `ppocr_keys_v1.txt` 没被打包，
/// 于是 `target/<profile>/models` 里只有三个 onnx。按「DET 在就算数」判定，
/// 这个**缺字典**的目录会排在源码目录前面被选中，接着 `engine()` 报「缺少 OCR 模型」，
/// 再被 `ghost.rs` 静默退回 Windows OCR —— 界面上一切正常，只是认出来的字全是错的，
/// 而错的原因（字典没打包）不会出现在任何看得见的地方。
///
/// 判据必须和「能不能跑」一致：四件都在才叫在。
const REQUIRED: [&str; 4] = [DET, CLS, REC, KEYS];

/// 发布版只从应用资源与安装目录找模型，避免开发机源码掩盖漏包。
pub fn locate_models(app_dir: Option<&Path>) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(debug_assertions)]
    if let Ok(dir) = std::env::var("MH_OCR_MODELS") {
        candidates.push(PathBuf::from(dir));
    }
    if let Some(dir) = app_dir {
        candidates.push(dir.join("models"));
        candidates.push(dir.join("resources").join("models"));
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
    {
        candidates.push(dir.join("models"));
    }
    #[cfg(debug_assertions)]
    {
        candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("models"));
        candidates.push(PathBuf::from("models"));
    }

    candidates
        .iter()
        .find(|dir| REQUIRED.iter().all(|name| dir.join(name).is_file()))
        .cloned()
        .unwrap_or_else(|| {
            candidates
                .first()
                .cloned()
                .unwrap_or_else(|| PathBuf::from("models"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dictionary_keeps_model_indices_across_line_endings() {
        assert_eq!(normalize_dict("一\r\n\r\n二\r\n"), "#\n一\n二\n \n");
        assert_eq!(normalize_dict("一\n二"), "#\n一\n二\n \n");
    }

    #[test]
    fn temporary_dictionaries_are_independent_and_removed_after_loading() {
        let models = Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
        let a = prepared_dict(&models).unwrap();
        let b = prepared_dict(&models).unwrap();
        assert_ne!(a.0, b.0);
        let path = a.0.clone();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("#\n"));
        assert!(content.ends_with("\n \n"));
        drop(a);
        assert!(!path.exists());
        assert!(b.0.is_file());
    }

    /// 放大与颜色通道换算：两件事写在同一个循环里，错了会一起错，
    /// 所以用 2×2 的四个已知像素把两者都钉死。
    #[test]
    fn upscale_keeps_colors_and_replicates_pixels() {
        // 四个像素：纯红 / 纯绿 / 纯蓝 / 白，BGRA 序。
        let bgra = [
            0, 0, 255, 255, // R
            0, 255, 0, 255, // G
            255, 0, 0, 255, // B
            255, 255, 255, 255, // W
        ];
        let (img, w, h) = upscale_rgb(&bgra, 2, 2, 2);
        assert_eq!((w, h), (4, 4));
        let at = |x: u32, y: u32| img.get_pixel(x, y).0;
        // 左上 2×2 都该是红
        assert_eq!(at(0, 0), [255, 0, 0]);
        assert_eq!(at(1, 1), [255, 0, 0]);
        // 右上绿、左下蓝、右下白
        assert_eq!(at(2, 0), [0, 255, 0]);
        assert_eq!(at(0, 2), [0, 0, 255]);
        assert_eq!(at(3, 3), [255, 255, 255]);
    }

    /// 尺寸不符要在进推理前拦住：ONNX 那头报的错只说「维度不匹配」，
    /// 看不出是我们的缓冲区算错了。
    #[test]
    fn rejects_mismatched_buffer() {
        let error = recognize(&[0u8; 16], 100, 100, 2).unwrap_err();
        assert!(error.contains("位图长度不符"), "错误信息不对：{error}");
    }
}
