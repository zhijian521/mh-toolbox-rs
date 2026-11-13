/**
 * 每日趋势折线：入参进、路径出，不碰 Vue、不碰 DOM。
 *
 * 与 `prices/price-chart-path.ts` 同一条分工（组件答「什么时候画」，这里答「画成什么样」），
 * 但解决的问题不同，所以没有复用那个函数：
 *
 * ---- 与价格走势图的三处差别 ----
 * 1. **横轴是日期等距，不是记录序号**：这里的每个点就是一天（空白的那天补 0），
 *    所以横轴均匀分格即可，不存在「按日期比例画会留半张空白」的问题。
 * 2. **多条线**：每个角色一条。价格图只有一条线，配色只有「涨/跌」两种；
 *    这里按角色序号取色（色实在 `.vue` 里，这一层只给 `index`）。
 * 3. **读数可能是负的**（收益扣掉支出后为负）：纵轴下界因此可以到 0 以下，
 *    并且**一定含 0**——不含 0 的折线图会让「从 0 涨到 2 万」和「从 1.9 万涨到 2 万」
 *    长得一模一样，而这两件事差得很远。
 *
 * ---- 尺寸同样实测传入 ----
 * 不用固定 `viewBox` + 等比缩放：原因写在 `price-chart-path.ts` 文件头（圆点会被拉成椭圆）。
 * 1 用户单位 = 1 像素，所以这里的常量都是屏幕像素。
 */
import { integerAxis } from '../../components/chart-axis';
import { ledgerMoneyText, shortDate } from '../../services/format';
import { totalsOf, type IncomeEntry } from './income';

/** 一条线：某个角色在 `labels` 那几天里的值，长度必须与 `labels` 相同（没数据的那天补 0）。 */
export interface TrendSeries {
    id: string;
    name: string;
    values: number[];
    colorIndex?: number;
}

export interface TrendLine {
    id: string;
    name: string;
    /** 取色用（`--series-1` … `--series-6`）。 */
    index: number;
    path: string;
    points: { x: number; y: number; value: number }[];
    last: { x: number; y: number };
    /** 最后一天的值（读屏摘要里要说）。 */
    lastValue: number;
}

export interface TrendGuide {
    y: number;
    label: string;
    zero: boolean;
}

export interface TrendTick {
    x: number;
    text: string;
    anchor: 'start' | 'middle' | 'end';
}

