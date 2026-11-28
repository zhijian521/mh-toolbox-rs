//! 横排聊天只需检测和识字。会话与行图缓存跟随一次监听，停止即释放。
use std::collections::VecDeque;
use std::path::Path;

use image::RgbImage;
use ort::execution_providers::directml::DirectMLExecutionProvider;
use ort::session::builder::{GraphOptimizationLevel, SessionBuilder};
use paddle_ocr_rs::{
    base_net::BaseNet, crnn_net::CrnnNet, db_net::DbNet, ocr_result::TextLine as Recognized,
    ocr_utils::OcrUtils, scale_param::ScaleParam,
};

use super::{prepared_dict, text_line, upscale_rgb, TextLine, DET, MODELS_DIR, REC};

const SCALE: u32 = 2;
const PADDING: u32 = 24;
const CACHE_BYTES: usize = 12 * 1024 * 1024;

fn cpu_session(builder: SessionBuilder) -> ort::Result<SessionBuilder> {
    builder
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(4)?
        .with_inter_threads(1)
}

fn gpu_session(builder: SessionBuilder) -> ort::Result<SessionBuilder> {
    cpu_session(builder)?
        .with_memory_pattern(false)?
        .with_parallel_execution(false)?
        .with_execution_providers([DirectMLExecutionProvider::default()
            .build()
            .error_on_failure()])
}

fn detector(dir: &Path, gpu: bool) -> Result<DbNet, String> {
    let mut net = DbNet::new();
    net.init_model(
        &dir.join(DET).to_string_lossy(),
        4,
        Some(if gpu { gpu_session } else { cpu_session }),
    )
    .map_err(|err| format!("聊天文字检测模型加载失败：{err}"))?;
    Ok(net)
}

#[derive(Default)]
struct LineCache {
    entries: VecDeque<(RgbImage, Recognized)>,
    bytes: usize,
}

impl LineCache {
    fn get(&self, image: &RgbImage) -> Option<&Recognized> {
        self.entries.iter().rev().find_map(|(cached, result)| {
            (cached.dimensions() == image.dimensions() && cached.as_raw() == image.as_raw())
                .then_some(result)
        })
    }

    fn insert(&mut self, image: RgbImage, result: Recognized) {
        if image.len() > CACHE_BYTES {
            return;
        }
        while self.bytes + image.len() > CACHE_BYTES || self.entries.len() >= 128 {
            if let Some((old, _)) = self.entries.pop_front() {
                self.bytes -= old.len();
            }
        }
        self.bytes += image.len();
        self.entries.push_back((image, result));
    }
}

pub struct ChatOcr {
    det: DbNet,
    gpu: bool,
    rec: CrnnNet,
    cache: LineCache,
}

impl ChatOcr {
    pub fn new() -> Result<Self, String> {
        let dir = MODELS_DIR.get().ok_or("OCR 模型目录未初始化")?;
        let dict = prepared_dict(dir)?;
        let mut rec = CrnnNet::new();
        rec.init_model_dict_file(
            &dir.join(REC).to_string_lossy(),
            4,
            Some(cpu_session),
            &dict.0.to_string_lossy(),
        )
        .map_err(|err| format!("聊天文字识别模型加载失败：{err}"))?;
        let (det, gpu) = match detector(dir, true) {
            Ok(net) => (net, true),
            Err(_) => (detector(dir, false)?, false),
        };
        Ok(Self {
            det,
            gpu,
            rec,
            cache: LineCache::default(),
        })
    }

    pub fn recognize(
        &mut self,
        bgra: &[u8],
        width: u32,
        height: u32,
    ) -> Result<Vec<TextLine>, String> {
        if bgra.len() != width as usize * height as usize * 4 || width == 0 || height == 0 {
            return Err("聊天位图尺寸无效".into());
        }
        let (rgb, w, h) = upscale_rgb(bgra, width, height, SCALE);
        let padded = OcrUtils::make_padding(&rgb, PADDING).map_err(|err| err.to_string())?;
        let scale = ScaleParam::get_scale_param(&padded, w.max(h) + 2 * PADDING);
        let detect = |net: &mut DbNet| net.get_text_boxes(&padded, &scale, 0.5, 0.3, 1.6);
        let boxes = match detect(&mut self.det) {
            Err(_) if self.gpu => {
                // 驱动也可能在首次推理或运行中失败。同一帧改用 CPU 重读。
                self.det = detector(MODELS_DIR.get().ok_or("OCR 模型目录未初始化")?, false)?;
                self.gpu = false;
                detect(&mut self.det)
            }
            result => result,
        }
        .map_err(|err| format!("聊天文字检测失败：{err}"))?;
        let crops = OcrUtils::get_part_images(&padded, &boxes);
        let mut lines = Vec::with_capacity(boxes.len());
        for (area, crop) in boxes.iter().zip(crops) {
            let line = if let Some(hit) = self.cache.get(&crop) {
                text_line(&area.points, &hit.text, hit.text_score, SCALE, PADDING)
            } else {
                let result = self
                    .rec
                    .get_text_lines(std::slice::from_ref(&crop), &Default::default(), 0.)
                    .map_err(|err| format!("聊天文字识别失败：{err}"))?
                    .pop()
                    .ok_or("聊天文字行识别结果缺失")?;
                let line = text_line(
                    &area.points,
                    &result.text,
                    result.text_score,
                    SCALE,
                    PADDING,
                );
                self.cache.insert(crop, result);
                line
            };
            lines.extend(line);
        }
        lines.sort_by_key(|line| (line.y, line.x));
        Ok(lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_requires_identical_pixels_and_shape() {
        let mut cache = LineCache::default();
        let mut image = RgbImage::new(8, 2);
        cache.insert(
            image.clone(),
            Recognized {
                text: "系统".into(),
                text_score: 1.0,
            },
        );
        assert_eq!(cache.get(&image).unwrap().text, "系统");
        assert!(cache.get(&RgbImage::new(2, 8)).is_none());
        image.as_mut()[0] = 1;
        assert!(cache.get(&image).is_none());
    }
}
