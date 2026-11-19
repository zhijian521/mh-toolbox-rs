import { describe, expect, it } from 'vitest';
import { ALL_OPTIONS } from '../../components/select-options';
import { UNASSIGNED_CHARACTER } from '../characters/character-options';
import { historyGroupsOf } from './history-summary';
import type { IncomeEntry } from './income';

const roster = [
    { id: 'a', name: '甲' },
    { id: 'b', name: '乙' },
];
const entry = (characterId: string, amount: number, kind: IncomeEntry['kind'] = 'income') =>
    ({ characterId, amount, kind }) as IncomeEntry;

describe('历史收益角色汇总', () => {
    it('总计包含各角色和未指定的收支，不重复累计', () => {
        const groups = historyGroupsOf(
            [entry('a', 100), entry('a', 30, 'expense'), entry('b', 25), entry('', 10, 'expense')],
            roster,
            ALL_OPTIONS,
        );
        expect(groups.map(({ value, net, count }) => ({ value, net, count }))).toEqual([
            { value: ALL_OPTIONS, net: 85, count: 4 },
            { value: UNASSIGNED_CHARACTER, net: -10, count: 1 },
            { value: 'a', net: 70, count: 2 },
            { value: 'b', net: 25, count: 1 },
        ]);
    });

    it('选择角色不会改变滑块的其他角色和区间小计', () => {
        const rows = [entry('a', 100), entry('b', 25)];
        expect(historyGroupsOf(rows, roster, 'a')).toEqual(historyGroupsOf(rows, roster, 'b'));
    });

    it('空区间保留全部、未指定、现存角色及当前已删角色，金额为零', () => {
        const groups = historyGroupsOf([], roster, 'removed');
        expect(groups.map((group) => group.value)).toEqual([
            ALL_OPTIONS,
            UNASSIGNED_CHARACTER,
            'a',
            'b',
            'removed',
        ]);
        expect(groups.every((group) => group.net === 0 && group.count === 0)).toBe(true);
        expect(groups.at(-1)?.label).toBe('已删角色');
    });

    it('已删角色分开汇总，未指定不与全部混用', () => {
        const groups = historyGroupsOf(
            [entry('old-a', 8), entry('old-b', 12), entry('', 3)],
            [],
            ALL_OPTIONS,
        );
        expect(groups.map((group) => [group.value, group.net])).toEqual([
            [ALL_OPTIONS, 23],
            [UNASSIGNED_CHARACTER, 3],
            ['old-a', 8],
            ['old-b', 12],
        ]);
        expect(groups.slice(-2).map((group) => group.label)).toEqual(['已删角色 1', '已删角色 2']);
    });
});
