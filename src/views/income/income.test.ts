import { describe, expect, it } from 'vitest';
import {
    amountText,
    dayGroupsOf,
    entriesOn,
    groupByItem,
    normalizeEntry,
    parseEntries,
    parsePrices,
    recordSummary,
    splitAmount,
    totalsOf,
    type IncomeEntry,
} from './income';

/**
 * 收益页的规则。只测纯函数——store 那一层要 `localStorage` / `invoke`，留给真机点测
 * （与 `prices.test.ts` 同一条分工：那边也只测 `prices.ts`）。
 *
 * 这些用例的共同点：**它们盯的都是「数悄悄错掉」**。金额、日期、排序错一位不会报错，
 * 只会让「今天赚了多少」变成一个看起来正常的错数。
 */
describe('收益：金额呈现', () => {
    it('金额一句话与物价页同一口径', () => {
        expect(amountText(41200000)).toBe('4120 万');
        expect(amountText(46000)).toBe('4.6 万');
        // 不到一万时按原值显示（游戏里低于一万的价本来就少，折成 0.03 万更难懂）
        expect(amountText(8000)).toBe('8000');
        expect(amountText(0)).toBe('—');
    });
});

describe('收益：归一', () => {
    const good = {
        id: 'e1',
        date: '2026-11-04',
        characterId: 'c1',
        kind: 'expense',
        amount: 150000,
        item: '金香玉 ×10',
        note: '',
        createdAt: 1,
    };

    it('好记录原样通过', () => {
        expect(normalizeEntry(good)).toMatchObject({ id: 'e1', kind: 'expense', amount: 150000 });
    });

    it('日期不合形、金额不为正、根本不是对象的，一律丢掉', () => {
        expect(normalizeEntry({ ...good, date: '11-04' })).toBeNull();
        expect(normalizeEntry({ ...good, date: '2026-13-01' })).not.toBeNull(); // 只查形状，不查日历
        expect(normalizeEntry({ ...good, amount: 0 })).toBeNull();
        expect(normalizeEntry({ ...good, amount: -5 })).toBeNull();
        expect(normalizeEntry({ ...good, amount: 'abc' })).toBeNull();
        expect(normalizeEntry(null)).toBeNull();
        expect(normalizeEntry('x')).toBeNull();
    });

    it('缺 id 补一个，kind 不认识就算收入', () => {
        const entry = normalizeEntry({ ...good, id: '', kind: '随便' });
        expect(entry?.id).toBeTruthy();
        expect(entry?.kind).toBe('income');
    });

    it('整份归一：坏的丢掉、好的留下，不抛错', () => {
        const list = parseEntries([
            good,
            { date: '2026-11-04', amount: 0 },
            null,
            { ...good, id: 'e2' },
        ]);
        expect(list.map((one) => one.id)).toEqual(['e1', 'e2']);
        expect(parseEntries(null)).toEqual([]);
        expect(parseEntries('x')).toEqual([]);
    });

    it('单价表：0 与负数丢掉（0 表示「没设价」，不是「一文不值」）', () => {
        const prices = parsePrices([
            { itemId: 9, price: 46000 },
            { itemId: 20, price: 0 },
            { itemId: 21, price: -1 },
            { itemId: 0, price: 100 },
            { itemId: 22, price: 85000.4 },
        ]);
        expect(prices).toEqual({ 9: 46000, 22: 85000 });
    });
});

