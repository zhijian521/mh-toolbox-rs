import { ALL_OPTIONS as ALL_ACCOUNTS } from '../../components/select-options';
import { UNASSIGNED_CHARACTER as UNASSIGNED } from '../characters/character-options';
import { describe, expect, it } from 'vitest';
import { buildTrendChart } from '../../components/trend-chart';
import { accountStatsByCurrency, SHORTCUTS, type AccountEntry } from './accounts';
import { accountSummaryBooks } from './account-summary';
import {
    accountAxisText,
    accountTrend,
    accountValueText,
    characterAccounts,
    characterCategoryAccounts,
    channelAccounts,
    filterAccounts,
    shortcutTotals,
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
    it('概览和历史共用读数，保留币种单位、笔数、亏损及零值', () => {
        const books = accountSummaryBooks([
            entry({ kind: 'income', amount: 0.1 }),
            entry({ kind: 'income', amount: 0.2 }),
            entry({ amount: 0.4 }),
            entry({ currency: 'cash', kind: 'income', amount: 10000 }),
        ]);
        expect(books.map((book) => book.currency)).toEqual(['rmb', 'cash']);
        expect(books[0]).toMatchObject({ heading: '人民币', hint: '3 笔' });
        expect(books[0].items.map(({ value, tone }) => ({ value, tone }))).toEqual([
            { value: '0.3 元', tone: 'gain' },
            { value: '0.4 元', tone: 'loss' },
            { value: '−0.1 元', tone: 'loss' },
        ]);
        expect(books[1].items.map((item) => item.value)).toEqual(['1 万', '0 万', '1 万']);
        expect(
            accountSummaryBooks([]).every(
                (book) => book.hint === '0 笔' && book.items.every((item) => item.tone === 'num'),
            ),
        ).toBe(true);
    });

    it('双币种一次汇总不混账，分别按汇总后的金额取整', () => {
        const rows = [
            entry({ kind: 'income', amount: 0.1 }),
            entry({ kind: 'income', amount: 0.2 }),
            entry({ amount: 0.3 }),
            entry({ currency: 'cash', kind: 'income', amount: 10000.2 }),
            entry({ currency: 'cash', kind: 'income', amount: 10000.2 }),
            entry({ currency: 'cash', amount: 30000.4 }),
        ];
        expect(accountStatsByCurrency(rows)).toEqual({
            rmb: { income: 0.3, expense: 0.3, net: 0, count: 3 },
            cash: { income: 20000, expense: 30000, net: -10000, count: 3 },
        });
        expect(accountStatsByCurrency([])).toEqual({
            rmb: { income: 0, expense: 0, net: 0, count: 0 },
            cash: { income: 0, expense: 0, net: 0, count: 0 },
        });
    });

    it('快捷项跨渠道分币种汇总，区分方向与自动来源，并保留重复预设', () => {
        const rows = [
            entry({ amount: 0.1 }),
            entry({ amount: 0.2 }),
            entry({ amount: 0.8, source: 'auto' }),
            entry({ amount: 7, kind: 'income' }),
            entry({ amount: 11, channel: '游戏内' }),
            entry({ amount: 13, currency: 'cash' }),
            entry({ amount: 17, category: '其他收支' }),
        ];
        const presets = [...SHORTCUTS.map((one) => one.preset), SHORTCUTS[0].preset];
        const totals = shortcutTotals(rows, presets);
        expect(totals[0]).toEqual({
            rmb: { amount: 11.3, count: 3 },
            cash: { amount: 13, count: 1 },
        });
        expect(totals[1]).toEqual({
            rmb: { amount: 7, count: 1 },
            cash: { amount: 0, count: 0 },
        });
        expect(totals[2]).toEqual({
            rmb: { amount: 0, count: 0 },
            cash: { amount: 0, count: 0 },
        });
        expect(totals.at(-1)).toEqual(totals[0]);
        expect(shortcutTotals(rows, [])).toEqual([]);
    });

    it('日期边界从乱序记录求出，缺失单侧边界时保留另一侧限定', () => {
        const rows = [
            entry({ date: '2026-11-03', amount: 3 }),
            entry({ date: '2020-01-01', currency: 'cash' }),
            entry({ date: '2026-11-01', amount: 1 }),
            entry({ date: '2026-11-02', amount: 2 }),
        ];
        expect(accountTrend(rows, 'rmb', { from: '', to: '' }).expense).toEqual([1, 2, 3]);
        expect(accountTrend(rows, 'rmb', { from: '', to: '2026-11-02' }).expense).toEqual([1, 2]);
        expect(accountTrend(rows, 'rmb', { from: '2026-11-02', to: '' }).expense).toEqual([2, 3]);
        expect(rows[0].date).toBe('2026-11-03');
    });

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
        expect(accountStatsByCurrency(rows).rmb).toEqual({
            income: 0.3,
            expense: 0.3,
            net: 0,
            count: 3,
        });
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

it('快捷卡按手记方向和分类匹配，跨渠道分币种保留小数', () => {
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
    expect(shortcutTotals(rows, [preset])[0]).toEqual({
        rmb: { amount: 100.3, count: 3 },
        cash: { amount: 10000, count: 1 },
    });
    expect(shortcutTotals([], [preset])[0]).toEqual({
        rmb: { amount: 0, count: 0 },
        cash: { amount: 0, count: 0 },
    });
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
