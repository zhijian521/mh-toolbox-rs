import { ALL_OPTIONS as ALL_ACCOUNTS } from '../../components/select-options';
import { UNASSIGNED_CHARACTER as UNASSIGNED } from '../characters/character-options';
import { describe, expect, it } from 'vitest';
import { buildTrendChart } from '../../components/trend-chart';
import { accountStats, SHORTCUTS, type AccountEntry } from './accounts';
import {
    accountAxisText,
    accountTrend,
    accountValueText,
    characterAccounts,
    characterCategoryAccounts,
    channelAccounts,
    filterAccounts,
    shortcutTotal,
} from './account-analysis';

function entry(patch: Partial<AccountEntry> = {}): AccountEntry {
    return {
        id: 'one',
        date: '2026-11-01',
        characterId: '',
        currency: 'rmb',
        kind: 'expense',
        category: '装备交易',
        channel: '藏宝阁',
        amount: 10,
        note: '',
        source: '',
        createdAt: 1,
        ...patch,
    };
}

describe('账号概览统计', () => {
    it('两种币种独立，空白日期补零，支出不伪装成负收入', () => {
        const rows = [
            entry({ kind: 'income', amount: 12.5 }),
            entry({ date: '2026-11-03', amount: 2.5 }),
            entry({ currency: 'cash', amount: 46000 }),
        ];
        const range = { from: '2026-11-01', to: '2026-11-03' };
        expect(accountTrend(rows, 'rmb', range)).toEqual({
            labels: ['2026-11-01', '2026-11-02', '2026-11-03'],
            income: [12.5, 0, 0],
            expense: [0, 0, 2.5],
            unit: '日',
        });
        expect(accountTrend(rows, 'cash', range).expense).toEqual([46000, 0, 0]);
    });

    it('跨年按月汇总，首尾月份与空白月份都保留', () => {
        const rows = [
            entry({ date: '2025-12-31', amount: 20 }),
            entry({ date: '2026-03-05', amount: 30 }),
        ];
        expect(accountTrend(rows, 'rmb', { from: '', to: '' })).toEqual({
            labels: ['2025-12', '2026-01', '2026-02', '2026-03'],
            income: [0, 0, 0, 0],
            expense: [20, 0, 0, 30],
            unit: '月',
        });
    });

    it('超过三年按年汇总，不截掉最早的账', () => {
        const rows = [entry({ date: '2020-01-01' }), entry({ date: '2026-11-01', amount: 20 })];
        const trend = accountTrend(rows, 'rmb', { from: '', to: '' });
        expect(trend.unit).toBe('年');
        expect(trend.labels).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026']);
        expect(trend.expense).toEqual([10, 0, 0, 0, 0, 0, 20]);
    });

    it('只统计两端包含的区间，空范围有明确空态', () => {
        const rows = [entry({ date: '2026-10-31' }), entry(), entry({ date: '2026-11-02' })];
        expect(accountTrend(rows, 'rmb', { from: '2026-11-01', to: '2026-11-01' }).expense).toEqual(
            [10],
        );
        expect(accountTrend([], 'rmb', { from: '', to: '' }).labels).toEqual([]);
        expect(accountTrend(rows, 'rmb', { from: '2026-11-02', to: '2026-11-01' }).labels).toEqual(
            [],
        );
    });

    it('保留未指定、已删角色与亏损，不混入其他币种', () => {
        const rows = [
            entry(),
            entry({ characterId: 'deleted', kind: 'income', amount: 30 }),
            entry({ characterId: 'deleted', amount: 5 }),
            entry({ characterId: 'deleted', currency: 'cash', amount: 10000 }),
        ];
        expect(characterAccounts(rows, 'rmb')).toEqual([
            { id: 'deleted', income: 30, expense: 5, net: 25 },
            { id: '', income: 0, expense: 10, net: -10 },
        ]);
    });

    it('未指定与全部角色不同，日期、来源、币种共同生效', () => {
        const rows = [
            entry(),
            entry({ id: 'auto', source: 'auto', currency: 'cash' }),
            entry({ id: 'who', characterId: 'who' }),
        ];
        expect(filterAccounts(rows, { characterId: ALL_ACCOUNTS })).toHaveLength(3);
        expect(
            filterAccounts(rows, { characterId: UNASSIGNED, source: 'manual' }).map(
                (one) => one.id,
            ),
        ).toEqual(['one']);
        expect(
            filterAccounts(rows, {
                from: '2026-11-01',
                to: '2026-11-01',
                source: 'auto',
                currency: 'cash',
            }).map((one) => one.id),
        ).toEqual(['auto']);
        expect(filterAccounts(rows, { from: '2026-11-02' })).toEqual([]);
    });

    it('人民币汇总消除浮点尾差，零和负值都有清楚的币种与符号', () => {
        const rows = [
            entry({ kind: 'income', amount: 0.1 }),
            entry({ kind: 'income', amount: 0.2 }),
            entry({ amount: 0.3 }),
        ];
        expect(accountStats(rows, 'rmb')).toEqual({ income: 0.3, expense: 0.3, net: 0, count: 3 });
        expect(accountTrend(rows, 'rmb', { from: '', to: '' }).income).toEqual([0.3]);
        expect(accountValueText(0, 'rmb')).toBe('0 元');
        expect(accountValueText(-46000, 'cash')).toBe('−4.6 万');
    });
});