describe('收益：合计与分组', () => {
    function entry(part: Partial<IncomeEntry> & { id: string }): IncomeEntry {
        return {
            date: '2026-11-04',
            characterId: '',
            kind: 'income',
            amount: 10000,
            item: '',
            note: '',
            createdAt: 1,
            ...part,
        };
    }

    it('净额可以是负的，且支出不参与收入合计', () => {
        const totals = totalsOf([
            entry({ id: 'a', amount: 41200000 }),
            entry({ id: 'b', amount: 138000 }),
            entry({ id: 'c', kind: 'expense', amount: 150000 }),
            entry({ id: 'd', kind: 'expense', amount: 80000 }),
        ]);
        expect(totals).toEqual({
            income: 41338000,
            expense: 230000,
            net: 41108000,
            count: 4,
        });

        expect(totalsOf([entry({ id: 'x', kind: 'expense', amount: 50000 })]).net).toBe(-50000);
        expect(totalsOf([])).toEqual({ income: 0, expense: 0, net: 0, count: 0 });
    });

    it('按日期分组：新的在前，组内按记录时间倒排', () => {
        const groups = dayGroupsOf([
            entry({ id: 'old', date: '2026-11-02', createdAt: 5 }),
            entry({ id: 'new-a', date: '2026-11-04', createdAt: 9 }),
            entry({ id: 'new-b', date: '2026-11-04', createdAt: 10 }),
            entry({ id: 'mid', date: '2026-11-03', createdAt: 1 }),
        ]);

        expect(groups.map((one) => one.date)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02']);
        // 同一组里后记的在上
        expect(groups[0].entries.map((one) => one.id)).toEqual(['new-b', 'new-a']);
        expect(groups[0].totals.count).toBe(2);
    });

    it('某一天的记录按日期字符串筛，不靠 Date 解析', () => {
        const list = [
            entry({ id: 'a', date: '2026-11-04' }),
            entry({ id: 'b', date: '2026-11-03' }),
        ];
        expect(entriesOn(list, '2026-11-04').map((one) => one.id)).toEqual(['a']);
        expect(entriesOn(list, '2026-11-05')).toEqual([]);
    });
});

describe('收益：平分给多个角色', () => {
    /* 「记给」可以按多个号，一次分账写 N 条、金额平分。这里的每一条断言盯的都是
     * **总额**——平分错一分不会报错，只会让当天收入与手里实际进的钱对不上，
     * 而那种账攒上几十条之后就查不出是哪几条造成的。 */
    it('除不尽时尾差按币补给排在前面的人，总额一分不差', () => {
        expect(splitAmount(46000, 3)).toEqual([15334, 15333, 15333]);
        expect(splitAmount(46000, 3).reduce((sum, one) => sum + one, 0)).toBe(46000);
        expect(splitAmount(1000001, 3)).toEqual([333334, 333334, 333333]);
    });

    it('除得尽时每份相同', () => {
        expect(splitAmount(30000, 3)).toEqual([10000, 10000, 10000]);
        expect(splitAmount(46000, 2)).toEqual([23000, 23000]);
    });

    it('一个人与零个人都是原额一条（「不指定角色」走的就是这条）', () => {
        expect(splitAmount(46000, 1)).toEqual([46000]);
        expect(splitAmount(46000, 0)).toEqual([46000]);
        expect(splitAmount(46000, -2)).toEqual([46000]);
    });

    it('份数不会多于人数，且结果可复现', () => {
        const parts = splitAmount(7, 4);
        expect(parts).toHaveLength(4);
        expect(parts.reduce((sum, one) => sum + one, 0)).toBe(7);
        // 同一份输入两次算出同一个结果：随机分配在账本里是查不清账的。
        expect(splitAmount(7, 4)).toEqual(parts);
    });
});

describe('收益：记完的回执句', () => {
    const one = (amount: number): IncomeEntry => ({
        id: 'x',
        date: '2026-11-04',
        characterId: 'c1',
        kind: 'income',
        amount,
        item: '定魂珠',
        note: '',
        createdAt: 1,
    });

    it('单人时说金额，多人时说总额与份数', () => {
        expect(recordSummary('定魂珠', [one(46000)])).toBe('已记 定魂珠 · 4.6 万');
        expect(recordSummary('定魂珠', [one(23000), one(23000)])).toBe(
            '已记 定魂珠 · 4.6 万 → 2 个号平分',
        );
    });
});

describe('收益：今日按物品聚合', () => {
    function one(part: Partial<IncomeEntry> & { id: string }): IncomeEntry {
        return {
            date: '2026-11-04',
            characterId: '',
            kind: 'income',
            amount: 10000,
            item: '',
            note: '',
            createdAt: 1,
            ...part,
        };
    }

    it('同一件物品合成一格，`count` 就是界面上的 ×N', () => {
        const groups = groupByItem([
            one({ id: 'a', item: '定魂珠', amount: 46000, createdAt: 10 }),
            one({ id: 'b', item: '定魂珠', amount: 46000, createdAt: 20 }),
            one({ id: 'c', item: '定魂珠', amount: 46000, createdAt: 30 }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ name: '定魂珠', count: 3, total: 138000 });
        /* 撤销撤的必须是**最近**那一条：`lastId` 取 `createdAt` 最大的，不是数组里第一条。
         * 取错的表现是「点了撤，少掉的却是上午那条」，而两笔金额一样时肉眼看不出来。 */
        expect(groups[0].lastId).toBe('c');
    });

    it('同名的收入与支出不合并：合并会把两个方向抵消成 0', () => {
        const groups = groupByItem([
            one({ id: 'a', item: '金香玉', kind: 'income', amount: 15000 }),
            one({ id: 'b', item: '金香玉', kind: 'expense', amount: 15000 }),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.kind).sort()).toEqual(['expense', 'income']);
        expect(groups.every((g) => g.total === 15000)).toBe(true);
    });

    it('同名不同价分成两格：浮动价合成一格会印出一个不代表任何一条的数', () => {
        /* 2026-11-04 用户：「固定价格的可以 ×N，不固定的价格不同的就分开」。金币这类
         * 每条现填价，上午 4.6 万、下午 5.2 万——若只按名字聚合，那一格只能印一个价，
         * 而它既不是上午那条也不是下午那条。分开之后 `amount × count` 恒等于这一格。 */
        const groups = groupByItem([
            one({ id: 'a', item: '金币', amount: 46000 }),
            one({ id: 'b', item: '金币', amount: 52000 }),
            one({ id: 'c', item: '金币', amount: 52000 }),
        ]);

        expect(groups).toHaveLength(2);
        /* 条数降序：同价的 2 条在前，1 条在后。 */
        expect(groups[0]).toMatchObject({
            name: '金币',
            amount: 52000,
            count: 2,
            total: 104000,
        });
        expect(groups[1]).toMatchObject({
            name: '金币',
            amount: 46000,
            count: 1,
            total: 46000,
        });
    });

    it('按条数降序：点得最多的排最前，金额只用来定平手', () => {
        const groups = groupByItem([
            one({ id: '1', item: '舍利子', amount: 1280000 }),
            one({ id: '2', item: '定魂珠', amount: 46000 }),
            one({ id: '3', item: '定魂珠', amount: 46000 }),
        ]);

        expect(groups.map((g) => g.name)).toEqual(['定魂珠', '舍利子']);
        expect(groups[0].count).toBe(2);
    });

    it('空物品名归到「未记物品」，不漏记录', () => {
        /* 手记的账可以没有物品名。漏掉它会让右栏的条数与页头统计对不上——
         * 而「两边数字不一样」是最难查的一类问题。 */
        const groups = groupByItem([one({ id: 'a', item: '' })]);

        expect(groups).toHaveLength(1);
        expect(groups[0].name).toBe('未记物品');
        expect(groups[0].count).toBe(1);
    });

    it('记给过谁去重收集，未指定不占位', () => {
        /* 预格只有图标与 `×N`，「记给谁」只剩 `title` 与读屏标签这一处说得出口——
         * 而换号忘了切是这一页最典型的错，所以这串名字不能漏、也不能重复成
         * 「归ω岚、归ω岚、归ω岚」。 */
        const groups = groupByItem([
            one({ id: 'a', item: '定魂珠', characterId: 'c1' }),
            one({ id: 'b', item: '定魂珠', characterId: 'c1' }),
            one({ id: 'c', item: '定魂珠', characterId: 'c2' }),
            one({ id: 'd', item: '定魂珠', characterId: '' }),
        ]);

        expect(groups[0].whoIds).toEqual(['c1', 'c2']);
        expect(groups[0].count).toBe(4);
    });
});

/* 日期与金额的用例搬去了 `services/format.test.ts`——那些函数不再属于收益页。 */
