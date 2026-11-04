import { describe, expect, it, vi } from 'vitest';
import { type PriceItem, type PriceItemDraft } from './prices';

/**
 * `prices-store.ts` 的**读失败闸门**。
 *
 * 这个文件此前一条测试都没有，而它是物价表唯一的写入口。失败方式很具体：
 * `pricesLoad()` 的契约是「`null` = 没有宿主或调用失败」，早先这里写 `(stored ?? [])`，
 * 把「读不出来」当成了「库是空的」——界面显示一张空表、没有任何红字，用户随手记一笔，
 * `persist()` 就拿着这份空表整份覆盖，原来的物价表没了，而且看不出是什么时候没的。
 *
 * 所以断言全部围绕两件事：① 读失败时**一个字节都不写**；② 读失败**不能把闸焊死**
 * ——下一次真读到了，写入必须恢复，否则修复本身成了新的数据损失（记什么都存不下去）。
 *
 * 早先还有两组「`localStorage` 迁移块的调用顺序 / 三态标记」的用例，随老版本兼容
 * 一起删了（2026-11-04：新应用不接老数据，`loadPrices` 只剩「读库 → 规范化」）。
 *
 * `vi.doMock` + `vi.resetModules()` 而不是顶层 `vi.mock`：`prices` / `prices-store` 都是
 * 模块级单例（`items` / `loadError` / `writeError`），必须每条用例拿一份全新的，
 * 否则上一条留下的 `loadError` 会让下一条的「成功路径」假红或假绿。
 */

const DRAFT: PriceItemDraft = { name: '黑宝石', category: '宝石符石', sub: '宝石', note: '' };

/** 装一份「桌面版」宿主，读档结果由 `load` 决定。 */
function host(load: () => Promise<unknown[] | null>) {
    return {
        hasDesktop: () => true,
        pricesLoad: vi.fn(load),
        /* 入参类型写出来不是为了严格，是为了 `mock.calls` 可读：
         * 裸 `vi.fn()` 的 calls 是 `[][]`，断言「写进去的是哪一件」时拿不到字段。 */
        pricesSave: vi.fn(async (_items: PriceItem[]) => true),
    };
}

/** 让 `prices-store` 在给定宿主下跑一次 `loadPrices()`，返回新模块与宿主。 */
async function loadStore(desktop: ReturnType<typeof host>) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    const store = await import('./prices-store');
    await store.loadPrices();
    return store;
}

describe('loadPrices：读失败不等于空库', () => {
    it('pricesLoad 返回 null：立错误位、表为空、一个字都不写', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { items, loadError } = store.usePrices();

        expect(items.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.pricesSave).not.toHaveBeenCalled();
    });

    it('读失败之后记一笔也不落库（persist 的闸真的生效）', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { items, addItem, loadError } = store.usePrices();

        const result = addItem(DRAFT, 1200);
        /* 返回 `ok: true` 是有意的：内存里确实加进去了，界面要能响应；
         * 但底层拒绝写——所以界面上那条 `loadError` 红字是用户唯一的凭据。 */
        expect(result.ok).toBe(true);
        expect(items.value).toHaveLength(1);
        expect(desktop.pricesSave).not.toHaveBeenCalled();
        expect(loadError.value).not.toBe('');
    });

    it('下一轮读到数据时闸必须放开——错误位清空，写入恢复', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { items, addItem, loadError } = store.usePrices();

        expect(loadError.value).toBe('');
        addItem(DRAFT, 1200);
        /* 让出一个宏任务再断言。写入是**排队发起**的（`createPersist` 那条链），调用
         * 落在微任务里，不再像第 97 批之前那样同步发生。这里不是「等它写完」——
         * `pricesSave` 被调用的那一刻入参就已确定，不必等它 resolve。
         * 用 `setTimeout` 而不是 `Promise.resolve()`：将来链上再加一层 `then`，
         * 一个微任务就等不到了，而这条用例会从「闸焊死」假红成别的东西。 */
        await new Promise((resolve) => setTimeout(resolve, 0));
        /* 这里与上一条正好相反：同一个 `addItem`，只因读档成功，就必须真的写。
         * 少了这条，一个「永远不写」的实现也能让上面两条全绿。 */
        expect(desktop.pricesSave).toHaveBeenCalledTimes(1);
        const saved = desktop.pricesSave.mock.calls[0][0];
        expect(saved.map((item) => item.name)).toEqual(['黑宝石']);
        expect(items.value).toHaveLength(1);
    });
});
