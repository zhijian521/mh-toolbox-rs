import { describe, expect, it, vi } from 'vitest';

/**
 * `income-store.ts` 的**读失败闸门 + 分账**。
 *
 * 物价表与名册各有一份同类测试（`prices-store.test.ts` / `roster.test.ts` 尾部），
 * 收益账一直没有——而它是**写入最密的一页**：速记的全部用法就是连点，
 * 每次写都是整份。读失败时若把它当成「空账」，用户点一下就把整年流水覆盖成一条。
 *
 * 断言分两组：
 *   ① 读失败：立错误位、内存清空、**一个字节都不写**，且下一次读成功要能恢复；
 *   ② 分账：记给 N 个号就写 N 条、金额平分、**总额与只记一个号时相等**。
 *
 * `vi.doMock` + `vi.resetModules()` 而不是顶层 `vi.mock`：`entries` / `prices` /
 * `loadError` 都是模块级单例，每条用例必须拿一份全新的，否则上一条的 `loadError`
 * 会让下一条的「成功路径」假绿。
 */

/** 装一份「桌面版」宿主，读档内容由参数决定。 */
function host(load: () => Promise<unknown>) {
    return {
        hasDesktop: () => true,
        incomeLoad: vi.fn(load),
        /* 入参类型不写出来是为了不被 `IncomePayload` 的字段牵着走：
         * 这条用例关心的是「写了几次、写进去几条」，不是形状。 */
        incomeSave: vi.fn(async () => true),
    };
}

/** 让 `income-store` 在给定宿主下跑一次 `loadIncome()`。 */
async function loadStore(desktop: ReturnType<typeof host>) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    const store = await import('./income-store');
    await store.loadIncome();
    return store;
}

/** 排队的写入落在微任务里，让出一个宏任务再断言（与 `prices-store.test.ts` 同一条理由）。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const EMPTY = { entries: [], prices: [] };

describe('loadIncome：读失败不等于空账', () => {
    it('incomeLoad 返回 null：立错误位、账清空、一次都不写', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { entries, prices, loadError } = store.useIncome();

        expect(entries.value).toEqual([]);
        expect(prices.value).toEqual({});
        expect(loadError.value).not.toBe('');
        expect(desktop.incomeSave).not.toHaveBeenCalled();
    });

    it('读失败时速记、改价、合并单价、删除都拒绝，且不落盘', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { recordEntry, setPrice, mergePrices, removeEntry, entries } = store.useIncome();

        /* 与物价页不同，这一页在**函数入口**就拒绝：返回 `ok: false` 让界面弹红字，
         * 而不是「假装记上了但没写」。速记没有「内存里先加一条」的理由——
         * 它会立刻显示在今日清单上，看起来就是记成了。 */
        const write = recordEntry({ item: '黑宝石', amount: 150_000 });
        expect(write.ok).toBe(false);
        expect(entries.value).toEqual([]);
        expect(setPrice(1, 10)).toBe(false);
        expect(mergePrices([{ itemId: 1, price: 100 }]).ok).toBe(false);
        removeEntry('whatever');

        await flush();
        expect(desktop.incomeSave).not.toHaveBeenCalled();
    });

    it('下一轮读到数据时闸要放开——错误位清空，写入恢复', async () => {
        const desktop = host(async () => EMPTY);
        const store = await loadStore(desktop);
        const { recordEntry, loadError } = store.useIncome();

        expect(loadError.value).toBe('');
        expect(recordEntry({ item: '黑宝石', amount: 150_000 }).ok).toBe(true);
        await flush();
        /* 少了这条，一个「永远不写」的实现也能让上面两条全绿。 */
        expect(desktop.incomeSave).toHaveBeenCalledTimes(1);
    });
});

