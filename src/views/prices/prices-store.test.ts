import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, type PriceItem, type PriceItemDraft } from './prices';

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

/**
 * `pricesLegacyImported()` 返回 `null`：**问不出来，不等于没搬过**。
 *
 * 这是 2026-11-04 那批修复里最容易悄悄退回去的一处。签名从 `Promise<boolean>` 放宽到
 * `Promise<boolean | null>` 之后，调用方必须写 `=== false` 而不是 `!`——写成 `!` 的话
 * `null` 会走进迁移分支，拿 `localStorage` 里陈年的快照整份覆盖库。
 *
 * 所以断言不只看「有没有写」，还要**造出一个真会写进去的局面**：node 默认没有
 * `localStorage`（`readPriceItems()` 读到 `null`，搬也搬不出东西），那样即便代码错了
 * 测试也是绿的。这里装一个最小的 localStorage 并在里面放一份旧物价表——只要迁移分支被
 * 走进去，`pricesSave` 就一定会被调到。
 */
describe('loadPrices：迁移标记问不出来（null）时不搬、不覆盖', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** 老版本留在 localStorage 里的那一份。字段齐全，好让它在迁移时真的能写进库。 */
    const LEGACY: PriceItem[] = [
        {
            id: 'legacy-1',
            name: '老存档里的黑宝石',
            category: '宝石符石',
            sub: '宝石',
            unit: '个',
            note: '',
            points: [
                { id: 'legacy-pt-1', date: '2026-11-01', price: 1200, note: '', createdAt: 1 },
            ],
            createdAt: 1,
            updatedAt: 1,
        },
    ];

    /** 库里那一份，名字与旧快照不同——「读到的是谁」一眼可辨。 */
    const STORED: PriceItem[] = [{ ...LEGACY[0], id: 'db-1', name: '库里的黑宝石' }];

    /** 装一个够用的 localStorage，并塞进旧物价表。返回底层 Map，供断言「没被改名 / 删掉」。 */
    function stubLegacyStorage() {
        const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify(LEGACY)]]);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
        });
        return store;
    }

    /**
     * 另起一个装配函数而不是复用 `host`：那个的 `pricesLegacyImported` 固定返回布尔，
     * 而这里要的正是三态里的第三种。其余字段与 `host` 保持一致，
     * 断言写法（`toHaveBeenCalledTimes` / `mock.calls`）才能通用。
     */
    async function loadWithMarker(marker: boolean | null, load: () => Promise<PriceItem[] | null>) {
        vi.resetModules();
        const desktop = {
            hasDesktop: () => true,
            pricesLoad: vi.fn(load),
            pricesSave: vi.fn(async (_items: PriceItem[]) => true),
            pricesLegacyImported: vi.fn(async (): Promise<boolean | null> => marker),
            pricesMarkLegacyImported: vi.fn(async (): Promise<void> => undefined),
        };
        vi.doMock('../../services/desktop', () => desktop);
        const store = await import('./prices-store');
        await store.loadPrices();
        return { desktop, store };
    }

    it('不拿旧快照写库、不打迁移标记，照常读库并填进 items', async () => {
        const local = stubLegacyStorage();
        const { desktop, store: prices } = await loadWithMarker(null, async () => STORED);
        const { items, loadError } = prices.usePrices();

        /* 顺序与「搬过」那条正好相反：先问标记（拿到 null）→ **不搬** → 直接读库。
         * 若实现退回 `!(await …)`，这里会看到一次 `pricesSave`，且写进去的是旧快照。 */
        expect(desktop.pricesLoad).toHaveBeenCalledTimes(1);
        expect(desktop.pricesSave).not.toHaveBeenCalled();
        expect(desktop.pricesMarkLegacyImported).not.toHaveBeenCalled();
        expect(items.value.map((item) => item.name)).toEqual(['库里的黑宝石']);
        expect(loadError.value).toBe('');
        // 没搬就不该有搬家的痕迹：源数据还在，也没留下 `.migrated` 副本。
        expect(local.has(STORAGE_KEY)).toBe(true);
        expect(local.has(`${STORAGE_KEY}.migrated`)).toBe(false);
    });

    it('库也读不出来时只挂错误位，一个字都不写', async () => {
        stubLegacyStorage();
        const { desktop, store: prices } = await loadWithMarker(null, async () => null);
        const { items, loadError } = prices.usePrices();

        /* 这一条防的是「跳过迁移」顺手把读失败也一起跳过了：`loadError` 必须立起来，
         * 否则 `persist()` 那道闸不关，下一笔就拿着空表整份覆盖。 */
        expect(items.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.pricesLoad).toHaveBeenCalledTimes(1);
        expect(desktop.pricesSave).not.toHaveBeenCalled();
        expect(desktop.pricesMarkLegacyImported).not.toHaveBeenCalled();
    });

    it('反面对照：标记明确说「没搬过」（false）时确实会搬——桩没有让它空转', async () => {
        /* 这条不是为了测 `false` 那条老路，而是证明桩里的旧快照**真的能被读到**：
         * 少了它，`localStorage` 桩没接上也会让前两条全绿（搬不出东西 = 没写库）。 */
        const local = stubLegacyStorage();
        const { desktop } = await loadWithMarker(false, async () => STORED);

        expect(desktop.pricesSave).toHaveBeenCalledTimes(1);
        const saved = desktop.pricesSave.mock.calls[0][0];
        expect(saved.map((item) => item.name)).toEqual(['老存档里的黑宝石']);
        expect(desktop.pricesMarkLegacyImported).toHaveBeenCalledTimes(1);
        // 搬家成功后源数据改名留底：原来的键删掉、`.migrated` 留下。
        expect(local.has(STORAGE_KEY)).toBe(false);
        expect(local.has(`${STORAGE_KEY}.migrated`)).toBe(true);
    });
});
