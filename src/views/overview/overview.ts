import { dateText, daysAgo, parseDay } from '../../services/format';
import { filterAccounts } from '../accounts/account-analysis';
import { accountStatsByCurrency, CURRENCY_META, type AccountEntry } from '../accounts/accounts';
import type { ReadonlyCharacter } from '../characters/character';
import { goalSummary, orderGoals, type ReadonlyGoal } from '../goals/goals';
import type { IncomeEntry } from '../income/income';

/** 首页只读现有账本与档案；进度和排序沿用业务页面的计算。 */

/** 收支沿用账号账本，已同步的速记与点卡不再从收益页重复累加。 */
export function workbenchSummary(entries: readonly AccountEntry[], today: string) {
    const end = parseDay(today);
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    // 目标月没有同一日时取月末，避免 3 月 31 日减一个月反而进位到 3 月。
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(end.getDate(), lastDay));
    const range = { from: dateText(start), to: today };
    const stats = accountStatsByCurrency(filterAccounts(entries, range));
    return {
        range,
        books: (['cash', 'rmb'] as const).map((currency) => ({
            currency,
            label: CURRENCY_META[currency].label,
            stats: stats[currency],
        })),
    };
}

export function activeGoals(goals: readonly ReadonlyGoal[], roster: readonly ReadonlyCharacter[]) {
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
