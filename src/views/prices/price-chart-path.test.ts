import { describe, expect, it } from 'vitest';
import { sparkLinePoints } from './price-chart-path';

describe('物价迷你折线', () => {
    it('不足两笔时不显示折线', () => {
        expect(sparkLinePoints([], 56, 20)).toBe('');
        expect(sparkLinePoints([10000], 56, 20)).toBe('');
    });

    it('接近的价格仍能看出涨跌，保持记录顺序', () => {
        expect(sparkLinePoints([10001, 10002, 10001], 56, 20)).toBe(
            '2.00,18.00 28.00,2.00 54.00,18.00',
        );
    });

    it('价格持平时显示居中的水平线', () => {
        expect(sparkLinePoints([100, 100], 56, 20)).toBe('2.00,10.00 54.00,10.00');
    });
});
