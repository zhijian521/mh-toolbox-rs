import { commands, type TextLine } from './bindings';
import { hasDesktop } from './desktop';

/* ---------- 截图识别：把一张图送进 OCR ----------
 * 对应 `src-tauri/src/ocr_image.rs`。**只过像素，不碰数据**：认出来的是哪几行、
 * 怎么变成角色字段，全在前端（`views/characters/ocr/`）——Rust 不认识「气血」这个词，
 * 也就不必为了加一个面板去改一次 Rust 并重打包 16MB 的模型。
 *
 * 两个结局而不是三态：这里没有「用户取消」（图是前端给的）。
 * 失败一律带原话——「缺 OCR 模型」与「这张图太大」在界面上是两种该说清楚的事。
 */
export type OcrOutcome = { status: 'ok'; lines: TextLine[] } | { status: 'failed'; error: string };

/**
 * 识别一张图。
 *
 * `pixels` 是 **BGRA 裸像素的 base64**（`views/characters/ocr/pixels.ts` 把它做出来），
 * `width` / `height` 是原图像素。坐标回来时是原图坐标系，放大倍数 Rust 侧已经除回去。
 */
export async function ocrFrame(pixels: string, width: number, height: number): Promise<OcrOutcome> {
    if (!hasDesktop()) return { status: 'failed', error: '浏览器预览里没有 OCR 引擎' };
    try {
        return { status: 'ok', lines: await commands.ocrFrame(pixels, width, height) };
    } catch (error) {
        return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
}
