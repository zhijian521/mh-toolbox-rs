import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../characters/character';
import type { IncomeEntry } from '../income/income';
import type { Goal } from '../goals/goals';
import { activeGoals, weekSeries } from './overview';

/**
 * 总览页的纯函数。
 *
 * 这里断的是**新版自己的期望**，不与旧仓比对（`ARCHITECTURE.md` §5：旧仓是参考读物，
 * 不是兼容目标）。日期一律注入，不读真实时钟——否则跨午夜跑会随机红一条。
 */

const TODAY = '2026-11-05';

function goal(patch: Partial<Goal> = {}): Goal {
    return {
        id: 'g1',
        kind: 'money',
        title: '存钱',
        members: [],
        target: 100,
        unit: '万',
        tracking: null,
        deadline: '',
        note: '',
        logs: [],
        createdAt: 1,
        ...patch,
    };
}

describe('activeGoals', () => {
    it('只展示进行中，按期限及创建顺序排列，不修改原数组', () => {
        const goals = [
            goal({ id: 'later', deadline: '2026-12-01' }),
            goal({
                id: 'done',
                logs: [{ id: 'l1', date: TODAY, delta: 100, note: '', createdAt: 1 }],
            }),
            goal({ id: 'no-date', createdAt: 2 }),
            goal({ id: 'soon', deadline: '2026-11-06' }),
        ];
        expect(activeGoals(goals, []).map((one) => one.goal.id)).toEqual([
            'soon',
            'later',
            'no-date',
        ]);
        expect(goals.map((one) => one.id)).toEqual(['later', 'done', 'no-date', 'soon']);
    });

    it('多人养成独立达标，超额不能抵消其他角色进度，更新档案后自动移出已完成项', () => {
        const item = goal({
            kind: 'growth',
            target: 100,
            unit: '级',
            members: [
                { id: 'c1', name: '甲' },
                { id: 'c2', name: '乙' },
            ],
            tracking: { category: 'level', key: '角色等级' },
        });
        const roster = [character({ id: 'c1', level: 120 }), character({ id: 'c2', level: 80 })];
        const summary = activeGoals([item], roster)[0].summary;
        expect(summary.current).toBe(180);
        expect(summary.achieved).toBe(1);
        roster[1].level = 100;
        expect(activeGoals([item], roster)).toEqual([]);
    });

    it('无目标时保持空列表', () => {
        expect(activeGoals([], [])).toEqual([]);
    });
});

function entry(patch: Partial<IncomeEntry> = {}): IncomeEntry {
    return {
        id: 'e1',
        date: TODAY,
        characterId: '',
        kind: 'income',
        amount: 10000,
        item: '定魂珠',
        note: '',
        createdAt: 1,
        ...patch,
    };
}

function character(patch: Partial<CharacterData> = {}): CharacterData {
    return {
        id: 'c1',
        name: '归ω岚',
        level: 109,
        school: '大唐官府',
        server: '长安城',
        guild: '',
        attrGroups: [],
        experience: { value: '', need: '' },
        skills: [],
        assists: [],
        trainings: [],
        gear: [],
        gearMeta: { special: '', suit: '' },
        pets: [],
        ...patch,
    };
}

describe('weekSeries', () => {
    it('七天七格，按日期升序，最后一格是今天', () => {
        const series = weekSeries([], TODAY);

        expect(series).toHaveLength(7);
        expect(series[6].date).toBe(TODAY);
        expect(series[0].date).toBe('2026-10-30');
        expect(series.map((one) => one.date)).toEqual([...series.map((one) => one.date)].sort());
    });

    it('没记账的那天也占一格：空的日子不能被跳过', () => {
        // 跳掉的话 7 根柱子会变成 5 根，横轴就对不上日期了。
        const series = weekSeries([entry({ date: '2026-11-03' })], TODAY);

        expect(series).toHaveLength(7);
        expect(series.find((one) => one.date === '2026-11-04')).toEqual({
            date: '2026-11-04',
            net: 0,
            count: 0,
        });
    });

    it('同一天合起来算：收入为正、支出为负', () => {
        const series = weekSeries(
            [
                entry({ id: 'a', date: TODAY, amount: 46000 }),
                entry({ id: 'b', date: TODAY, kind: 'expense', amount: 6000 }),
                entry({ id: 'c', date: TODAY, amount: 20000 }),
            ],
            TODAY,
        );

        const today = series[6];
        expect(today.net).toBe(60000);
        expect(today.count).toBe(3);
    });

    it('支出大于收入时净额是负数', () => {
        const series = weekSeries([entry({ kind: 'expense', amount: 5000 })], TODAY);

        expect(series[6].net).toBe(-5000);
    });

    it('七天之外的记录不计入（更早的、将来的都不算）', () => {
        const series = weekSeries(
            [entry({ id: 'old', date: '2026-10-01' }), entry({ id: 'future', date: '2026-12-01' })],
            TODAY,
        );

        expect(series.every((one) => one.count === 0 && one.net === 0)).toBe(true);
    });

    it('天数可换（天数只有一个参数，不写死 7）', () => {
        expect(weekSeries([], TODAY, 3)).toHaveLength(3);
        expect(weekSeries([], TODAY, 3)[2].date).toBe(TODAY);
    });
});
