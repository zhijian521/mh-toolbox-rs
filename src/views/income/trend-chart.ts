import type { TrendSeries } from '../../components/trend-chart';
import { totalsOf, type IncomeEntry } from './income';

/** 每天每个角色的净收益，键是 `${date}|${characterId}`；与账号同步共用 totalsOf 口径。 */
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

/** 先按共同角色表分配样式，再过滤当前区间的空系列，两张图的同一角色不会换色。 */
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
