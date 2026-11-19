import { ALL_OPTIONS } from '../../components/select-options';
import { characterOptions, UNASSIGNED_CHARACTER } from '../characters/character-options';
import type { IncomeEntry } from './income';

/** 角色选项始终以整个日期区间汇总，不能跟随选中的角色缩成一项。 */
export function historyGroupsOf(
    rows: readonly IncomeEntry[],
    roster: readonly { id: string; name: string }[],
    selected: string,
) {
    const sums = new Map<string, { net: number; count: number }>();
    let total = 0;
    for (const row of rows) {
        const value = row.characterId || UNASSIGNED_CHARACTER;
        const amount = row.kind === 'expense' ? -row.amount : row.amount;
        const sum = sums.get(value) ?? { net: 0, count: 0 };
        sum.net += amount;
        sum.count += 1;
        total += amount;
        sums.set(value, sum);
    }
    const historicalIds = rows.map((row) => row.characterId);
    if (selected !== ALL_OPTIONS && selected !== UNASSIGNED_CHARACTER) historicalIds.push(selected);
    return characterOptions(roster, historicalIds, { all: true, unassigned: '未指定' }).map(
        (option) => ({
            ...option,
            label: option.value === ALL_OPTIONS ? '总计' : option.label,
            ...(option.value === ALL_OPTIONS
                ? { net: total, count: rows.length }
                : (sums.get(option.value) ?? { net: 0, count: 0 })),
        }),
    );
}
