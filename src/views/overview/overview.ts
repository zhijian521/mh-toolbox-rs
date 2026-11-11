import { daysAgo, parseDay } from '../../services/format';
import { expPercent, type CharacterData } from '../characters/character';
import type { IncomeEntry } from '../income/income';

/**
 * 总览页的纯计算：近 7 天每天的净额、每个号的近况。
 *
 * 放在单独文件里而不是写进 `.vue`：这些函数要能单测——柱状图的最矮一根、经验未知时
 * 条子怎么画、两组修炼如何合计，都不是靠点一下页面能看出来的。
 * 页面那一层只负责把值摆上去。
 *
 * **这里不新增任何存储**：三个数全从既有的 `income_entries` / `characters` 现算。
 * 总览是「读一眼」，不是「另一份账」——同一件事存两处，迟早有一处忘了更新。
 */

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

export interface CharBrief {
    id: string;
    name: string;
    level: number;
    school: string;
    /** 经验百分比（0–100）；分母没填时是 `null`——那时条子留空，不画成 0%。 */
    exp: number | null;
    /** 两组修炼的当前等级合计；角色不再记录修炼上限。 */
    trainingLevel: number;
}

/**
 * 一个号的近况。修炼只汇总当前等级，不再推算完成百分比或满级项数。
 */
export function charBrief(one: CharacterData): CharBrief {
    const trainingLevel = one.trainings.reduce(
        (total, group) => total + group.rows.reduce((sum, row) => sum + row.level, 0),
        0,
    );

    return {
        id: one.id,
        name: one.name,
        level: one.level,
        school: one.school,
        exp: expPercent(one.experience.value, one.experience.need),
        trainingLevel,
    };
}
