import type { GearSlotName } from '../gear';
import type { OcrLine } from './attr-panel';

/** 「魄」会漏读或识别成「魂 / 朗」；必须同时命中完整前缀与阴阳，不能只按属性猜部位。 */
export const JADE_TITLE_PATTERN = /上古玉[魄魂朗]?[·・.。:：]?([阴阳])/;

/** 同一行的两个标题可能共用 OCR 框；按标题文字位置估计列界，再裁原图分别识别。 */
export function jadePanels(lines: readonly OcrLine[], image: ImageData) {
    const titles = lines
        .flatMap((line) => {
            const text = line.text.normalize('NFKC').replace(/\s/g, '');
            const matches = text.matchAll(new RegExp(JADE_TITLE_PATTERN.source, 'g'));
            return [...matches].map((match) => ({
                slot: `玉魄·${match[1]}` as GearSlotName,
                x: line.x + (line.width * match.index) / text.length,
                y: line.y,
                height: line.height,
            }));
        })
        .sort((a, b) => a.x - b.x);
    const left = titles[0];
    const right = titles.find(
        (one) =>
            left &&
            one.slot !== left.slot &&
            one.x > left.x &&
            Math.abs(one.y - left.y) <= Math.max(one.height, left.height),
    );
    if (!left || !right) return [];
    const top = Math.max(
        0,
        Math.floor(Math.min(left.y, right.y) - Math.max(left.height, right.height) / 2),
    );
    const split = Math.floor(right.x - right.height / 2);
    const start = Math.max(0, Math.floor(left.x - left.height / 2));
    if (split <= start || split >= image.width || top >= image.height) return [];
    return [
        { slot: left.slot, x: start, end: split },
        { slot: right.slot, x: split, end: image.width },
    ].map(({ slot, x, end }) => {
        const width = end - x;
        const height = image.height - top;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const offset = ((top + y) * image.width + x) * 4;
            data.set(image.data.subarray(offset, offset + width * 4), y * width * 4);
        }
        return { slot, image: { data, width, height, colorSpace: image.colorSpace } as ImageData };
    });
}
