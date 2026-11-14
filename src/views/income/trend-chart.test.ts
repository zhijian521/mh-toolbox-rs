import { describe, expect, it } from 'vitest';
import {
    buildTrendChart,
    netByDay,
    trendIndexAt,
    trendSeriesOf,
    trendValueText,
} from './trend-chart';
import type { IncomeEntry } from './income';

/**
 * 每日趋势柱图：只测纯函数。
 *
 * 盯的是**「图在骗人」**那一类错——数算错了会报错或在别处露馅，图画歪了没人发现：
 * 下界不含 0 时两条完全不同的走势长得一样；全 0 时画一张贴底的平线像图画砸了；
 * 十四天全标日期会连成一条黑线。
 */

const LABELS = ['2026-11-05', '2026-11-06', '2026-11-07'];

function series(values: number[], id = 'c1') {
    return { id, name: id.toUpperCase(), values };
}

describe('趋势角色与样式', () => {
    const actors = Array.from({ length: 8 }, (_, index) => ({
        id: 'c' + index,
        name: '角色' + index,
    }));

    it('前六个角色在区间内无记录时，仍展示后面的有效角色', () => {
        const source = new Map([
            ['2026-11-07|c7', 60],
            ['2026-10-01|c0', 120],
        ]);
        const series = trendSeriesOf(LABELS, source, actors);
        expect(series.map((one) => one.id)).toEqual(['c7']);
        expect(series[0].values).toEqual([0, 0, 60]);
    });

    it('两张图过滤不同空系列后，同一角色仍用相同颜色与柱面纹理', () => {
        const minutes = trendSeriesOf(LABELS, new Map([['2026-11-07|c7', 60]]), actors);
        const income = trendSeriesOf(
            LABELS,
            new Map([
                ['2026-11-07|c0', 10000],
                ['2026-11-07|c7', -20000],
            ]),
            actors,
        );
        const chart = (series: typeof minutes) =>
            buildTrendChart({
                labels: LABELS,
                series,
                width: 500,
                height: 168,
                kind: 'money',
            });
        const left = chart(minutes).lines.find((one) => one.id === 'c7')!;
        const right = chart(income).lines.find((one) => one.id === 'c7')!;
        expect(left.index).toBe(right.index);
        expect(Math.floor(left.index / 6)).toBe(Math.floor(right.index / 6));
        expect(Math.floor(left.index / 6)).toBeGreaterThan(0);
    });

    it('八个角色都有数据时全部保留', () => {
        const source = new Map(actors.map((actor) => ['2026-11-07|' + actor.id, 1] as const));
        expect(trendSeriesOf(LABELS, source, actors)).toHaveLength(8);
    });
});

describe('趋势图：刻度写法', () => {
    it('时长按小时为主，不到一小时回到分', () => {
        expect(trendValueText(180, 'minutes')).toBe('3 时');
        expect(trendValueText(150, 'minutes')).toBe('2.5 时');
        expect(trendValueText(48, 'minutes')).toBe('48 分');
        expect(trendValueText(0, 'minutes')).toBe('0 分');
    });

    it('钱按万保留两位小数，负值用同一枚减号', () => {
        expect(trendValueText(0, 'money')).toBe('0 万');
        expect(trendValueText(20000, 'money')).toBe('2 万');
        expect(trendValueText(8765, 'money')).toBe('0.88 万');
        /* U+2212 而不是 ASCII 连字符：与 `changeText` 一致，等宽一列不会左右晃。 */
        expect(trendValueText(-20000, 'money')).toBe('−2 万');
    });
});

