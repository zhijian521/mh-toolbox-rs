import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPersist } from './persist';

/**
 * `services/persist.ts` 的**行为**：写的闸门、写的排队。
 *
 * 这个文件是第 100 批从三份手抄里收拢出来的骨架，三个 store 的测试只覆盖了「读失败不写」，
 * 而它最微妙的那个性质——**连续写要排队**——一条用例都没有。这个性质失效的样子不是报错，
 * 是「连点两次只存下一条」，等用户发现时账已经少了。
 *
 * 早先还有一段「把 `localStorage` 那一版搬进库、只搬一次」的用例，随老版本兼容一起删了
 * （2026-11-04：新应用不接老数据，见 `lib.rs` 的 `DATA_DIR_NAME`）。
 *
 * `hasDesktop` 走模块桩：这条分叉决定「写去哪儿」，与断言无关的部分不该被真实宿主干扰。
 */
const desktop = vi.hoisted(() => ({ hasDesktop: vi.fn(() => true) }));

vi.mock('./desktop', () => ({ hasDesktop: desktop.hasDesktop }));

/** 让出一拍，等排队链真的跑到。用宏任务而不是 `Promise.resolve()`：链上多一层就等不到。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
            loaded: ref(true),
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
            loaded: ref(true),
            writeLocal,
            writeRemote,
        });

        persist();

        expect(writeLocal).toHaveBeenCalledTimes(1);
        expect(writeRemote).not.toHaveBeenCalled();
    });

    /**
     * 第 103 批记下、第 119 批才补上的那条缝：`loadError` 只说「读了但失败了」，
     * 说不出「读这件事根本没发生」。dev 里改一个文件，store 模块被 HMR 重算、单例回到
     * 空数组，而 `loadXxx()` 只在启动时跑过一次——这时 `loadError` 是空串，
     * 任何一次保存都是「拿空表整份覆盖」。2026-11-04 实测丢了 4 个角色。
     */
    it('还没读过库时一个字节都不写，提示也指向「刷新」而不是磁盘', () => {
        const writeLocal = vi.fn();
        const writeRemote = vi.fn(async () => true);
        const writeError = ref('');
        const persist = createPersist({
            label: '名册',
            loadError: ref(''),
            writeError,
            loaded: ref(false),
            writeLocal,
            writeRemote,
        });

        persist();

        expect(writeLocal).not.toHaveBeenCalled();
        expect(writeRemote).not.toHaveBeenCalled();
        /* 文案要指得着用户真能做的事。这一版代码还没看过库，刷新就好了；
         * 说「检查磁盘空间」会把人引到完全无关的地方去。 */
        expect(writeError.value).toContain('刷新');
        expect(writeError.value).not.toContain('磁盘');
    });

    it('读过之后照常写：这条闸只管「读过没有」，不插手正常路径', async () => {
        const writeRemote = vi.fn(async () => true);
        const persist = createPersist({
            label: '名册',
            loadError: ref(''),
            writeError: ref(''),
            loaded: ref(true),
            writeLocal: () => {},
            writeRemote,
        });

        persist();
        await tick();

        expect(writeRemote).toHaveBeenCalledTimes(1);
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
            loaded: ref(true),
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
            loaded: ref(true),
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
            loaded: ref(true),
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
            loaded: ref(true),
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
