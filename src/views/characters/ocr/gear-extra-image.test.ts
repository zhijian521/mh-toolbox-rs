import { describe, expect, it } from 'vitest';
import type { OcrLine } from './attr-panel';
import { gearExtraFrame, gearExtraRegions, restoreGearExtras } from './gear-extra-image';

const box = (text: string, y: number): OcrLine => ({
    text,
    x: 30,
    y,
    width: 100,
    height: 10,
    score: 0.98,
});
function sample(scale = 1) {
    const width = 240 * scale;
    const height = 120 * scale;
    const data = new Uint8ClampedArray(width * height * 4);
    const paint = (x: number, y: number, w: number, h: number, color: number[]) => {
        for (let yy = y * scale; yy < (y + h) * scale; yy++)
            for (let xx = x * scale; xx < (x + w) * scale; xx++)
                data.set(color, (yy * width + xx) * 4);
    };
    paint(0, 0, 240, 120, [60, 50, 40, 255]);
    paint(30, 40, 60, 12, [0, 255, 0, 255]);
    paint(30, 53, 60, 12, [0, 255, 0, 255]);
    paint(95, 42, 30, 8, [240, 170, 255, 255]);
    paint(0, 35, 15, 40, [0, 255, 0, 255]);
    paint(180, 35, 20, 40, [0, 255, 0, 255]);
    paint(30, 85, 60, 12, [0, 255, 0, 255]);
    const lines = [box('耐久度100', 5), box('精炼等级6', 20), box('特效：固若金汤(1级)', 70)];
    return {
        image: { data, width, height },
        lines: lines.map((line) => ({
            ...line,
            x: line.x * scale,
            y: line.y * scale,
            width: line.width * scale,
            height: line.height * scale,
        })),
    };
}

describe('灵饰附加行补读图像', () => {
    it.each([1, 2])('按实际绿字切行，窄空隙、同比缩放与同名行都不合并（%s 倍）', (scale) => {
        const { image, lines } = sample(scale);
        const regions = gearExtraRegions(image, lines);
        expect(regions).toHaveLength(2);
        expect(regions.map(({ source }) => source.y)).toEqual([39 * scale, 52 * scale]);
        expect(regions.every(({ source }) => source.x > 15 * scale)).toBe(true);
        expect(regions.every(({ source }) => source.x + source.width < 180 * scale)).toBe(true);
        expect(regions.every(({ source }) => source.y + source.height < 70 * scale)).toBe(true);
    });

    it('补读图保留原图字色与粉色括号，行间留白，输出通道为 BGRA', () => {
        const { image, lines } = sample();
        const regions = gearExtraRegions(image, lines);
        const frame = gearExtraFrame(image, regions);
        const pixels = Uint8Array.from(atob(frame.pixels), (char) => char.charCodeAt(0));
        const { source, target } = regions[0];
        const at = (x: number, y: number) => {
            const index = ((target.y + y - source.y) * frame.width + target.x + x - source.x) * 4;
            return [...pixels.subarray(index, index + 4)];
        };
        expect(pixels).toHaveLength(frame.width * frame.height * 4);
        expect(at(31, 41)).toEqual([0, 255, 0, 255]);
        expect(at(96, 43)).toEqual([255, 170, 240, 255]);
        expect([...pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    });

    it('分框标签和值回到各自行，已知气血形近字仅在补读中纠正', () => {
        const { image, lines } = sample();
        const regions = gearExtraRegions(image, lines);
        const raw = regions.flatMap(({ target }, index) => [
            { ...box(index ? '气面' : '气血', target.y), x: target.x, width: 30 },
            { ...box(index ? '+45' : '+53[+168]', target.y + 1), x: target.x + 35, width: 60 },
        ]);
        raw.push({ ...box('防御+999', 0), x: 0, height: 2 });
        const restored = restoreGearExtras(raw, regions);
        expect(restored.map((line) => line.text)).toEqual(['气血', '+53[+168]', '气血', '+45']);
        expect(restored.map((line) => line.y)).toEqual([39, 39, 52, 52]);
        expect(restored[0].height).toBe(regions[0].source.height);
    });

    it('没有耐久 / 强化锚点或绿字时不猜测附加行', () => {
        const { image } = sample();
        expect(gearExtraRegions(image, [])).toEqual([]);
        expect(
            gearExtraRegions({ ...image, data: new Uint8ClampedArray(image.data.length) }, [
                box('灵尘等级2', 20),
            ]),
        ).toEqual([]);
    });
});