describe('趋势图：几何', () => {
    it('没有线、没有日期、全是 0 —— 三种空都给 empty', () => {
        const size = { width: 500, height: 168 };
        expect(
            buildTrendChart({ ...size, labels: [], series: [series([1])], kind: 'money' }).empty,
        ).toBe(true);
        expect(buildTrendChart({ ...size, labels: LABELS, series: [], kind: 'money' }).empty).toBe(
            true,
        );
        const zeros = buildTrendChart({
            ...size,
            labels: LABELS,
            series: [series([0, 0, 0])],
            kind: 'money',
        });
        expect(zeros.empty).toBe(true);
    });

    it('长度对不上日期的那组柱直接丢掉（会画歪整张图）', () => {
        const chart = buildTrendChart({
            width: 500,
            height: 168,
            labels: LABELS,
            series: [series([1, 2]), series([3, 4, 5], 'c2')],
            kind: 'money',
        });
        expect(chart.lines.map((one) => one.id)).toEqual(['c2']);
    });

    it('下界含 0：1.9 万 → 2 万那一点涨幅在图上必须显得小', () => {
        /* 若下界取 1.9 万，这条线会从左下角斜到右上角，看起来「翻了一倍」；
         * 而它其实只涨了 5%。下界钉在 0，整条线就压在顶部一小段里。 */
        const chart = buildTrendChart({
            width: 500,
            height: 168,
            labels: LABELS,
            series: [series([19000, 19500, 20000])],
            kind: 'money',
        });
        const top = chart.plot.top;
        const last = chart.lines[0].last.y;
        /* 两个端点的高度差应很小，不因整数上界留白而夸大涨幅。 */
        expect(Math.abs(last - chart.lines[0].points[0].y)).toBeLessThan(chart.plot.height * 0.1);
        expect(last).toBeGreaterThan(top);
    });

    it('负数进得去，且下界低于 0 那一点', () => {
        const chart = buildTrendChart({
            width: 500,
            height: 168,
            labels: LABELS,
            series: [series([5000, -3000, 2000])],
            kind: 'money',
        });
        /* 三个点都在图里（没有 NaN、没有跑到框外）。 */
        expect(
            chart.lines[0].points.every((point) =>
                [
                    point.column.x,
                    point.column.y,
                    point.column.width,
                    point.column.height,
                    point.column.depth,
                ].every(Number.isFinite),
            ),
        ).toBe(true);
        expect(chart.lines[0].last.y).toBeGreaterThan(chart.plot.top);
    });

    it('收益全负时仍保留零刻度，柱体不被负值上界裁掉', () => {
        const chart = buildTrendChart({
            width: 500,
            height: 192,
            labels: LABELS,
            series: [series([-10000, -20000, -15000])],
            kind: 'money',
        });
        const zero = chart.guides.find((guide) => guide.zero);
        expect(zero?.label).toBe('0 万');
        expect(zero!.y).toBeLessThan(chart.lines[0].last.y);
        expect(chart.lines[0].last.y).toBeLessThan(chart.plot.top + chart.plot.height);
    });

    it('正负收益穿过零刻度，两边与末日柱体留在绘图区内', () => {
        const chart = buildTrendChart({
            width: 220,
            height: 192,
            labels: LABELS,
            series: [series([20000, -10000, 5000])],
            kind: 'money',
        });
        const zero = chart.guides.find((guide) => guide.zero)!;
        expect(zero.y).toBeGreaterThan(chart.plot.top);
        expect(zero.y).toBeLessThan(chart.plot.top + chart.plot.height);
        expect(chart.lines[0].last.x).toBeLessThan(chart.width - 3);
        expect(
            chart.lines[0].points.every((point) =>
                [
                    point.column.x,
                    point.column.y,
                    point.column.width,
                    point.column.height,
                    point.column.depth,
                ].every(Number.isFinite),
            ),
        ).toBe(true);
        const tickXs = chart.ticks.map((tick) => tick.x);
        for (let i = 1; i < tickXs.length; i += 1) {
            expect(tickXs[i] - tickXs[i - 1]).toBeGreaterThanOrEqual(56);
        }
    });

    it('一天一条记录也能画出一根柱体', () => {
        const chart = buildTrendChart({
            width: 500,
            height: 168,
            labels: ['2026-11-05'],
            series: [series([300])],
            kind: 'minutes',
        });
        expect(chart.lines[0].points[0].column.width).toBeGreaterThan(0);
        expect(chart.lines[0].points[0].column.height).toBeGreaterThan(0);
        expect(chart.ticks).toHaveLength(1);
        expect(chart.ticks[0].anchor).toBe('middle');
    });

    it('容器还没布局完（宽 0）也给出可用尺寸，viewBox 不会是 0', () => {
        const chart = buildTrendChart({
            width: 0,
            height: 0,
            labels: LABELS,
            series: [series([1, 2, 3])],
            kind: 'money',
        });
        expect(chart.width).toBe(160);
        expect(chart.height).toBe(100);
    });

    it('最后一天必须在横轴刻度里：它是「现在」', () => {
        const chart = buildTrendChart({
            width: 220,
            height: 168,
            labels: [
                '2026-10-29',
                '2026-10-30',
                '2026-10-31',
                '2026-11-01',
                '2026-11-02',
                '2026-11-03',
                '2026-11-04',
                '2026-11-05',
            ],
            series: [series([1, 2, 3, 4, 5, 6, 7, 8])],
            kind: 'minutes',
        });
        const texts = chart.ticks.map((one) => one.text);
        expect(texts).toContain('11-05');
        /* 挤的时候要跳过一批，但最后那个锚点靠右收边。 */
        expect(chart.ticks[chart.ticks.length - 1].anchor).toBe('end');
    });

    it.each([
        { kind: 'money' as const, values: [100, 1250, 9999], unit: '万' },
        { kind: 'minutes' as const, values: [1, 2, 1], unit: '分' },
        { kind: 'minutes' as const, values: [90, 150, 210], unit: '时' },
    ])('小数数据的 $kind 轴使用整数 $unit，点仍保留原值', ({ kind, values, unit }) => {
        const chart = buildTrendChart({
            width: 500,
            height: 168,
            labels: LABELS,
            series: [series(values)],
            kind,
        });
        const labels = chart.guides.map((one) => one.label);
        expect(new Set(labels).size).toBe(labels.length);
        expect(labels.every((label) => new RegExp(`^[−-]?[\\d,]+ ${unit}$`).test(label))).toBe(
            true,
        );
        expect(chart.lines[0].points.map((point) => point.value)).toEqual(values);
    });
});

