import { describe, expect, it } from 'vitest';
import type { OcrLine } from './attr-panel';
import { gearBaseFrame, gearTextPixels } from './gear-image';

describe('半透明装备浮片文字提取', () => {
    it('保留黄、绿、蓝、粉和白字，去掉棕色背包底、暗灰说明与透明像素', () => {
        const colors = [
            [255, 255, 0, 255],
            [0, 255, 0, 255],
            [0, 190, 255, 255],
            [255, 180, 255, 255],
            [240, 240, 240, 255],
            [0, 145, 175, 255],
            [145, 115, 55, 255],
            [100, 100, 100, 255],
            [255, 255, 255, 0],
        ];
        const output = gearTextPixels({
            width: colors.length,
            height: 1,
            data: new Uint8ClampedArray(colors.flat()),
        });
        expect([...output].filter((_, i) => i % 4 === 0)).toEqual([
            0, 0, 0, 0, 11, 56, 255, 255, 255,
        ]);
        expect([...output].filter((_, i) => i % 4 === 3)).toEqual(Array(colors.length).fill(255));
    });
});

describe('装备基础行局部原图', () => {
    const level: OcrLine = {
        text: '等级150五行水',
        x: 40,
        y: 60,
        width: 160,
        height: 12,
        score: 0.98,
    };
    const durability = { ...level, text: '耐久度59', y: 100, width: 90 };
    const shot = () => ({
        width: 240,
        height: 180,
        data: new Uint8ClampedArray(240 * 180 * 4),
        colorSpace: 'srgb' as const,
    });

    it.each([1, 2])('裁掉等级前和耐久后的内容，坐标与原始色值不变（%s 倍）', (scale) => {
        const image = {
            ...shot(),
            width: 240 * scale,
            height: 180 * scale,
            data: new Uint8ClampedArray(240 * scale * 180 * scale * 4),
        };
        image.data.set([11, 22, 33, 255], (80 * scale * image.width + 50 * scale) * 4);
        const anchors = [level, durability].map((line) => ({
            ...line,
            x: line.x * scale,
            y: line.y * scale,
            width: line.width * scale,
            height: line.height * scale,
        }));
        const frame = gearBaseFrame(image, anchors)!;
        expect(frame.width * frame.height).toBeLessThan((image.width * image.height) / 3);
        const pixels = Uint8Array.from(atob(frame.pixels), (char) => char.charCodeAt(0));
        const at = ((80 * scale - frame.y) * frame.width + 50 * scale - frame.x) * 4;
        expect([...pixels.subarray(at, at + 4)]).toEqual([33, 22, 11, 255]);
        expect([...pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
        expect(pixels).toHaveLength(frame.width * frame.height * 4);
    });

    it('缺锚点、锚点逆序、不同列或区域越界时不裁图', () => {
        for (const anchors of [
            [],
            [level],
            [durability],
            [{ ...level, y: 110 }, durability],
            [{ ...level, x: 100 }, durability],
            [level, { ...durability, x: 300 }],
            [
                { ...level, y: 180 },
                { ...durability, y: 200 },
            ],
        ])
            expect(gearBaseFrame(shot(), anchors)).toBeNull();
    });

    it('贴近图像边缘时裁剪范围仍合法，留白偏移可以为负数', () => {
        const frame = gearBaseFrame(shot(), [
            { ...level, x: 0, y: 0 },
            { ...durability, x: 0, y: 30 },
        ])!;
        expect(frame.x).toBeLessThan(0);
        expect(frame.y).toBeLessThan(0);
        expect(atob(frame.pixels).length).toBe(frame.width * frame.height * 4);
    });
});
