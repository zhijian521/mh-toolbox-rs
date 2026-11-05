import { describe, expect, it } from 'vitest';
import {
    amountText,
    countDeltaText,
    dayGroupsOf,
    entriesIn,
    entriesOn,
    factsOf,
    groupByItem,
    normalizeEntry,
    parseEntries,
    parsePrices,
    previousWindowOf,
    ratioText,
    recordSummary,
    splitAmount,
    statRowsOf,
    totalsOf,
    windowOf,
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
            /* 笔数要拆开：统计条的「31 笔 · 均 14.9 万」用的是**收入**笔数，
             * 拿总笔数去除收入合计，算出来是「每笔的平均」而不是「每笔收入」。 */
            incomeCount: 2,
            expenseCount: 2,
        });

        expect(totalsOf([entry({ id: 'x', kind: 'expense', amount: 50000 })]).net).toBe(-50000);
        expect(totalsOf([])).toEqual({
            income: 0,
            expense: 0,
            net: 0,
            count: 0,
            incomeCount: 0,
            expenseCount: 0,
        });
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

/* ============================ 统计条：范围窗口与四格 ============================
 * 2026-11-05 统计条改版（四枚压印签 + 每格副文 + 较上一档）。这里盯三类错：
 *   1. **窗口边界**——「近七天」含不含今天、「本月同期」是不是上月整月，差一天就同比错位；
 *   2. **算不出的情形**——上一档为 0、跨零、没有记录，必须落成「—」而不是一个假百分比；
 *   3. **副文口径**——笔均与占比用错分母（总笔数 vs 收入笔数）不会报错，只会让数看着像对的。
 */