it('账号币种与跨月日期格式同步到复用图表的坐标轴', () => {
    const chart = buildTrendChart({
        width: 420,
        height: 192,
        labels: ['2026-10', '2026-11'],
        series: [{ id: 'income', name: '收入', values: [12.5, 25] }],
        kind: 'money',
        axisUnit: 1,
        valueText: (value) => accountValueText(value, 'rmb'),
        dateText: (label) => label.slice(2),
    });
    expect(chart.guides.map((one) => one.label)).toEqual(['30 元', '20 元', '10 元', '0 元']);
    expect(chart.ticks.map((one) => one.text)).toEqual(['26-10', '26-11']);
    expect(accountAxisText(100000, 'rmb')).toBe('100,000 元');
    expect(accountAxisText(100000000, 'cash')).toBe('10,000 万');
});

it('渠道收支合并不同角色的同渠道记录，币种隔离并保留自定义渠道', () => {
    const rows = [
        entry({ characterId: 'one', channel: '藏宝阁', kind: 'income', amount: 30 }),
        entry({ characterId: 'two', channel: '藏宝阁', amount: 5 }),
        entry({ channel: '线下', amount: 0.2 }),
        entry({ channel: '线下', amount: 0.1 }),
        entry({ channel: '藏宝阁', currency: 'cash', amount: 46000 }),
    ];
    expect(channelAccounts(rows, 'rmb')).toEqual([
        { id: '藏宝阁', income: 30, expense: 5, net: 25 },
        { id: '线下', income: 0, expense: 0.3, net: -0.3 },
    ]);
    expect(channelAccounts(rows, 'cash')).toEqual([
        { id: '藏宝阁', income: 0, expense: 46000, net: -46000 },
    ]);
    expect(channelAccounts([], 'rmb')).toEqual([]);
});

it('快捷卡汇总仅匹配手记的方向、币种、分类和渠道，保留小数', () => {
    const preset = SHORTCUTS.find((one) => one.id === 'gear-buy')!.preset;
    const rows = [
        entry({ amount: 0.1 }),
        entry({ amount: 0.2 }),
        entry({ kind: 'income', amount: 100 }),
        entry({ channel: '其他', amount: 100 }),
        entry({ category: '其他收支', amount: 100 }),
        entry({ currency: 'cash', amount: 10000 }),
        entry({ source: 'auto', amount: 100 }),
    ];
    expect(shortcutTotal(rows, preset)).toEqual({ amount: 0.3, count: 2 });
    expect(shortcutTotal([], preset)).toEqual({ amount: 0, count: 0 });
});

it('角色堆叠分开收支和币种，同一分类合并，柱段合计等于角色总额', () => {
    const rows = [
        entry({ characterId: 'one', category: '装备交易', amount: 0.1 }),
        entry({ characterId: 'one', category: '装备交易', amount: 0.2 }),
        entry({ characterId: 'one', category: '点卡充值', amount: 20 }),
        entry({ characterId: 'one', category: '装备交易', kind: 'income', amount: 50 }),
        entry({ characterId: 'two', category: '点卡充值', amount: 10 }),
        entry({ characterId: '', category: '自定义', amount: 5 }),
        entry({ characterId: 'one', category: '装备交易', currency: 'cash', amount: 46000 }),
    ];
    const result = characterCategoryAccounts(rows, 'rmb');
    expect(result.categories).toEqual(['装备交易', '点卡充值', '自定义']);
    const one = result.rows.find((row) => row.id === 'one')!;
    expect(one.incomeSegments).toEqual([{ category: '装备交易', amount: 50 }]);
    expect(one.expenseSegments).toEqual([
        { category: '装备交易', amount: 0.3 },
        { category: '点卡充值', amount: 20 },
    ]);
    expect(one.incomeSegments.reduce((sum, part) => sum + part.amount, 0)).toBe(one.income);
    expect(one.expenseSegments.reduce((sum, part) => sum + part.amount, 0)).toBe(one.expense);
    expect(result.rows.find((row) => row.id === '')?.expenseSegments).toEqual([
        { category: '自定义', amount: 5 },
    ]);
    expect(characterCategoryAccounts(rows, 'cash').rows[0].expenseSegments).toEqual([
        { category: '装备交易', amount: 46000 },
    ]);
    expect(characterCategoryAccounts([], 'cash')).toEqual({ categories: [], rows: [] });
});
