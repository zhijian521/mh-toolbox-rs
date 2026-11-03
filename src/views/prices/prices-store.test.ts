import { describe, expect, it, vi } from 'vitest';
import type { PriceItem, PriceItemDraft } from './prices';

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
        pricesLegacyImported: vi.fn(async () => true),
        /* 返回值写死成 `Promise<void>`：顺序断言要替换实现，而 `vi.fn(async () => undefined)`
         * 推导出的是 `Promise<undefined>`，两者不是同一个类型。 */
        pricesMarkLegacyImported: vi.fn(async (): Promise<void> => undefined),
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
        /* 这里与上一条正好相反：同一个 `addItem`，只因读档成功，就必须真的写。
         * 少了这条，一个「永远不写」的实现也能让上面两条全绿。 */
        expect(desktop.pricesSave).toHaveBeenCalledTimes(1);
        const saved = desktop.pricesSave.mock.calls[0][0];
        expect(saved.map((item) => item.name)).toEqual(['黑宝石']);
        expect(items.value).toHaveLength(1);
    });
});

describe('loadPrices：localStorage 迁移与读库的先后', () => {
    /*
     * 迁移块（`pricesLegacyImported` → 搬 → `pricesMarkLegacyImported`）必须**在读库之前**：
     * 顺序反过来，第一次启动时读到的还是空库，搬完的那份要等下一次启动才出现，
     * 而 `legacyImported` 标记已经写下去了——用户看到的是「数据搬丢了」。
     *
     * 这条用调用序列而不是「被调用过」来断言：只查 `toHaveBeenCalled` 的话，
     * 顺序整个反过来也照样绿。
     */
    it('先问迁移标记、再搬、最后才读库', async () => {
        const order: string[] = [];
        const desktop = host(async () => []);
        desktop.pricesLegacyImported = vi.fn(async () => {
            order.push('legacyImported');
            return false;
        });
        desktop.pricesMarkLegacyImported = vi.fn(async () => {
            order.push('markImported');
        });
        desktop.pricesLoad = vi.fn(async () => {
            order.push('load');
            return [];
        });

        await loadStore(desktop);

        expect(order).toEqual(['legacyImported', 'markImported', 'load']);
    });

    it('读库失败时，迁移标记照样写下去——标记说的是「搬过了」，与读成功与否无关', async () => {
        const desktop = host(async () => null);
        desktop.pricesLegacyImported = vi.fn(async () => false);

        const store = await loadStore(desktop);

        expect(desktop.pricesMarkLegacyImported).toHaveBeenCalledTimes(1);
        expect(store.usePrices().loadError.value).not.toBe('');
    });
});
