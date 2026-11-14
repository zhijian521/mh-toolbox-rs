import { daysAgo, parseDay } from '../../services/format';
import type { CharacterData } from '../characters/character';
import { goalSummary, orderGoals, type Goal } from '../goals/goals';
import type { IncomeEntry } from '../income/income';

/** 首页只读现有账本与档案；进度和排序沿用业务页面的计算。 */

export function activeGoals(goals: readonly Goal[], roster: CharacterData[]) {
    return orderGoals(goals.map((goal) => ({ goal, summary: goalSummary(goal, roster) }))).filter(
        (one) => !one.summary.done,
    );
}

export interface DayNet {
    /** `YYYY-MM-DD`。 */
    date: string;
    /** 当天净额（收 − 支），可能为负。 */
    net: number;
    /** 当天记了几笔。0 表示那天没记，不是缺数据。 */
    count: number;
}

/**
 * 近 `days` 天每天一行，**按日期升序，最后一格是今天**。
 *
 * 中间没有记账的日子也要占一格（net 0），不能跳过去：跳掉之后 7 根柱子会变成 5 根，
 * 横轴就对不上日期，「某天没记账」也会被画成「那天不存在」。
 *
 * `today` 可注入，否则测试会在跨午夜时随机失败（与 `dayGroupsOf` 同一条）。
 */
export function weekSeries(entries: readonly IncomeEntry[], today: string, days = 7): DayNet[] {
    const buckets = new Map<string, DayNet>();
    for (let back = days - 1; back >= 0; back -= 1) {
        const date = daysAgo(back, parseDay(today));
        buckets.set(date, { date, net: 0, count: 0 });
    }

    for (const one of entries) {
        const hit = buckets.get(one.date);
        if (!hit) continue;
        hit.net += one.kind === 'expense' ? -one.amount : one.amount;
        hit.count += 1;
    }

    /* `Map` 的插入顺序就是按日期造的壳的顺序（升序），直接取值即得。 */
    return [...buckets.values()];
}
