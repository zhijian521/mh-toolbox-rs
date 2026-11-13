import { describe, expect, it } from 'vitest';
import {
    ACCOUNT_CATEGORIES,
    CHANNELS,
    CURRENCY_META,
    SHORTCUTS,
    accountStats,
    newestFirst,
    normalizeEntry,
    parseAccounts,
    rangeOf,
    type AccountEntry,
} from './accounts';

/**
 * 账号页的纯函数。
 *
 * 断的是**新版自己的期望**，不与旧仓比对（`ARCHITECTURE.md` §5：旧仓是参考读物）。
 * 日期一律注入，不读真实时钟——否则跨午夜跑会随机红一条。
 */

const TODAY = '2026-11-05';

function entry(patch: Partial<AccountEntry> = {}): AccountEntry {
    return {
        id: 'a1',
        date: TODAY,
        characterId: '',
        kind: 'expense',
        currency: 'rmb',
        category: '点卡充值',
        channel: '官方充值',
        amount: 30,
        note: '',
        createdAt: 1,
        /* 空串 = 手记。夹具必须显式给：`source` 是必填字段，漏了就是类型错，
         * 而这类错只会在 `vue-tsc` 里露头，跑测试时它是 `undefined`。 */
        source: '',
        ...patch,
    };
}

describe('normalizeEntry', () => {
    it('正常一条原样收下', () => {
        const one = normalizeEntry(entry());
        expect(one?.id).toBe('a1');
        expect(one?.currency).toBe('rmb');
        expect(one?.amount).toBe(30);
    });

    it('日期不合格式就丢', () => {
        expect(normalizeEntry(entry({ date: '2026/11/05' }))).toBeNull();
        expect(normalizeEntry(entry({ date: '2026-11' }))).toBeNull();
    });

    it('金额为 0 或负就丢：那会让合计直接算错', () => {
        expect(normalizeEntry(entry({ amount: 0 }))).toBeNull();
        expect(normalizeEntry(entry({ amount: -5 }))).toBeNull();
    });

    it('币种认不出就丢——单位差一万倍，不能猜', () => {
        expect(normalizeEntry({ ...entry(), currency: 'usd' })).toBeNull();
        expect(normalizeEntry({ ...entry(), currency: undefined })).toBeNull();
    });

    it('人民币收到分、梦幻币收到整数', () => {
        expect(normalizeEntry(entry({ amount: 30.456 }))?.amount).toBe(30.46);
        expect(normalizeEntry(entry({ amount: 46000.7, currency: 'cash' }))?.amount).toBe(46001);
    });

    it('缺分类 / 缺渠道时给兜底值，不让界面上出现空格', () => {
        const one = normalizeEntry({ ...entry(), category: '', channel: '' });
        expect(one?.category).toBe('其他收支');
        expect(one?.channel).toBe('其他');
    });

    it('方向认不出时按收入算——与收益页同一条兜底，两个页面不设两套规则', () => {
        expect(normalizeEntry({ ...entry(), kind: 'weird' })?.kind).toBe('income');
    });
});

describe('parseAccounts', () => {
    it('坏的丢掉、好的留下', () => {
        const list = parseAccounts([
            entry({ id: 'ok1' }),
            { id: 'bad', date: 'nope' },
            entry({ id: 'ok2', amount: 100 }),
        ]);
        expect(list.map((one) => one.id)).toEqual(['ok1', 'ok2']);
    });

    it('不是数组就是空表', () => {
        expect(parseAccounts(null)).toEqual([]);
        expect(parseAccounts({ entries: [] })).toEqual([]);
    });
});

describe('accountStats', () => {
    it('只数本币种：两本账从不相加', () => {
        const list = [
            entry({ id: 'a', kind: 'income', amount: 100 }),
            entry({ id: 'b', kind: 'expense', amount: 30 }),
            entry({ id: 'c', kind: 'income', currency: 'cash', amount: 46000 }),
        ];

        expect(accountStats(list, 'rmb')).toEqual({
            income: 100,
            expense: 30,
            net: 70,
            count: 2,
        });
        expect(accountStats(list, 'cash')).toEqual({
            income: 46000,
            expense: 0,
            net: 46000,
            count: 1,
        });
    });

    it('净额可为负，且不等于「收支都取正」', () => {
        const list = [entry({ kind: 'expense', amount: 500 })];
        expect(accountStats(list, 'rmb').net).toBe(-500);
    });

    it('空表是四个 0，不是 undefined', () => {
        expect(accountStats([], 'rmb')).toEqual({ income: 0, expense: 0, net: 0, count: 0 });
    });
});

describe('newestFirst', () => {
    it('日期倒序；同一天里后记的在前', () => {
        const list = [
            entry({ id: 'a', date: '2026-11-01', createdAt: 1 }),
            entry({ id: 'b', date: TODAY, createdAt: 5 }),
            entry({ id: 'c', date: TODAY, createdAt: 9 }),
        ];

        expect(newestFirst(list).map((one) => one.id)).toEqual(['c', 'b', 'a']);
    });

    it('不改原数组', () => {
        const list = [entry({ id: 'a', date: '2026-11-01' }), entry({ id: 'b' })];
        const sorted = newestFirst(list);
        expect(sorted).not.toBe(list);
        expect(list[0].id).toBe('a');
    });
});

describe('rangeOf', () => {
    it('本月从 1 号到今天', () => {
        expect(rangeOf('month', TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
    });

    it('近七天含今天在内的七格', () => {
        // 10-30 到 11-05 正好七天（含两端）。
        expect(rangeOf('week', TODAY)).toEqual({ from: '2026-10-30', to: TODAY });
    });

    it('月初的近七天跨回上个月', () => {
        expect(rangeOf('week', '2026-11-02')).toEqual({ from: '2026-10-27', to: '2026-11-02' });
    });

    it('全部是空串（不限两端）', () => {
        expect(rangeOf('all', TODAY)).toEqual({ from: '', to: '' });
    });

    it('月份补零：1 月是 01 而不是 1', () => {
        expect(rangeOf('month', '2026-01-09')).toEqual({ from: '2026-01-01', to: '2026-01-09' });
    });
});

describe('SHORTCUTS', () => {
    it('id 不重复', () => {
        const ids = SHORTCUTS.map((one) => one.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('每条的 category 与 channel 都在常量表里', () => {
        // 拼错一个字（「藏宝阁」写成「藏宝阁 」）不会报错，只会让这一类的筛选永远空。
        for (const one of SHORTCUTS) {
            expect(ACCOUNT_CATEGORIES).toContain(one.preset.category);
            expect(CHANNELS).toContain(one.preset.channel);
        }
    });

    it('两种币种都有入口，否则有一本账记不进去', () => {
        const currencies = new Set(SHORTCUTS.map((one) => one.preset.currency));
        expect(currencies).toEqual(new Set(['rmb', 'cash']));
    });

    it('收入与支出都有入口', () => {
        const kinds = new Set(SHORTCUTS.map((one) => one.preset.kind));
        expect(kinds).toEqual(new Set(['income', 'expense']));
    });
});

describe('CURRENCY_META', () => {
    it('人民币按元、梦幻币按万', () => {
        expect(CURRENCY_META.rmb.unit).toBe('元');
        expect(CURRENCY_META.cash.unit).toBe('万');
    });
});