it('同日多次记价保留独立柱体，横轴日期不重复堆叠', () => {
    const chart = buildTrendChart({
        width: 500,
        height: 180,
        labels: ['2026-11-05', '2026-11-05', '2026-11-05'],
        series: [series([10000, 20000, 15000])],
        kind: 'money',
    });
    expect(chart.lines[0].points).toHaveLength(3);
    expect(new Set(chart.lines[0].points.map((one) => one.column.x)).size).toBe(3);
    expect(chart.ticks.map((one) => one.text)).toEqual(['11-05']);
});

describe('趋势图：每日净额', () => {
    function entry(patch: Partial<IncomeEntry> = {}): IncomeEntry {
        return {
            id: Math.random().toString(36),
            date: '2026-11-05',
            characterId: 'c1',
            kind: 'income',
            amount: 1000,
            item: '梦幻币',
            note: '',
            createdAt: 1,
            ...patch,
        };
    }

    it('收支相抵：同一天同一个人合成一条净额', () => {
        const map = netByDay([entry({ amount: 5000 }), entry({ kind: 'expense', amount: 2000 })]);
        expect(map.get('2026-11-05|c1')).toBe(3000);
    });

    it('按天、按人分开：不同角色不互相抵', () => {
        const map = netByDay([
            entry({ characterId: 'c1', amount: 5000 }),
            entry({ characterId: 'c2', kind: 'expense', amount: 2000 }),
        ]);
        expect(map.get('2026-11-05|c1')).toBe(5000);
        expect(map.get('2026-11-05|c2')).toBe(-2000);
    });

    it('没记过的那天不在表里（调用方补 0），不是 0 值条目', () => {
        const map = netByDay([entry()]);
        expect(map.has('2026-11-06|c1')).toBe(false);
    });
});

describe('趋势图悬停定位', () => {
    const plot = { left: 60, top: 18, width: 240, height: 140 };
    it('按日期槽吸附，并包含左右端点', () => {
        expect(trendIndexAt(plot, 3, 60)).toBe(0);
        expect(trendIndexAt(plot, 3, 139)).toBe(0);
        expect(trendIndexAt(plot, 3, 141)).toBe(1);
        expect(trendIndexAt(plot, 3, 300)).toBe(2);
    });
    it('轴外、空图、无效横坐标不产生明细，单日仍可查看', () => {
        expect(trendIndexAt(plot, 3, 59)).toBeNull();
        expect(trendIndexAt(plot, 3, 301)).toBeNull();
        expect(trendIndexAt(plot, 0, 180)).toBeNull();
        expect(trendIndexAt(plot, 3, NaN)).toBeNull();
        expect(trendIndexAt({ ...plot, width: 0 }, 1, 60)).toBeNull();
        expect(trendIndexAt(plot, 1, 180)).toBe(0);
    });
    it('每个悬停点保留真实金额、日期顺序与对应系列', () => {
        const chart = buildTrendChart({
            width: 500,
            height: 192,
            labels: LABELS,
            series: [series([-20000, 0, 30000]), series([10000, 20000, 5000], 'c2')],
            kind: 'money',
        });
        expect(chart.lines[0].points.map((point) => point.value)).toEqual([-20000, 0, 30000]);
        expect(chart.lines[1].points.map((point) => point.value)).toEqual([10000, 20000, 5000]);
        for (const line of chart.lines) {
            line.points.forEach((point, index) => {
                expect(point.x).toBeCloseTo(
                    chart.plot.left + ((index + 0.5) * chart.plot.width) / 3,
                );
            });
            expect(line.points[2]).toMatchObject(line.last);
        }
        expect(chart.lines[0].points[0].y).toBeGreaterThan(chart.lines[0].points[1].y);
        expect(chart.lines[0].points[1].y).toBeGreaterThan(chart.lines[0].points[2].y);
    });
});
