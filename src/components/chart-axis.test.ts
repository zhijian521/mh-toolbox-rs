import { describe, expect, it } from 'vitest';
import { integerAxis } from './chart-axis';

describe('图表整数刻度', () => {
    it('小数金额向外取整，不改变原始数值', () => {
        const values = [12.5, 25];
        expect(integerAxis(values).ticks).toEqual([30, 20, 10, 0]);
        expect(values).toEqual([12.5, 25]);
    });

    it('按万取整数，不足一万也保留零与一万刻度', () => {
        expect(integerAxis([123, 9900], 10000).ticks).toEqual([20000, 10000, 0]);
        expect(integerAxis([123], 10000).ticks).toEqual([10000, 0]);
    });

    it.each([{ values: [] }, { values: [0, 0] }, { values: [NaN, Infinity, -Infinity] }])(
        '空值或全零仍给出有效范围：$values',
        ({ values }) => {
            expect(integerAxis(values)).toEqual({ min: 0, max: 1, step: 1, ticks: [1, 0] });
        },
    );

    it.each([{ values: [-35, -10] }, { values: [-125, 260] }, { values: [0.01, 99999] }])(
        '包含零和所有数据并保持整数等距：$values',
        ({ values }) => {
            const axis = integerAxis(values);
            expect(axis.min).toBeLessThanOrEqual(Math.min(0, ...values));
            expect(axis.max).toBeGreaterThanOrEqual(Math.max(0, ...values));
            expect(axis.ticks).toContain(0);
            expect(axis.ticks.every(Number.isInteger)).toBe(true);
            expect(
                axis.ticks.slice(1).every((tick, index) => axis.ticks[index] - tick === axis.step),
            ).toBe(true);
            expect(axis.ticks.length).toBeLessThanOrEqual(6);
        },
    );

    it('小时轴以整小时递增，忽略非有限值', () => {
        const axis = integerAxis([NaN, 90, 210, Infinity], 60);
        expect(axis.ticks.map((value) => value / 60)).toEqual([4, 2, 0]);
    });
});
