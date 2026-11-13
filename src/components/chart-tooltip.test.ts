import { describe, expect, it } from 'vitest';
import { chartTooltipPosition } from './chart-tooltip';

describe('图表浮卡定位', () => {
    const size = { width: 120, height: 60 };
    const bounds = { width: 500, height: 300 };

    it('空间充足时跟随鼠标位移并留出间隙', () => {
        const first = chartTooltipPosition({ x: 100, y: 80 }, size, bounds);
        const next = chartTooltipPosition({ x: 130, y: 100 }, size, bounds);
        expect(next.left - first.left).toBe(30);
        expect(next.top - first.top).toBe(20);
        expect(first.left).toBeGreaterThan(100);
        expect(first.top).toBeGreaterThan(80);
    });

    it('右下边缘自动翻到指针左上方', () => {
        const point = { x: 490, y: 290 };
        const pos = chartTooltipPosition(point, size, bounds);
        expect(pos.left + size.width).toBeLessThan(point.x);
        expect(pos.top + size.height).toBeLessThan(point.y);
        expect(pos.left).toBeGreaterThanOrEqual(8);
        expect(pos.top).toBeGreaterThanOrEqual(8);
    });

    it('靠边或浮卡占满可用空间时仍留在底板内', () => {
        const pos = chartTooltipPosition(
            { x: 100, y: 30 },
            { width: 284, height: 164 },
            { width: 300, height: 180 },
        );
        expect(pos).toEqual({ left: 8, top: 8 });
        expect(chartTooltipPosition({ x: -30, y: -30 }, size, bounds)).toEqual({ left: 8, top: 8 });
    });
});
