import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceItem } from '../prices/prices';
import type { IncomeEntry } from './income';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

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
        pricesLoad: vi.fn(async () => []),
        pricesSave: vi.fn(async () => true),
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
    await import('../../services/game-data.fixture');
    const store = await import('./income-store');
    const market = await import('../prices/prices-store');
    await market.loadPrices();
    await store.loadIncome();
    return store;
}

/** 排队的写入落在微任务里，让出一个宏任务再断言（与 `prices-store.test.ts` 同一条理由）。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const EMPTY = { entries: [], prices: [] };

describe('loadIncome：读失败不等于空账', () => {
    it.each([{}, [null], [{ itemId: 1, price: 0 }]].map((prices) => ({ prices })))(
        '浏览器单价损坏时拒绝覆盖：%j',
        async ({ prices }) => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const setItem = vi.fn();
            vi.stubGlobal('localStorage', {
                getItem: () => JSON.stringify({ entries: [], prices }),
                setItem,
            });
            const store = await loadStore({ ...host(async () => EMPTY), hasDesktop: () => false });
            expect(store.useIncome().loadError.value).not.toBe('');
            expect(store.recordEntry({ item: '黑宝石', amount: 150_000 }).ok).toBe(false);
            expect(setItem).not.toHaveBeenCalled();
        },
    );

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
    it('速记指定人单选，换人后整笔归新角色，清空后归不指定', async () => {
        const store = await loadStore(host(async () => EMPTY));
        const { setTarget, target, recordEntry } = store.useIncome();

        setTarget(['a', 'b']);
        expect(target.value).toEqual(['a']);
        const first = recordEntry({ item: '黑宝石', amount: 1001 });
        expect(first.ok && first.entries.map((one) => [one.characterId, one.amount])).toEqual([
            ['a', 1001],
        ]);

        setTarget(['b']);
        const second = recordEntry({ item: '黑宝石', amount: 1001 });
        expect(second.ok && second.entries.map((one) => [one.characterId, one.amount])).toEqual([
            ['b', 1001],
        ]);

        setTarget([]);
        const unassigned = recordEntry({ item: '黑宝石', amount: 1001 });
        expect(target.value).toEqual([]);
        expect(
            unassigned.ok && unassigned.entries.map((one) => [one.characterId, one.amount]),
        ).toEqual([['', 1001]]);
        await flush();
    });

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

async function loadLinkedStore(
    options: {
        cards?: PriceItem[];
        quick?: { itemId: number; price: number }[];
        incomeFirst?: boolean;
        rulesReady?: boolean;
    } = {},
) {
    vi.resetModules();
    let savedCards = options.cards ?? [];
    let savedIncome = { entries: [] as IncomeEntry[], prices: options.quick ?? [] };
    const desktop = {
        hasDesktop: () => true,
        pricesLoad: vi.fn(async (): Promise<PriceItem[] | null> => savedCards),
        pricesSave: vi.fn(async (cards: PriceItem[]) => {
            savedCards = cards;
            return true;
        }),
        incomeLoad: vi.fn(async (): Promise<typeof savedIncome | null> => savedIncome),
        incomeSave: vi.fn(async (payload: typeof savedIncome) => {
            savedIncome = payload;
            return true;
        }),
    };
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    await import('../../services/game-data.fixture');
    const { gameDataReady, quickItems } = await import('../../services/game-data');
    gameDataReady.value = options.rulesReady ?? true;
    const incomeModule = await import('./income-store');
    const pricesModule = await import('../prices/prices-store');
    const models = await import('../prices/prices');
    const load = async () => {
        if (options.incomeFirst) {
            await incomeModule.loadIncome();
            await pricesModule.loadPrices();
        } else {
            await pricesModule.loadPrices();
            await incomeModule.loadIncome();
        }
    };
    await load();
    return {
        income: incomeModule.useIncome(),
        market: pricesModule.usePrices(),
        incomeModule,
        pricesModule,
        fixed: quickItems().fixed,
        gameDataReady,
        models,
        desktop,
        load,
    };
}

describe('收益固定单价与物价卡片联动', () => {
    it('游戏物品表晚于账本就绪时，仍会补建已有单价的卡片', async () => {
        const { income, market, gameDataReady } = await loadLinkedStore({
            quick: [{ itemId: 1, price: 123_400 }],
            rulesReady: false,
        });
        expect(market.items.value).toEqual([]);
        gameDataReady.value = true;
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].points[0].price).toBe(123_400);
        await income.flush();
    });

    it.each([true, false])('已有单价补建卡片，兼容两种加载顺序：%s', async (incomeFirst) => {
        const { income, market, fixed } = await loadLinkedStore({
            quick: [{ itemId: 1, price: 123_400 }],
            incomeFirst,
        });
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].name).toBe(fixed[0].name);
        expect(market.items.value[0].points[0].price).toBe(123_400);
        expect(income.prices.value[1]).toBe(123_400);
        await income.flush();
    });

    it('设置、重设与改价复用同一卡片，保留历史且同价不重复记录', async () => {
        const { income, market, fixed, load } = await loadLinkedStore();
        const item = fixed[0];
        expect(income.setPrice(item.id, 12.34)).toBe(true);
        const id = market.items.value[0].id;
        expect(income.setPrice(item.id, 12.34)).toBe(true);
        expect(market.items.value[0].points).toHaveLength(1);
        expect(income.setPrice(item.id, 15)).toBe(true);
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].id).toBe(id);
        expect(market.items.value[0].points.map((point) => point.price)).toEqual([
            123_400,
            150_000,
        ]);
        expect(await income.flush()).toBe(true);
        await load();
        expect(income.prices.value[item.id]).toBe(150_000);
        expect(market.items.value[0].points).toHaveLength(2);
    });

    it('首次同名行情优先于旧固定价，不重复建卡或追加历史', async () => {
        const { income, market, fixed, desktop, incomeModule } = await loadLinkedStore();
        const item = fixed[0];
        income.setPrice(item.id, 10);
        await income.flush();
        desktop.incomeLoad.mockResolvedValueOnce({
            entries: [],
            prices: [{ itemId: item.id, price: 200_000 }],
        });
        await incomeModule.loadIncome();
        expect(income.prices.value[item.id]).toBe(100_000);
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].points).toHaveLength(1);
        await income.flush();
    });

    it('导入固定单价批量建卡，原样再导不追加行情', async () => {
        const { income, market, fixed, desktop } = await loadLinkedStore();
        const rows = fixed.slice(0, 2).map((item, index) => ({
            itemId: item.id,
            price: (index + 1) * 100_000,
        }));
        expect(income.mergePrices(rows)).toEqual({ ok: true, added: 2, updated: 0, unchanged: 0 });
        await income.flush();
        expect(market.items.value.map((item) => item.name)).toEqual(
            fixed.slice(0, 2).map((item) => item.name),
        );
        expect(desktop.pricesSave).toHaveBeenCalledTimes(1);
        expect(income.mergePrices(rows)).toEqual({ ok: true, added: 0, updated: 0, unchanged: 2 });
        expect(market.items.value.map((item) => item.points.length)).toEqual([1, 1]);
        await income.flush();
        expect(desktop.pricesSave).toHaveBeenCalledTimes(1);
    });

    it('同名卡片保留分类和历史，更新与删价按当前记录回写，补记旧日不覆盖', async () => {
        const { income, market, fixed, models } = await loadLinkedStore();
        const item = fixed[0];
        const draft = { name: item.name, category: '其他', sub: '自定义', note: '保留备注' };
        const created = market.addItem(draft, 100_000);
        if (!created.ok) throw new Error(created.error);
        expect(income.setPrice(item.id, 15)).toBe(true);
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].note).toBe('保留备注');
        const currentDate = models.currentPoint(market.items.value[0])!.date;
        market.addPoint(created.id, { date: '2000-01-01', price: 90_000, note: '' });
        expect(income.prices.value[item.id]).toBe(150_000);
        market.addPoint(created.id, { date: currentDate, price: 200_000, note: '' });
        const current = models.currentPoint(market.items.value[0])!;
        expect(income.prices.value[item.id]).toBe(200_000);
        market.savePoint(created.id, current.id, { date: currentDate, price: 180_000, note: '' });
        expect(income.prices.value[item.id]).toBe(180_000);
        market.removePoint(created.id, current.id);
        expect(income.prices.value[item.id]).toBe(150_000);
        await income.flush();
    });

    it('删除卡片或最后一笔行情清空固定价，重载不会补回已删卡片', async () => {
        const { income, market, fixed, load } = await loadLinkedStore();
        const item = fixed[0];
        income.setPrice(item.id, 10);
        const card = market.items.value[0];
        market.removePoint(card.id, card.points[0].id);
        expect(income.prices.value[item.id]).toBeUndefined();
        expect(market.items.value).toHaveLength(1);
        income.setPrice(item.id, 20);
        market.removeItem(card.id);
        expect(income.prices.value[item.id]).toBeUndefined();
        await income.flush();
        await load();
        expect(income.prices.value[item.id]).toBeUndefined();
        expect(market.items.value).toEqual([]);
    });

    it('清除固定价保留历史，重载后仍未设价，再记同价也能重新同步', async () => {
        const { income, market, fixed, load, models } = await loadLinkedStore();
        const item = fixed[0];
        income.setPrice(item.id, 10);
        income.clearPrice(item.id);
        await income.flush();
        await load();
        expect(income.prices.value[item.id]).toBeUndefined();
        const card = market.items.value[0];
        expect(card.points).toHaveLength(1);
        market.addPoint(card.id, {
            date: models.currentPoint(card)!.date,
            price: 100_000,
            note: '',
        });
        expect(income.prices.value[item.id]).toBe(100_000);
        await income.flush();
    });

    it('任一卡片已满时，批量导入和手动改价都保留原数据', async () => {
        const { income, market, fixed, models } = await loadLinkedStore();
        const item = fixed[0];
        income.setPrice(item.id, 10);
        const card = market.items.value[0];
        for (let index = card.points.length; index < models.POINT_LIMIT; index++) {
            market.addPoint(card.id, { date: '2000-01-01', price: index + 1, note: '' });
        }
        const before = JSON.stringify(market.items.value);
        const merged = income.mergePrices([
            { itemId: fixed[1].id, price: 300_000 },
            { itemId: item.id, price: 200_000 },
        ]);
        expect(merged.ok).toBe(false);
        expect(income.prices.value[item.id]).toBe(100_000);
        expect(income.prices.value[fixed[1].id]).toBeUndefined();
        expect(JSON.stringify(market.items.value)).toBe(before);
        expect(income.setPrice(item.id, 20)).toBe(false);
        await income.retry();
    });

    it('收益或物价重读失败时不跨领域修改，恢复读取后重新对齐', async () => {
        const { income, market, fixed, pricesModule, incomeModule, desktop } =
            await loadLinkedStore();
        const item = fixed[0];
        income.setPrice(item.id, 10);
        await income.flush();
        desktop.pricesLoad.mockResolvedValueOnce(null);
        await pricesModule.loadPrices();
        expect(income.setPrice(item.id, 20)).toBe(false);
        expect(income.prices.value[item.id]).toBe(100_000);
        await pricesModule.loadPrices();
        desktop.incomeLoad.mockResolvedValueOnce(null);
        await incomeModule.loadIncome();
        const card = market.items.value[0];
        const point = { date: card.points[0].date, price: 150_000, note: '' };
        expect(market.addPoint(card.id, point).ok).toBe(false);
        expect(market.savePoint(card.id, card.points[0].id, point).ok).toBe(false);
        expect(market.removePoint(card.id, card.points[0].id).ok).toBe(false);
        expect(market.removeItem(card.id).ok).toBe(false);
        expect(
            market.saveItem(card.id, {
                name: '已改名',
                category: card.category,
                sub: card.sub,
                note: '',
            }).ok,
        ).toBe(false);
        expect(
            market.addItem({ name: fixed[1].name, category: card.category, sub: '', note: '' }, 1).ok,
        ).toBe(false);
        expect(market.items.value).toHaveLength(1);
        expect(market.items.value[0].points).toHaveLength(1);
        expect(income.prices.value[item.id]).toBe(100_000);
        expect(
            market.addItem({ name: '独立行情', category: card.category, sub: '', note: '' }, 1).ok,
        ).toBe(true);
        await incomeModule.loadIncome();
        expect(market.addPoint(card.id, point).ok).toBe(true);
        expect(income.prices.value[item.id]).toBe(150_000);
        await income.flush();
    });

    it('收益保存等待物价落盘，失败可重试且不会重复追加行情', async () => {
        const { income, market, fixed, desktop } = await loadLinkedStore();
        desktop.pricesSave.mockResolvedValueOnce(false);
        expect(income.setPrice(fixed[0].id, 10)).toBe(true);
        expect(await income.flush()).toBe(false);
        expect(income.writeError.value).not.toBe('');
        expect(await income.retry()).toBe(true);
        expect(await income.flush()).toBe(true);
        expect(market.items.value[0].points).toHaveLength(1);
    });

    it('物价保存同样等待收益落盘，失败后从物价页可重试', async () => {
        const { income, market, fixed, desktop } = await loadLinkedStore();
        income.setPrice(fixed[0].id, 10);
        await income.flush();
        desktop.incomeSave.mockResolvedValueOnce(false);
        const card = market.items.value[0];
        market.addPoint(card.id, { date: card.points[0].date, price: 150_000, note: '' });
        expect(await market.flush()).toBe(false);
        expect(market.writeError.value).not.toBe('');
        expect(await market.retry()).toBe(true);
        expect(await market.flush()).toBe(true);
        expect(income.prices.value[fixed[0].id]).toBe(150_000);
    });
});
