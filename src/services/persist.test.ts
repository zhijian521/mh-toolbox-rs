import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPersist, migrateLegacy, type LegacyMigration } from './persist';

/**
 * `services/persist.ts` 的**行为**：写的闸门、写的排队、搬家的一次性。
 *
 * 这个文件是第 100 批从三份手抄里收拢出来的骨架，三个 store 的测试只覆盖了「读失败不写」，
 * 而它最微妙的那个性质——**连续写要排队**——一条用例都没有。这个性质失效的样子不是报错，
 * 是「连点两次只存下一条」，等用户发现时账已经少了。
 *
 * `hasDesktop` 走模块桩：这条分叉决定「写去哪儿」，与断言无关的部分不该被真实宿主干扰。
 */
const desktop = vi.hoisted(() => ({ hasDesktop: vi.fn(() => true) }));

vi.mock('./desktop', () => ({ hasDesktop: desktop.hasDesktop }));

/** 让出一拍，等排队链真的跑到。用宏任务而不是 `Promise.resolve()`：链上多一层就等不到。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 最小 `localStorage`：只实现骨架用到的三个动作，够验「改名留底」这件事。 */
function stubStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
    });
    return store;
}

beforeEach(() => {
    desktop.hasDesktop.mockReturnValue(true);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('createPersist：什么时候不写', () => {
    it('读失败时一个字节都不写，连浏览器那条路也不走', () => {
        const writeLocal = vi.fn();
        const writeRemote = vi.fn(async () => true);
        const persist = createPersist({
            label: '物价表',
            loadError: ref('读不出物价表，已暂停写入以免覆盖原有数据'),
            writeError: ref(''),
            writeLocal,
            writeRemote,
        });

        persist();

        expect(writeLocal).not.toHaveBeenCalled();
        expect(writeRemote).not.toHaveBeenCalled();
    });

    it('没有宿主时写本地，不去碰 IPC', () => {
        desktop.hasDesktop.mockReturnValue(false);
        const writeLocal = vi.fn();
        const writeRemote = vi.fn(async () => true);
        const persist = createPersist({
            label: '物价表',
            loadError: ref(''),
            writeError: ref(''),
            writeLocal,
            writeRemote,
        });

        persist();

        expect(writeLocal).toHaveBeenCalledTimes(1);
        expect(writeRemote).not.toHaveBeenCalled();
    });
});

describe('createPersist：写入排队', () => {
    /**
     * 这一组是骨架存在的理由。每次写的都是**整份**，两次写同时在路上时，
     * 先发后到就会把后一笔盖掉——而记价、速记的用法本来就是连点。
     */
    it('连点两次：两次都真的落盘，且最后一次拿的是最新那份', async () => {
        const snapshots: number[] = [];
        let state = 0;
        const persist = createPersist({
            label: '物价表',
            loadError: ref(''),
            writeError: ref(''),
            writeLocal: () => {},
            writeRemote: async () => {
                snapshots.push(state);
                return true;
            },
        });

        state = 1;
        persist();
        state = 2;
        persist();
        await tick();

        /* 两次都在——只写一次的实现（合并式）这里只会有一条。
         *
         * 两条快照**都是 2**，不是 `[1, 2]`：快照在**执行时**取，排队中的第二笔等到
         * 前一笔写完才取数，而那时内存里已经是最新的一份。所以代价是「重复写一遍相同
         * 数据」，换来的是「最后落到库里的永远是当下全量」——库不会因为某一笔先到后到
         * 而停在旧快照上。 */
        expect(snapshots).toHaveLength(2);
        expect(snapshots[1]).toBe(2);
    });

    it('第一笔没写完时，第二笔不许抢先', async () => {
        const order: string[] = [];
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let round = 0;
        const persist = createPersist({
            label: '收益账',
            loadError: ref(''),
            writeError: ref(''),
            writeLocal: () => {},
            writeRemote: async () => {
                round += 1;
                const mine = round;
                order.push(`start${mine}`);
                if (mine === 1) await gate;
                order.push(`end${mine}`);
                return true;
            },
        });

        persist();
        persist();
        await tick();

        /* 第一次卡在 gate 上，第二次必须还在门外等。 */
        expect(order).toEqual(['start1']);

        release();
        await tick();

        expect(order).toEqual(['start1', 'end1', 'start2', 'end2']);
    });

    it('链上漏出一个 reject 也不会让写入从此停摆', async () => {
        let round = 0;
        const writeError = ref('');
        const persist = createPersist({
            label: '名册',
            loadError: ref(''),
            writeError,
            writeLocal: () => {},
            writeRemote: async () => {
                round += 1;
                if (round === 1) throw new Error('IPC 崩了');
                return true;
            },
        });

        persist();
        await tick();
        expect(writeError.value).not.toBe('');

        persist();
        await tick();

        /* 第二笔照常发出，并且把上一笔留下的红字清掉——否则界面会一直挂着一条过期的错。 */
        expect(round).toBe(2);
        expect(writeError.value).toBe('');
    });
});

describe('createPersist：失败要回到界面', () => {
    it('写库返回 false 时给出红字，写成功时清空', async () => {
        let ok = false;
        const writeError = ref('');
        const persist = createPersist({
            label: '物价表',
            loadError: ref(''),
            writeError,
            writeLocal: () => {},
            writeRemote: async () => ok,
        });

        persist();
        await tick();
        expect(writeError.value).toContain('没写进数据库');

        ok = true;
        persist();
        await tick();
        expect(writeError.value).toBe('');
    });
});

describe('migrateLegacy：搬一次，且只有一次', () => {
    type Item = { id: string };

    function migration(overrides: Partial<LegacyMigration<Item>> = {}) {
        const saveAll = vi.fn(async () => true);
        const markImported = vi.fn(async () => undefined);
        const readLegacy = vi.fn((): Item[] => [{ id: 'a' }]);
        const options: LegacyMigration<Item> = {
            storageKey: 'mh-prices',
            label: '旧物价表',
            imported: async () => false,
            readLegacy,
            saveAll,
            markImported,
            ...overrides,
        };
        return { options, saveAll, markImported, readLegacy };
    }

    it('标记问不出来（null）时不搬，也不打标记', async () => {
        const { options, saveAll, markImported, readLegacy } = migration({
            imported: async () => null,
        });

        expect(await migrateLegacy(options)).toBe(false);
        /* 把「问不出来」当「没搬过」，一次调用失败就会拿陈年快照覆盖库。 */
        expect(readLegacy).not.toHaveBeenCalled();
        expect(saveAll).not.toHaveBeenCalled();
        expect(markImported).not.toHaveBeenCalled();
    });

    it('标记说搬过了（true）时什么都不做', async () => {
        const { options, saveAll, readLegacy } = migration({ imported: async () => true });

        expect(await migrateLegacy(options)).toBe(false);
        expect(readLegacy).not.toHaveBeenCalled();
        expect(saveAll).not.toHaveBeenCalled();
    });

    it('首次启动搬成功：写库、老键改名留底、打标记', async () => {
        const store = stubStorage({ 'mh-prices': '[{"id":"a"}]' });
        const { options, saveAll, markImported } = migration();

        expect(await migrateLegacy(options)).toBe(true);

        expect(saveAll).toHaveBeenCalledTimes(1);
        expect(markImported).toHaveBeenCalledTimes(1);
        /* 留底用改名不用删除：库文件被误删 / 损坏时这里还能捞一把，
         * 而原键已经不在，原读法再也不会重复搬。 */
        expect(store.get('mh-prices.migrated')).toBe('[{"id":"a"}]');
        expect(store.has('mh-prices')).toBe(false);
    });

    it('搬失败时**不动源数据**，下次启动还能再试', async () => {
        const store = stubStorage({ 'mh-prices': '[{"id":"a"}]' });
        const { options } = migration({ saveAll: async () => false });

        await migrateLegacy(options);

        /* 反过来（先改名再写）一旦写失败就是永久丢数据。 */
        expect(store.get('mh-prices')).toBe('[{"id":"a"}]');
        expect(store.has('mh-prices.migrated')).toBe(false);
    });

    it('留底写不进去（配额满 / 被禁用）也不抛：数据已经在库里了', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
            removeItem: () => {},
        });
        const { options, markImported } = migration();

        /* 这个函数跑在 `main.ts` 的 `Promise.all` 里，一抛就是启动白屏。 */
        await expect(migrateLegacy(options)).resolves.toBe(true);
        expect(markImported).toHaveBeenCalledTimes(1);
    });

    it('旧快照是空的也照样打标记：留空也算问过一遍', async () => {
        stubStorage();
        const { options, markImported, saveAll } = migration({ readLegacy: () => [] });

        expect(await migrateLegacy(options)).toBe(true);
        expect(saveAll).not.toHaveBeenCalled();
        /* 不打标记的话，每次启动都会再走一遍「读 localStorage → 试写库」。 */
        expect(markImported).toHaveBeenCalledTimes(1);
    });
});
