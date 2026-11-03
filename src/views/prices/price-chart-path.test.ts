import { describe, expect, it } from 'vitest';
import { buildPriceChart, buildSparkline } from './price-chart-path';

/**
 * 图表几何：入参进、路径出。
 *
 * 断言的重点是**路径里不能出现 `NaN`**——SVG 对 `M NaN NaN` 是静默不画，
 * 不报错、也不留痕，表现只是「这张图怎么什么都没有」。全等值（跨度 0）、
 * 只有一个点、容器还没量到（宽度 0）是三条最容易除零的入口。
 */

const BAD_NUMBER = /NaN|Infinity|undefined/;

/** 从 `d` 里取出每一段的 y，用来验屏幕坐标的方向。 */
function ysOf(path: string): number[] {
    return [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]));
}

describe('buildSparkline：卡片上那根 56×14 的线', () => {
    it('少于两个点就不画——一个点谈不上走势', () => {
        expect(buildSparkline([], 56, 14)).toBe('');
        expect(buildSparkline([3200000], 56, 14)).toBe('');
    });

    it('两个点：首尾落在留白里，涨的画在上面（屏幕坐标是反的）', () => {
        // pad 1.5：x 从 1.5 到 54.5；y 从上沿 1.5 到下沿 12.5。10 → 20 是涨，所以 y 变小。
        expect(buildSparkline([10, 20], 56, 14)).toBe('M1.5 12.5 L54.5 1.5');
    });

    it('价格一直没变时画在中线上，不贴底也不除零', () => {
        const path = buildSparkline([10000, 10000, 10000], 56, 14);
        expect(path).not.toMatch(BAD_NUMBER);
        // 三个点同一个 y = 高的一半。
        expect(ysOf(path)).toEqual([7, 7, 7]);
    });

    it('单调递增时 y 单调递减（屏幕坐标 y 向下长）', () => {
        const ys = ysOf(buildSparkline([1, 2, 3, 4], 56, 14));
        expect(ys).toHaveLength(4);
        expect(ys).toEqual([...ys].sort((a, b) => b - a));
        expect(new Set(ys).size).toBe(4);
    });

    it('输出里不会出现 NaN / Infinity / undefined', () => {
        const cases = [
            [0, 0],
            [1, 1.0001],
            [1e12, 1e12 + 1],
            [3200000, 8600000],
            [5, 5, 4, 5],
        ];
        for (const values of cases) {
            expect(buildSparkline(values, 56, 14)).not.toMatch(BAD_NUMBER);
        }
    });
});

describe('buildPriceChart：历史窗那张大图', () => {
    const at = (date: string, price: number) => ({ date, price });

    it('没有点时不画空框，交给面板抬头说「还没记过」', () => {
        const chart = buildPriceChart({ width: 600, height: 180, points: [] });
        expect(chart.empty).toBe(true);
        expect(chart.line).toBe('');
        expect(chart.dots).toEqual([]);
        expect(chart.ticks).toEqual([]);
    });

    it('只有一个点也画一条横线——「记过一次」这件事要看得见', () => {
        const chart = buildPriceChart({
            width: 600,
            height: 180,
            points: [at('2026-11-03', 10000)],
        });
        expect(chart.empty).toBe(false);
        expect(chart.line).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
        expect(chart.line).not.toMatch(BAD_NUMBER);
        expect(chart.dots).toHaveLength(1);
    });

    it('全是一个价：只画一条参考线，线落在绘图区中间而不是贴底', () => {
        const chart = buildPriceChart({
            width: 600,
            height: 180,
            points: [at('2026-11-01', 10000), at('2026-11-02', 10000)],
        });
        expect(chart.guides).toHaveLength(1);
        expect(chart.line).not.toMatch(BAD_NUMBER);
        const ys = ysOf(chart.line);
        expect(new Set(ys).size).toBe(1);
        expect(ys[0]).toBeGreaterThan(chart.plot.top);
        expect(ys[0]).toBeLessThan(chart.plot.top + chart.plot.height);
    });

    it('横轴刻度只写 MM-DD，首末这两天一定在', () => {
        const chart = buildPriceChart({
            width: 600,
            height: 180,
            points: [at('2026-11-01', 10000), at('2026-11-02', 12000), at('2026-11-03', 9000)],
        });
        expect(chart.ticks.length).toBeGreaterThan(0);
        expect(chart.ticks.every((tick) => /^\d{2}-\d{2}$/.test(tick.text))).toBe(true);
        const texts = chart.ticks.map((tick) => tick.text);
        expect(texts).toContain('11-01');
        expect(texts).toContain('11-03');
    });

    it('容器还没量到（宽度 0）时把尺寸抬到下限，viewBox 与裁切用同一个数', () => {
        const chart = buildPriceChart({
            width: 0,
            height: 0,
            points: [at('2026-11-03', 10000)],
        });
        expect(chart.width).toBe(160);
        expect(chart.height).toBe(100);
        expect(chart.line).not.toMatch(BAD_NUMBER);
    });

    it('纵轴读数跟着单位口径走：满万折万，不再出现「亿」', () => {
        const chart = buildPriceChart({
            width: 600,
            height: 180,
            points: [at('2026-11-01', 3200000), at('2026-11-02', 8600000)],
        });
        expect(chart.guides.map((guide) => guide.label)).toEqual(['860 万', '590 万', '320 万']);
    });
});