describe('收益：范围窗口', () => {
    it('今天 / 近七天 / 本月各自的窗口', () => {
        const today = '2026-11-05';
        expect(windowOf('day', today)).toEqual({ from: '2026-11-05', to: '2026-11-05' });
        // 近七天 = 含今天的七天（10-30 到 11-05），不是「周一到今天」
        expect(windowOf('week', today)).toEqual({ from: '2026-10-30', to: '2026-11-05' });
        expect(windowOf('month', today)).toEqual({ from: '2026-11-01', to: '2026-11-05' });
    });

    it('上一档是同样长度、紧邻的一段', () => {
        const today = '2026-11-05';
        expect(previousWindowOf('day', today)).toEqual({ from: '2026-11-04', to: '2026-11-04' });
        // 最近七天之前的那七天：10-23 到 10-29，与当前窗口不重叠
        expect(previousWindowOf('week', today)).toEqual({ from: '2026-10-23', to: '2026-10-29' });
        // 本月只过到 5 号，就只比上月 1–5 号，不拿 5 天去比 30 天
        expect(previousWindowOf('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    });

    it('上月没有那一天时截到月末；跨年时退到去年 12 月', () => {
        // 3 月 31 日：2 月只有 28 天
        expect(previousWindowOf('month', '2026-03-31')).toEqual({
            from: '2026-02-01',
            to: '2026-02-28',
        });
        expect(previousWindowOf('month', '2026-01-15')).toEqual({
            from: '2025-12-01',
            to: '2025-12-15',
        });
    });

    it('按窗口筛记录，两端都含', () => {
        const one = (id: string, date: string): IncomeEntry => ({
            id,
            date,
            characterId: '',
            kind: 'income',
            amount: 10000,
            item: '',
            note: '',
            createdAt: 1,
        });
        const list = [
            one('a', '2026-10-22'),
            one('b', '2026-10-23'),
            one('c', '2026-10-29'),
            one('d', '2026-10-30'),
        ];
        expect(entriesIn(list, { from: '2026-10-23', to: '2026-10-29' }).map((x) => x.id)).toEqual([
            'b',
            'c',
        ]);
    });
});

describe('收益：较上一档的写法', () => {
    it('金额给百分比，一位小数，减号是 U+2212', () => {
        expect(ratioText(450, 400)).toBe('+12.5%');
        expect(ratioText(12, 100)).toBe('−88%');
        expect(ratioText(100, 100)).toBe('±0%');
    });

    it('上一档是 0 时给「—」，不编一个 +100%', () => {
        expect(ratioText(450, 0)).toBe('—');
        expect(ratioText(0, 0)).toBe('—');
    });

    it('跨零给「—」：净额由亏转盈，百分比没有意义', () => {
        expect(ratioText(6, -12)).toBe('—');
        // 亏损收窄：两侧同号，分母取绝对值，符号说「朝正方向走」
        expect(ratioText(-6, -12)).toBe('+50%');
    });

    it('笔数用差，不用百分比', () => {
        expect(countDeltaText(37, 31)).toBe('+6 笔');
        expect(countDeltaText(3, 5)).toBe('−2 笔');
        expect(countDeltaText(5, 5)).toBe('±0 笔');
    });
});

describe('收益：统计条四格', () => {
    const totals = {
        income: 4_625_000,
        expense: 123_000,
        net: 4_502_000,
        count: 37,
        incomeCount: 31,
        expenseCount: 6,
    };
    const prev = {
        income: 4_000_000,
        expense: 100_000,
        net: 3_900_000,
        count: 31,
        incomeCount: 26,
        expenseCount: 5,
    };

    it('副文用「收入笔数」当分母，笔均圆到千币', () => {
        const rows = statRowsOf(totals, prev, { names: 4, unassigned: 2 });
        expect(rows.map((one) => one.cap)).toEqual(['收入', '支出', '净额', '笔数']);
        expect(rows[0].value).toBe('462.5 万');
        expect(rows[0].sub).toBe('31 笔 · 均 14.9 万');
        expect(rows[0].delta).toBe('+15.6%');
        expect(rows[1].sub).toBe('6 笔 · 占收入 2.7%');
        expect(rows[1].delta).toBe('+23%');
        expect(rows[2].sub).toBe('结余率 97.3%');
        expect(rows[3].sub).toBe('4 个号 · 2 条未指定');
        expect(rows[3].delta).toBe('+6 笔');
    });

    it('一条都没归号时，笔数副文只说条数，不写「0 个号」', () => {
        const rows = statRowsOf(
            {
                income: 100_000,
                expense: 0,
                net: 100_000,
                count: 3,
                incomeCount: 3,
                expenseCount: 0,
            },
            null,
            { names: 0, unassigned: 3 },
        );
        expect(rows[3].sub).toBe('3 条未指定');
    });

    it('支出为 0 时读数是「—」，副文也是「—」', () => {
        const rows = statRowsOf(
            {
                income: 100_000,
                expense: 0,
                net: 100_000,
                count: 2,
                incomeCount: 2,
                expenseCount: 0,
            },
            {
                income: 100_000,
                expense: 0,
                net: 100_000,
                count: 2,
                incomeCount: 2,
                expenseCount: 0,
            },
            { names: 1, unassigned: 0 },
        );
        expect(rows[1].value).toBe('—');
        expect(rows[1].sub).toBe('—');
        expect(rows[1].delta).toBe('—');
    });

    it('整段没有记录时四格的副文与对比全是「—」，净额仍带符号', () => {
        const rows = statRowsOf(
            { income: 0, expense: 50_000, net: -50_000, count: 1, incomeCount: 0, expenseCount: 1 },
            null,
            { names: 0, unassigned: 1 },
        );
        expect(rows[0].value).toBe('—');
        expect(rows[0].sub).toBe('—');
        expect(rows[0].delta).toBe('—');
        // 净额没有收入可比，结余率给「—」；读数仍必须有负号
        expect(rows[2].value).toBe('−5 万');
        expect(rows[2].sub).toBe('—');
        expect(rows[2].tone).toBe('loss');
    });
});

describe('收益：这一组账涉及几个号', () => {
    it('去重后数角色，没指定角色的单独计条数', () => {
        const one = (id: string, characterId: string): IncomeEntry => ({
            id,
            date: '2026-11-05',
            characterId,
            kind: 'income',
            amount: 10000,
            item: '',
            note: '',
            createdAt: 1,
        });
        expect(factsOf([one('a', 'c1'), one('b', 'c1'), one('c', 'c2'), one('d', '')])).toEqual({
            names: 2,
            unassigned: 1,
        });
        expect(factsOf([])).toEqual({ names: 0, unassigned: 0 });
    });
});
