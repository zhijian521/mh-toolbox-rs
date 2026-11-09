import type { OcrLine } from './attr-panel';
import type { Tile } from './matcher';
import { base64Of, swapToBgra, type Frame } from './pixels';

type GearImage = Pick<ImageData, 'data' | 'width' | 'height'>;

export interface GearExtraRegion {
    source: Tile;
    target: Tile;
}

function greenPixel(data: GearImage['data'], index: number): boolean {
    const [r, g, b, a] = data.subarray(index, index + 4);
    return a > 0 && g >= 140 && g > r * 1.3 && g > b * 1.2;
}

/** 耐久 / 强化之后、效果说明之前，按绿字的实际空隙切行，不能按属性名去重。 */
export function gearExtraRegions(image: GearImage, lines: readonly OcrLine[]): GearExtraRegion[] {
    const anchors = lines
        .filter((line) => /^(?:耐久度?|精炼等级|灵尘等级)/.test(line.text.replace(/\s/g, '')))
        .sort((a, b) => a.y - b.y);
    const anchor = anchors.at(-1);
    if (!anchor) return [];
    const left = Math.max(0, Math.floor(anchor.x - anchor.height / 2));
    const top = Math.max(0, Math.floor(anchor.y + anchor.height / 2));
    const right = Math.min(
        image.width,
        Math.ceil(
            Math.max(
                anchor.x + anchor.width,
                ...lines
                    .filter(
                        (line) =>
                            line.y >= top && line.x >= left && line.x < anchor.x + anchor.height,
                    )
                    .map((line) => line.x + line.width),
            ) + anchor.height,
        ),
    );
    const end = lines
        .filter(
            (line) =>
                line.y > top &&
                line.x >= left &&
                /^(?:特效|特技|钟灵石|制造者|奇袭|熔炼效果|套装)/.test(line.text.trim()),
        )
        .sort((a, b) => a.y - b.y)[0];
    const bottom = Math.min(image.height, end ? Math.ceil(end.y + end.height / 2) : image.height);
    const bands: { y: number; bottom: number }[] = [];
    const threshold = Math.max(2, Math.round(anchor.height * 0.1));
    for (let y = top; y < bottom; y++) {
        let count = 0;
        for (let x = left; x < right; x++) {
            if (greenPixel(image.data, (y * image.width + x) * 4)) count++;
        }
        if (count < threshold) continue;
        const previous = bands.at(-1);
        if (previous && y === previous.bottom) previous.bottom = y + 1;
        else bands.push({ y, bottom: y + 1 });
    }
    const padding = Math.max(8, Math.round(anchor.height / 2));
    const regions: GearExtraRegion[] = [];
    let nextY = padding;
    for (const band of bands) {
        const height = band.bottom - band.y;
        if (height < anchor.height * 0.4) continue;
        const width = right - left;
        if (width <= 0) continue;
        const margin = Math.max(1, Math.round(anchor.height * 0.1));
        const y = Math.max(top, band.y - margin);
        const paddedHeight = Math.min(bottom, band.bottom + margin) - y;
        regions.push({
            source: { x: left, y, width, height: paddedHeight },
            target: { x: padding, y: nextY, width, height: paddedHeight },
        });
        nextY += paddedHeight + padding * 2;
    }
    return regions;
}

/** 原图每条绿字单独留白，保留抗锯齿与括号，避免变色预处理再次切断「气血」笔画。 */
export function gearExtraFrame(image: GearImage, regions: readonly GearExtraRegion[]): Frame {
    const width = Math.max(...regions.map(({ target }) => target.x * 2 + target.width));
    const height = Math.max(...regions.map(({ target }) => target.y + target.height + target.x));
    const pixels = new Uint8Array(width * height * 4).fill(255);
    for (const { source, target } of regions) {
        for (let y = 0; y < source.height; y++) {
            for (let x = 0; x < source.width; x++) {
                const from = ((source.y + y) * image.width + source.x + x) * 4;
                const to = ((target.y + y) * width + target.x + x) * 4;
                pixels.set(image.data.subarray(from, from + 4), to);
            }
        }
    }
    return { pixels: base64Of(swapToBgra(pixels)), width, height };
}

/** 每条识别框归回唯一的像素行，标签和值分框、相邻行检测框过高都不会串行。 */
export function restoreGearExtras(
    lines: readonly OcrLine[],
    regions: readonly GearExtraRegion[],
): OcrLine[] {
    return lines.flatMap((line) => {
        const cx = line.x + line.width / 2;
        const cy = line.y + line.height / 2;
        const region = regions.find(
            ({ target }) =>
                cx >= target.x &&
                cx < target.x + target.width &&
                cy >= target.y &&
                cy < target.y + target.height,
        );
        if (!region) return [];
        // 仅纠正绿字补读中「气血」的已知形近字，不对说明或未知属性做模糊猜测。
        const text = line.text
            .normalize('NFKC')
            .replace(/\s/g, '')
            .replace(/^气[面孟自](?=$|[+-]\d)/, '气血');
        return [
            {
                ...line,
                text,
                x: line.x + region.source.x - region.target.x,
                y: region.source.y,
                height: region.source.height,
            },
        ];
    });
}
