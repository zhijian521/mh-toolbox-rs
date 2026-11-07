/**
 * 把一张图变成「BGRA 裸像素 + base64」——送进 OCR 之前的最后一站。
 *
 * ---- 为什么在 WebView 里解码 ----
 * 剪贴板里拿到的可能是 PNG、JPEG、WebP，甚至是别的程序给的位图。`createImageBitmap`
 * 与 canvas 把「这些格式」统一成像素，Rust 侧就只需要认一种输入（`ocr_image.rs` 的
 * `pixels`）。反过来让 Rust 解码，就得给 `image` crate 开编码器特性，还要多一条
 * 「这张图坏了」的错误分支——那条路更贵，也更难测。
 *
 * ---- 为什么是 BGRA ----
 * 与 `screen.rs` 的 BitBlt 输出、`ocr_paddle::recognize` 吃的格式一致。
 * `getImageData` 给的是 RGBA，所以这里要换一次通道顺序；**不能反**，R 与 B 互换之后
 * 蓝色字与红色字的识别结果会一起变差，而画面上看着「图是对的」，极难查。
 */

/** 一张待识别的图。 */
export interface Frame {
    /** BGRA 裸像素的 base64，长度必然是 `width × height × 4`。 */
    pixels: string;
    width: number;
    height: number;
}

/**
 * 送进 IPC 之前把长边压到这个数以内。
 *
 * IPC 传的是 JSON 字符串，一张 2560 × 1440 的截图裸像素 14.7MB、base64 之后近 20MB——
 * 那不是「慢一点」，是会明显卡一下内存。2000 与 Rust 侧 `TARGET_LONG_SIDE` 同值，
 * 于是常见尺寸（400 × 600 的游戏面板）**一格都不缩**，只有整屏截图才会被等比压下来。
 *
 * 代价写在这里：压过之后字会变小，识别率下降。真遇到「整屏截图认不出来」，
 * 正确的做法是先裁到面板那一块，而不是把这个数调大。
 */
const MAX_SIDE = 2000;

/**
 * RGBA → BGRA。
 *
 * 拆成独立函数是为了能测：这一步错了不会报任何错，只是识别率莫名其妙地差。
 */
export function swapToBgra(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
    const out = new Uint8Array(rgba.length);
    for (let index = 0; index + 3 < rgba.length; index += 4) {
        out[index] = rgba[index + 2];
        out[index + 1] = rgba[index + 1];
        out[index + 2] = rgba[index];
        out[index + 3] = rgba[index + 3];
    }
    return out;
}

/**
 * 字节转 base64。
 *
 * 分块拼字符串：`String.fromCharCode(...bytes)` 在 90 万个参数上会直接爆栈，
 * 而 400 × 600 的图正好是这个量级——一次都不许省。
 */
export function base64Of(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
    }
    return btoa(binary);
}

/** 按 `MAX_SIDE` 算出画到画布上的尺寸（只缩不放）。 */
export function fitSize(width: number, height: number): { width: number; height: number } {
    const long = Math.max(width, height);
    if (long <= MAX_SIDE) return { width, height };
    const ratio = MAX_SIDE / long;
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
    };
}

/**
 * 把位图画进画布，返回这块画布的上下文与尺寸。
 *
 * 抽出来是因为现在有**两个**消费者：`frameOf` 要 base64 送去 OCR，`imageDataOf` 要
 * 原始像素给图标比对。两边必须是**同一张图、同一个尺寸**——尺寸不一致时，图标框的
 * 坐标就与 OCR 的坐标不在一个空间里，配对会静默错位（数字配到隔壁图标上）。
 */
function drawTo(image: ImageBitmap | HTMLImageElement) {
    const natural = {
        width: 'naturalWidth' in image ? image.naturalWidth : image.width,
        height: 'naturalHeight' in image ? image.naturalHeight : image.height,
    };
    const size = fitSize(natural.width, natural.height);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    /* `willReadFrequently`：这块画布只画一次、读一次，但缺了它浏览器会把画布放到 GPU 上，
     * 再 `getImageData` 时要同步拷回来，这一下比识别本身还慢。 */
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('画不出画布，取不到像素');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    return { context, ...size };
}

/** 把一张已经解码好的位图画进画布，取像素、换通道、编 base64。 */
export function frameOf(image: ImageBitmap | HTMLImageElement): Frame {
    const { context, width, height } = drawTo(image);
    const rgba = context.getImageData(0, 0, width, height).data;
    return { pixels: base64Of(swapToBgra(rgba)), width, height };
}

/**
 * 同一张画布上的原始像素（RGBA），给图标比对用。
 *
 * 与 `frameOf` 走同一个 `drawTo`，所以两者的坐标是**同一个空间**。
 * 不在这上面换通道：比对只吃灰度，通道顺序无所谓，转一次反而多一次全图遍历。
 */
export function imageDataOf(image: ImageBitmap | HTMLImageElement): ImageData {
    const { context, width, height } = drawTo(image);
    return context.getImageData(0, 0, width, height);
}
