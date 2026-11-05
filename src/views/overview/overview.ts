import { daysAgo, parseDay } from '../../services/format';
import { expPercent, type CharacterData } from '../characters/character';
import type { IncomeEntry } from '../income/income';

/**
 * 总览页的纯计算：近 7 天每天的净额、每个号的近况。
 *
 * 放在单独文件里而不是写进 `.vue`：这些函数要能单测——柱状图的最矮一根、经验未知时
 * 条子怎么画、修炼上限为 0 时会不会除出 `Infinity`，都不是靠点一下页面能看出来的。
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
    /** 修炼等级合计 / 上限合计（两组十几项一起算）。 */
    trainingLevel: number;
    trainingCap: number;
    /** 已经练满的项数 / 总项数。 */
    maxedRows: number;
    totalRows: number;
}

/**
 * 一个号的近况。
 *
 * **修炼完成度按行上的 `cap` 算，不按 `TRAINING_GROUPS` 的常量**：上限是跟号走的
 * （帮派与「修炼上限提升」会把它推高），同一个「攻击修炼」在不同号上是 20 或 25。
 * 用常量表算，25 级上限的那个号会显示成「已经超了 125%」。
 *
 * `cap` 合计为 0（新号、什么都没填）时百分比交给调用方看 `trainingCap`——这里不返回
 * 百分比，免得除出 `Infinity` 或 `NaN`。
 */
export function charBrief(one: CharacterData): CharBrief {
    let trainingLevel = 0;
    let trainingCap = 0;
    let maxedRows = 0;
    let totalRows = 0;

    for (const group of one.trainings) {
        for (const row of group.rows) {
            trainingLevel += row.level;
            trainingCap += row.cap;
            totalRows += 1;
            /* `cap` 为 0 = 上限没填，永远算不出「满」——猜一个数比不标更糟。 */
            if (row.cap > 0 && row.level >= row.cap) maxedRows += 1;
        }
    }

    return {
        id: one.id,
        name: one.name,
        level: one.level,
        school: one.school,
        exp: expPercent(one.experience.value, one.experience.need),
        trainingLevel,
        trainingCap,
        maxedRows,
        totalRows,
    };
}

/**
 * 修炼完成度百分比（0–100）。上限合计为 0 时返回 `null`，与经验那条同一个口径：
 * 进度条留空，而不是画成 0%。
 */
export function trainingPercent(brief: CharBrief): number | null {
    if (brief.trainingCap <= 0) return null;
    return Math.min(100, Math.max(0, (brief.trainingLevel / brief.trainingCap) * 100));
}
