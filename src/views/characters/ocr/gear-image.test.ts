import { describe, expect, it } from 'vitest';
import { gearTextPixels } from './gear-image';

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
