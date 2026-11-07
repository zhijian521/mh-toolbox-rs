import { describe, expect, it } from 'vitest';
import { correlation, findTiles } from './matcher';

/**
 * 图标比对里**与 DOM 无关**的那一半。
 *
 * `findTiles` / `matchIcons` 都要 `ImageData` 与 canvas，vitest 的 node 环境里没有，
 * 所以它们由烟测覆盖（真窗口、真图）。这里守的是相关系数本身——它算错不会报错，
 * 只会让「哪一格是哪个技能」整体偏掉，而那在界面上看起来只是「认错了」。
 */

const gray = (...values: number[]) => Float32Array.from(values);

describe('相关系数', () => {
    it('同一份灰度是 1', () => {
        const a = gray(10, 40, 90, 160);
        expect(correlation(a, a)).toBeCloseTo(1, 6);
    });

    it('反相是 −1（相关看的是形状，不是亮度）', () => {
        const a = gray(0, 50, 120, 200);
        const b = a.map((value) => 255 - value);
        expect(correlation(a, Float32Array.from(b))).toBeCloseTo(-1, 6);
    });

    it('线性变换不影响（缩放与平移都免疫）', () => {
        const a = gray(0, 50, 120, 200);
        const b = a.map((value) => value * 0.5 + 30);
        expect(correlation(a, Float32Array.from(b))).toBeCloseTo(1, 6);
    });

    it('毫无关系的一对接近 0', () => {
        const a = gray(0, 0, 255, 255);
        const b = gray(0, 255, 0, 255);
        expect(Math.abs(correlation(a, b))).toBeLessThan(0.01);
    });

    it('常数块给 0 而不是 NaN（没有方差就没有相关性）', () => {
        expect(correlation(gray(7, 7, 7, 7), gray(1, 2, 3, 4))).toBe(0);
    });
});

describe('方块检测的形状判据', () => {
    /* 尺寸按图宽筛（3%~20%），与截图分辨率无关——只验两个极端：
     * 太小的一律不理（文字笔画），太大的一律不理（整块面板背景）。 */
    it('全红的一张图找不到「方块」（整屏都是红的，没有边界）', () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 200;
            data[i + 1] = 40;
            data[i + 2] = 30;
            data[i + 3] = 255;
        }
        /* 64 宽的图里，整屏是一个 64×64 的连通块 > 20% 的宽度上限，被尺寸筛掉。 */
        expect(findTiles({ width, height, data } as ImageData)).toEqual([]);
    });

    it('一个方块都没有时返回空（不抛错）', () => {
        const width = 32;
        const height = 32;
        const data = new Uint8ClampedArray(width * height * 4).fill(200);
        expect(findTiles({ width, height, data } as ImageData)).toEqual([]);
    });
});
