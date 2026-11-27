import { base64Of, swapToBgra, type Frame } from './pixels';
import type { OcrLine } from './attr-panel';

/** 游戏浮片半透明，先保留亮色文字，避免背包图案与灰色套装说明混进属性行。 */
export function gearTextPixels(image: Pick<ImageData, 'data' | 'width' | 'height'>): Uint8Array {
    const pixels = new Uint8Array(image.data.length);
    for (let i = 0; i < pixels.length; i += 4) {
        const r = image.data[i];
        const g = image.data[i + 1];
        const b = image.data[i + 2];
        const high = Math.max(r, g, b);
        const white = Math.min(r, g, b) >= 145;
        const colored =
            high >= 150 &&
            high - Math.min(r, g, b) >= 80 &&
            (g > r * 1.3 || (r >= 140 && g >= 140) || (b >= 140 && (r >= 140 || g >= 110)));
        // 保留抗锯齿灰阶；直接二值化会切断小字号蓝色套装字和「防御」的笔画。
        const shade =
            image.data[i + 3] > 0 && (white || colored) ? Math.round((255 - high) * 0.7) : 255;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = shade;
        pixels[i + 3] = 255;
    }
    return pixels;
}

export function gearFrame(image: ImageData): Frame {
    return {
        pixels: base64Of(gearTextPixels(image)),
        width: image.width,
        height: image.height,
    };
}

/** 预处理会误读「袭」或百分号；按实图形近字定位原色行，补读仍须认出完整属性。 */
export function gearAmbushFrame(image: ImageData, lines: readonly OcrLine[]): Frame | null {
    const row = lines.find((line) => /^奇[袭装蓉]法术/.test(line.text.replace(/\s/g, '')));
    if (!row) return null;
    const margin = Math.max(2, Math.round(row.height * 0.1));
    const left = Math.max(0, Math.floor(row.x - margin));
    const top = Math.max(0, Math.floor(row.y - margin));
    const bottom = Math.min(image.height, Math.ceil(row.y + row.height * 1.3));
    const width = image.width - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return null;
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return null;
    const sourcePixels = sourceContext.createImageData(image.width, image.height);
    sourcePixels.data.set(image.data);
    sourceContext.putImageData(sourcePixels, 0, 0);
    const canvas = document.createElement('canvas');
    // 留白让小行保持稳定的检测尺度；浏览器插值避免引擎整数倍复制放大百分号锯齿。
    canvas.width = Math.max(700, width * 2 + 40);
    canvas.height = height * 2 + 40;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, left, top, width, height, 20, 20, width * 2, height * 2);
    return {
        pixels: base64Of(swapToBgra(context.getImageData(0, 0, canvas.width, canvas.height).data)),
        width: canvas.width,
        height: canvas.height,
    };
}

/** 等级与耐久同列时只补读中间的原色基础行，边缘留白并记录回到原图的偏移。 */
export function gearBaseFrame(
    image: ImageData,
    lines: readonly OcrLine[],
): (Frame & { x: number; y: number }) | null {
    const durability = lines.find((line) => /^耐久/.test(line.text.replace(/\s/g, '')));
    if (!durability) return null;
    let level: OcrLine | undefined;
    for (const line of lines) {
        if (
            /^等级/.test(line.text.replace(/\s/g, '')) &&
            line.y < durability.y &&
            Math.abs(line.x - durability.x) <= durability.height &&
            (!level || line.y > level.y)
        )
            level = line;
    }
    if (!level) return null;
    const left = Math.max(0, Math.floor(durability.x - durability.height / 2));
    const top = Math.max(0, Math.ceil(level.y + level.height / 2));
    const bottom = Math.min(image.height, Math.floor(durability.y));
    const width = image.width - left;
    const height = bottom - top;
    if (width <= 0 || height < durability.height / 2) return null;
    const padding = Math.max(8, Math.ceil(durability.height / 2));
    const frameWidth = width + padding * 2;
    const frameHeight = height + padding * 2;
    const pixels = new Uint8Array(frameWidth * frameHeight * 4).fill(255);
    for (let y = 0; y < height; y++) {
        const source = ((top + y) * image.width + left) * 4;
        const target = ((padding + y) * frameWidth + padding) * 4;
        pixels.set(image.data.subarray(source, source + width * 4), target);
    }
    return {
        pixels: base64Of(swapToBgra(pixels)),
        width: frameWidth,
        height: frameHeight,
        x: left - padding,
        y: top - padding,
    };
}
