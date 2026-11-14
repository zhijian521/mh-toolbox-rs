import { describe, expect, it } from 'vitest';
import { buildSparkBars } from './price-chart-path';

describe('物价迷你柱图', () => {
    it('不足两条不展示走势', () => {
        expect(buildSparkBars([], 56, 14)).toEqual([]);
        expect(buildSparkBars([10000], 56, 14)).toEqual([]);
    });
    it('价格从零起量，翻倍的价格对应翻倍的柱高', () => {
        const bars = buildSparkBars([10, 20], 56, 14);
        expect(bars[1].height).toBe(bars[0].height * 2);
        expect(bars[0].y + bars[0].height).toBe(bars[1].y + bars[1].height);
    });
    it('同价等高且零值不画假柱', () => {
        const bars = buildSparkBars([0, 100, 100], 56, 14);
        expect(bars[0].height).toBe(0);
        expect(bars[1].height).toBe(bars[2].height);
        expect(buildSparkBars([0, 0], 56, 14).every((one) => one.height === 0)).toBe(true);
    });
    it('每条记录独立占位，极大和接近的价格都留在图内', () => {
        const bars = buildSparkBars([1e12, 1e12 + 1, 1], 56, 14);
        expect(bars).toHaveLength(3);
        for (const bar of bars) {
            expect(Object.values(bar).every(Number.isFinite)).toBe(true);
            expect(bar.x).toBeGreaterThanOrEqual(0);
            expect(bar.x + bar.width).toBeLessThanOrEqual(56);
            expect(bar.y).toBeGreaterThanOrEqual(0);
            expect(bar.y + bar.height).toBeLessThanOrEqual(14);
        }
    });
});
