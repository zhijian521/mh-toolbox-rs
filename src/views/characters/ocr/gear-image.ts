import { base64Of, swapToBgra, type Frame } from './pixels';

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
        pixels: base64Of(swapToBgra(gearTextPixels(image))),
        width: image.width,
        height: image.height,
    };
}
