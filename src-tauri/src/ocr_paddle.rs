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
        // 两个线程：识别一帧约 200~400ms，再多线程反而和截屏轮询抢核。
        ocr.init_models_with_dict(
            &dir.join(DET).to_string_lossy(),
            &dir.join(CLS).to_string_lossy(),
            &dir.join(REC).to_string_lossy(),
            &dict.to_string_lossy(),
            2,
        )
        .map_err(|err| format!("加载 OCR 模型失败：{err}"))?;
        Ok(Mutex::new(ocr))
    });
    match result {
        Ok(engine) => Ok(engine),
        Err(err) => Err(err.clone()),
    }
}

/// 把原始字典补成模型索引期待的样子，写到临时文件后返回路径。
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
fn prepared_dict(dir: &Path) -> Result<PathBuf, String> {
    let raw =
        std::fs::read_to_string(dir.join(KEYS)).map_err(|err| format!("读 OCR 字典失败：{err}"))?;
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

    let path = std::env::temp_dir().join("mh-toolbox-ocr-keys.txt");
    std::fs::write(&path, text).map_err(|err| format!("写 OCR 字典失败：{err}"))?;
    Ok(path)
}

/// 预热：把模型加载的时间挪到启动时。
///
/// 不预热的话，第一次识别要等 1~2 秒，而那正好是用户点「开始识别」的时刻——
/// 界面会先停一下再出结果，看起来像卡住了。
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
    let expected = width as usize * height as usize * 4;
    if bgra.len() != expected {
        return Err(format!(
            "位图长度不符：期望 {expected}，实际 {}",
            bgra.len()
        ));
    }
    let ocr = engine()?;

    let scale = scale.clamp(1, MAX_SCALE);
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

    let factor = scale as f32;
    let mut out: Vec<TextLine> = result
        .text_blocks
        .into_iter()
        .filter_map(|block| {
            let text = block.text.trim().to_string();
            if text.is_empty() || block.text_score < MIN_SCORE {
                return None;
            }
            // 四个角点取外接矩形。任务是单列排版，外接框就是这一行的范围。
            let (mut x0, mut y0) = (u32::MAX, u32::MAX);
            let (mut x1, mut y1) = (0u32, 0u32);
            for point in &block.box_points {
                x0 = x0.min(point.x);
                y0 = y0.min(point.y);
                x1 = x1.max(point.x);
                y1 = y1.max(point.y);
            }
            if x0 == u32::MAX {
                return None;
            }
            Some(TextLine {
                text,
                x: (x0 as f32 / factor) as i32,
                y: (y0 as f32 / factor) as i32,
                width: ((x1 - x0) as f32 / factor) as i32,
                height: ((y1 - y0) as f32 / factor) as i32,
                score: block.text_score,
            })
        })
        .collect();

    // 按 y 排：任务是单列，排完保证「同一块的行挨在一起」。
    // 同一行被检测成两段时按 x 排，免得右半截跑到左半截前面。
    out.sort_by(|a, b| a.y.cmp(&b.y).then(a.x.cmp(&b.x)));
    Ok(out)
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

/// 找模型目录。按「越具体越先」的顺序试，全部落空则返回最后一个候选，
/// 让错误信息里带上一个能看的路径。
///
/// 为什么要试这么多个：开发跑（`cargo tauri dev`）时 exe 在 `target/debug`，
/// 打包后 exe 在安装目录且资源在同级 `resources`，而离线实验台要能临时指到别处。
/// 少试一条，就会出现「打包版能跑、开发版报缺模型」这种只在一边出现的问题。
pub fn locate_models(app_dir: Option<&Path>) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = std::env::var("MH_OCR_MODELS") {
        candidates.push(PathBuf::from(dir));
    }
    if let Some(dir) = app_dir {
        candidates.push(dir.join("models"));
        candidates.push(dir.join("resources").join("models"));
    }
    // 编译期就确定的源码目录：开发机器上一定存在，是最稳的一条。
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("models"));
    candidates.push(PathBuf::from("models"));

    candidates
        .iter()
        .find(|dir| REQUIRED.iter().all(|name| dir.join(name).is_file()))
        .cloned()
        .unwrap_or_else(|| {
            candidates
                .last()
                .cloned()
                .unwrap_or_else(|| PathBuf::from("models"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

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