describe('速记：记给几个号就写几条', () => {
    it('两个号平分，尾差给排在前面的那个，总额不变', async () => {
        const desktop = host(async () => EMPTY);
        const store = await loadStore(desktop);
        const { recordEntry, entries } = store.useIncome();

        const write = recordEntry({
            item: '黑宝石',
            amount: 1001,
            characterIds: ['a', 'b'],
        });
        expect(write.ok).toBe(true);
        expect(entries.value.map((one) => one.amount)).toEqual([501, 500]);
        expect(entries.value.map((one) => one.characterId)).toEqual(['a', 'b']);
        /* 总额必须与「只记一个号」时完全相等：多选改变的是**记在谁头上**，
         * 不是「赚了多少」。这条一破，收益页的日合计就会随选人数量浮动。 */
        expect(entries.value.reduce((sum, one) => sum + one.amount, 0)).toBe(1001);
    });

    it('不指定角色时只有一条，`characterId` 是空串', async () => {
        const desktop = host(async () => EMPTY);
        const store = await loadStore(desktop);
        const { recordEntry, entries } = store.useIncome();

        recordEntry({ item: '摊位收入', amount: 4000 });
        expect(entries.value).toHaveLength(1);
        expect(entries.value[0].characterId).toBe('');
    });

    it('0.4 万这种值在取整后是 0，直接拒绝（否则记上了又被读档丢掉）', async () => {
        const desktop = host(async () => EMPTY);
        const store = await loadStore(desktop);
        const { recordEntry, entries } = store.useIncome();

        /* 反过来的写法是「先判 > 0 再取整」：0.4 过关、落成 0，而 0 在 `normalizeEntry`
         * 里是「丢掉」——用户点了、提示说记上了、重启后那条不见了。 */
        const write = recordEntry({ item: '零头', amount: 0.4 });
        expect(write.ok).toBe(false);
        expect(entries.value).toEqual([]);
    });
});

describe('mergePrices：同一件以文件为准，文件里没有的保持现状', () => {
    it('已有的算更新，没有的算新增，未提到的保留', async () => {
        const desktop = host(async () => ({
            entries: [],
            prices: [
                { itemId: 1, price: 100 },
                { itemId: 9, price: 900 },
            ],
        }));
        const store = await loadStore(desktop);
        const { mergePrices, prices } = store.useIncome();

        const result = mergePrices([
            { itemId: 1, price: 200 },
            { itemId: 2, price: 300 },
        ]);
        expect(result).toEqual({ ok: true, added: 1, updated: 1, unchanged: 0 });
        expect(prices.value).toEqual({ 1: 200, 2: 300, 9: 900 });
    });

    it('可空价与非法 id 被跳过；一条都不剩时报错且不写', async () => {
        const desktop = host(async () => ({ entries: [], prices: [{ itemId: 1, price: 100 }] }));
        const store = await loadStore(desktop);
        const { mergePrices, prices } = store.useIncome();

        /* `QuickPrice.price` 在生成的类型里是 `number | null`（specta 把 f64 映射成可空，
         * NaN / Infinity 走 null 过 IPC），所以这一层必须挡，不能直接赋给 `Record<number, number>`。 */
        const result = mergePrices([
            { itemId: 3, price: null },
            { itemId: -1, price: 50 },
        ]);
        expect(result.ok).toBe(false);
        expect(prices.value).toEqual({ 1: 100 });
        await flush();
        expect(desktop.incomeSave).not.toHaveBeenCalled();
    });

    it('只写一次：导 59 条不是 59 次事务', async () => {
        const desktop = host(async () => EMPTY);
        const store = await loadStore(desktop);
        const { mergePrices } = store.useIncome();

        mergePrices(
            Array.from({ length: 59 }, (_, index) => ({ itemId: index + 1, price: 100 + index })),
        );
        await flush();
        /* 逐条 `setPrice` 会写 59 次，中途失败还会留半截价目表。 */
        expect(desktop.incomeSave).toHaveBeenCalledTimes(1);
    });
});

describe('单价原样导入', () => {
    it('相同价格不算覆盖，也不写数据库', async () => {
        const desktop = host(async () => ({ entries: [], prices: [{ itemId: 1, price: 100 }] }));
        const store = await loadStore(desktop);
        expect(store.mergePrices([{ itemId: 1, price: 100 }])).toEqual({
            ok: true,
            added: 0,
            updated: 0,
            unchanged: 1,
        });
        await store.useIncome().flush();
        expect(desktop.incomeSave).not.toHaveBeenCalled();
    });
});
