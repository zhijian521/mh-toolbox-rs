import { describe, expect, it } from 'vitest';
import type { CharacterData, TrainingRow } from '../characters/character';
import type { IncomeEntry } from '../income/income';
import { charBrief, trainingPercent, weekSeries } from './overview';

/**
 * 总览页的纯函数。
 *
 * 这里断的是**新版自己的期望**，不与旧仓比对（`ARCHITECTURE.md` §5：旧仓是参考读物，
 * 不是兼容目标）。日期一律注入，不读真实时钟——否则跨午夜跑会随机红一条。
 */

const TODAY = '2026-11-05';

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

function training(rows: TrainingRow[]): CharacterData['trainings'] {
    return [{ title: '任务修炼', rows }];
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
        trainings: training([]),
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

describe('charBrief', () => {
    it('经验按 value/need 算百分比', () => {
        const brief = charBrief(character({ experience: { value: '3,777.2万', need: '4,200万' } }));

        expect(brief.exp).toBeCloseTo(89.93, 1);
    });

    it('经验分母没填 → null（条子留空，不是画成 0%）', () => {
        const brief = charBrief(character({ experience: { value: '100万', need: '' } }));

        expect(brief.exp).toBeNull();
    });

    it('修炼合计读每行自己的上限，不按常量表', () => {
        // 同一个「攻击修炼」，这个号的上限被帮派推到 25——按常量 20 算会得出 125%。
        const brief = charBrief(
            character({
                trainings: training([
                    { name: '攻击修炼', level: 25, cap: 25 },
                    { name: '防御修炼', level: 10, cap: 20 },
                ]),
            }),
        );

        expect(brief.trainingLevel).toBe(35);
        expect(brief.trainingCap).toBe(45);
        expect(trainingPercent(brief)).toBeCloseTo(77.78, 1);
    });

    it('两组一起算（任务修炼与宠物修炼不是两张表）', () => {
        const brief = charBrief(
            character({
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 20, cap: 20 }] },
                    { title: '宠物修炼', rows: [{ name: '育兽术', level: 30, cap: 35 }] },
                ],
            }),
        );

        expect(brief.trainingLevel).toBe(50);
        expect(brief.trainingCap).toBe(55);
        expect(brief.totalRows).toBe(2);
    });

    it('cap 为 0 的行不算满级，但仍算进总项数', () => {
        // 上限没填时永远算不出「满」——猜一个数比不标更糟。
        const brief = charBrief(
            character({
                trainings: training([
                    { name: '攻击修炼', level: 5, cap: 0 },
                    { name: '防御修炼', level: 20, cap: 20 },
                ]),
            }),
        );

        expect(brief.maxedRows).toBe(1);
        expect(brief.totalRows).toBe(2);
        expect(trainingPercent(brief)).toBe(100);
    });

    it('什么都没填的新号不会除出 NaN', () => {
        const brief = charBrief(character());

        expect(brief.exp).toBeNull();
        expect(trainingPercent(brief)).toBeNull();
        expect(brief.maxedRows).toBe(0);
        expect(brief.totalRows).toBe(0);
    });
});