export interface TrendPlot {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface TrendGeometry {
    /** 一条有意义的线都没有：调用方画空状态，不要画一张什么都没有的图。 */
    empty: boolean;
    lines: TrendLine[];
    guides: TrendGuide[];
    ticks: TrendTick[];
    plot: TrendPlot;
    /** 实际使用的画布尺寸（已抬到下限）。`viewBox` 必须用这两个数。 */
    width: number;
    height: number;
}

/** 刻度、日期与末端圆点留足纸面，避免贴边。 */
const PAD = { left: 62, right: 18, top: 18, bottom: 30 };

/** 两个日期刻度之间的最小间距（px）。14 天挤在一张 500 宽的图里时全靠它分批。 */
const TICK_GAP = 56;

/** 哪种读数。决定纵轴刻度怎么写成字，以及读屏摘要里怎么说。 */
export type TrendKind = 'minutes' | 'money';

function trimZero(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}

/**
 * 纵轴刻度上的写法。
 *
 * 时长按「时」为主、不到一小时才回到「分」：一天的在线时长几乎都在小时量级，
 * 全写成分（180 分）要多读一位数字。钱走 `ledgerMoneyText`（与全站同一个口径），
 * 负值前面加 U+2212（与 `changeText` 用同一枚减号，等宽、一列数字不会左右晃）。
 */
export function trendValueText(value: number, kind: TrendKind): string {
    if (kind === 'minutes') {
        const total = Math.round(value);
        if (Math.abs(total) < 60) return `${total} 分`;
        return `${trimZero(total / 60)} 时`;
    }
    if (value === 0) return '0 万';
    return `${value > 0 ? '' : '−'}${ledgerMoneyText(value)}`;
}

export function buildTrendChart(input: {
    width: number;
    height: number;
    /** 横轴日期（`YYYY-MM-DD`），旧的在前、今天在最后。 */
    labels: string[];
    series: TrendSeries[];
    kind: TrendKind;
    axisUnit?: number;
    valueText?: (value: number) => string;
    dateText?: (label: string) => string;
}): TrendGeometry {
    /* 容器还没布局完时 `clientWidth` 是 0，`viewBox` 宽写成 0 会让整张图消失（且不报错）。 */
    const width = Math.max(160, Math.round(input.width));
    const height = Math.max(100, Math.round(input.height));

    const labels = input.labels;
    const series = input.series.filter((one) => one.values.length === labels.length);
    const values = series.flatMap((one) => one.values);
    const axisUnit =
        input.axisUnit ??
        (input.kind === 'money' ? 10000 : values.some((value) => Math.abs(value) >= 60) ? 60 : 1);
    const axis = integerAxis(values, axisUnit);
    const valueText =
        input.valueText ??
        ((value: number) =>
            input.kind === 'money'
                ? trendValueText(value, input.kind)
                : (value / axisUnit).toLocaleString('zh-CN') + (axisUnit === 60 ? ' 时' : ' 分'));
    // 固定元、万后大额刻度会变长，按文字长度预留左侧空间。
    const left = Math.min(
        width * 0.45,
        Math.max(PAD.left, ...axis.ticks.map((value) => valueText(value).length * 7 + 14)),
    );

    const plot: TrendPlot = {
        left,
        top: PAD.top,
        width: Math.max(10, width - left - PAD.right),
        height: Math.max(10, height - PAD.top - PAD.bottom),
    };

    /* 全 0 也是空：一条贴着 0 的平线读起来像「图画砸了」，而事实是那几天什么都没记。 */
    if (!labels.length || !series.length || values.every((value) => value === 0)) {
        return { empty: true, lines: [], guides: [], ticks: [], plot, width, height };
    }

    const lo = axis.min;
    const hi = axis.max;

    const last = labels.length - 1;
    const xOf = (index: number): number =>
        labels.length === 1 ? plot.left + plot.width / 2 : plot.left + (index / last) * plot.width;
    const yOf = (value: number): number => plot.top + (1 - (value - lo) / (hi - lo)) * plot.height;

    const lines: TrendLine[] = series.map((one, index) => {
        const points = one.values.map(
            (value, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yOf(value).toFixed(1)}`,
        );
        const final = one.values[one.values.length - 1];
        return {
            id: one.id,
            name: one.name,
            index: one.colorIndex ?? index,
            /* 只有一天时两个端点都在同一 x 上，画出来是零长的线（什么都看不见）。
             * 那种情况极罕见（图表范围最少也是七天），但路径不能是空的。 */
            path:
                points.length === 1
                    ? `M${xOf(0)} ${yOf(one.values[0])} L${xOf(0)} ${yOf(one.values[0])}`
                    : points.join(' '),
            points: one.values.map((value, index) => ({ x: xOf(index), y: yOf(value), value })),
            last: { x: xOf(one.values.length - 1), y: yOf(final) },
            lastValue: final,
        };
    });

    const guides: TrendGuide[] = [];
    for (const value of axis.ticks) {
        const label = valueText(value);
        // 自定义格式把不同刻度写成相同文字时只留一条。
        if (guides.some((one) => one.label === label)) continue;
        guides.push({ y: Math.round(yOf(value)) + 0.5, label, zero: value === 0 });
    }

    return {
        empty: false,
        lines,
        guides,
        ticks: buildTicks(labels, xOf, input.dateText),
        plot,
        width,
        height,
    };
}

/**
 * 横轴日期。
 *
 * 从**最后一天往回**放：最后那天是「现在」，它必须出现（被挤掉的如果是它，
 * 这张图就没有右端了）。两个刻度在 `TICK_GAP` 之内就跳过前一个——
 * 十四天挤在一张图里时，隔一个标一个比全标清楚（全标会连成一条黑线）。
 */
function buildTicks(
    labels: string[],
    xOf: (index: number) => number,
    formatDate: (label: string) => string = shortDate,
): TrendTick[] {
    const last = labels.length - 1;
    if (last === 0) return [{ x: xOf(0), text: formatDate(labels[0]), anchor: 'middle' }];

    const ticks: TrendTick[] = [];
    for (let index = last; index >= 0; index -= 1) {
        const x = xOf(index);
        if (ticks.some((one) => Math.abs(one.x - x) < TICK_GAP)) continue;
        ticks.push({
            x,
            text: formatDate(labels[index]),
            anchor: index === last ? 'end' : index === 0 ? 'start' : 'middle',
        });
    }
    return ticks.sort((left, right) => left.x - right.x);
}

/**
 * 「每天每个角色的净收益」表，键是 `${date}|${characterId}`（原值整数）。
 *
 * 与 `accounts/daily-sync.ts` 里私有那个 `netByCharacter` 是同一条口径（都走 `totalsOf`），
 * 但那个一次只算一天、是给「写账号」用的；这里要的是整张表，给图用。
 * **两边都必须用 `totalsOf`**：收益图上的线、账号里那一笔、统计条上的净额若各算一次，
 * 迟早会有一个对不上。
 */
export function netByDay(entries: readonly IncomeEntry[]): Map<string, number> {
    const groups = new Map<string, IncomeEntry[]>();
    for (const one of entries) {
        const key = `${one.date}|${one.characterId}`;
        const list = groups.get(key);
        if (list) list.push(one);
        else groups.set(key, [one]);
    }
    const out = new Map<string, number>();
    for (const [key, list] of groups) out.set(key, totalsOf(list).net);
    return out;
}

/** 先按共同角色表分配样式，再过滤当前区间的空线，两张图的同一角色不会换色。 */
export function trendSeriesOf(
    labels: readonly string[],
    source: ReadonlyMap<string, number>,
    actors: readonly { id: string; name: string }[],
): TrendSeries[] {
    return actors.flatMap((actor, colorIndex) => {
        const values = labels.map((date) => source.get(date + '|' + actor.id) ?? 0);
        return values.some((value) => value !== 0) ? [{ ...actor, colorIndex, values }] : [];
    });
}

export function trendDash(index: number): string | undefined {
    const group = Math.floor(index / 6);
    return group === 0 ? undefined : `${group * 2 + 2} 3`;
}

/** 绘图区内按横坐标选最近日期，轴标签区不触发明细。 */
export function trendIndexAt(plot: TrendPlot, count: number, x: number): number | null {
    if (
        count < 1 ||
        plot.width <= 0 ||
        !Number.isFinite(x) ||
        x < plot.left ||
        x > plot.left + plot.width
    )
        return null;
    if (count === 1) return 0;
    return Math.max(
        0,
        Math.min(count - 1, Math.round(((x - plot.left) / plot.width) * (count - 1))),
    );
}
