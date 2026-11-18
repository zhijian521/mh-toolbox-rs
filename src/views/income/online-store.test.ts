import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCost, sessionMinutes } from './online';

type StorageHandler = (event: Pick<StorageEvent, 'key' | 'newValue'>) => void;

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/**
 * `online-store.ts` 的**逐号上下线**。
 *
 * 2026-11-11 用户改的口径：「随时可以单独上某一个号、单独下一个号」。
 * 以前一次上线是「一组人共用一段」（`roster`），于是加第三个号只能把整组停掉重开。
 * 这条规则写在 store 里而不是界面里——界面只是它的一个调用方，
 * 而它错掉的表现**不报错**：`stopOnline()` 少停一个号，那个号会一直挂到第二天。
 *
 * 用 `vi.doMock` + `vi.resetModules()`：`sessions` 是模块级单例，
 * 每条用例必须拿一份全新的（与 `income-store.test.ts` 同一条理由）。
 */

function host() {
    return {
        hasDesktop: () => true,
        onlineLoad: vi.fn(async () => ({ sessions: [], settings: {} })),
        onlineSave: vi.fn(async () => true),
    };
}

async function loadStore(desktop: ReturnType<typeof host>) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    const store = await import('./online-store');
    await store.loadOnline();
    return store;
}

describe('上线：一个号一条', () => {
    it('跨窗口损坏设置不覆盖计时，删除存档重置记录和点卡口径', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const handlers: StorageHandler[] = [];
        vi.stubGlobal('window', {
            addEventListener: (_type: string, handler: StorageHandler) => handlers.push(handler),
        });
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', {
            getItem: () =>
                JSON.stringify({
                    sessions: [],
                    settings: { cardPrice: 30000, cardCost: false },
                }),
            setItem,
        });
        const store = await loadStore({ ...host(), hasDesktop: () => false });
        expect(store.startOnline({ characterIds: ['c1'] }).ok).toBe(true);
        const { sessions, settings, loadError } = store.useOnline();
        const original = JSON.parse(JSON.stringify(sessions.value));
        setItem.mockClear();
        handlers.forEach((handler) => handler({ key: 'mh-online', newValue: '{"sessions":[]}' }));
        expect(sessions.value).toEqual(original);
        expect(settings.value).toEqual({ cardPrice: 30000, cardCost: false });
        expect(loadError.value).not.toBe('');
        expect(store.startOnline({ characterIds: ['c2'] }).ok).toBe(false);
        expect(setItem).not.toHaveBeenCalled();

        handlers.forEach((handler) => handler({ key: 'mh-online', newValue: null }));
        expect(sessions.value).toEqual([]);
        expect(settings.value).toEqual({ cardPrice: 15000, cardCost: true });
        expect(loadError.value).toBe('');
    });

    it.each(
        [null, [], { cardPrice: -1, cardCost: true }, { cardPrice: 15000, cardCost: 'false' }].map(
            (settings) => ({ settings }),
        ),
    )('浏览器点卡设置损坏时拒绝覆盖：%j', async ({ settings }) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ sessions: [], settings }),
            setItem,
        });
        const store = await loadStore({ ...host(), hasDesktop: () => false });
        expect(store.useOnline().loadError.value).not.toBe('');
        expect(store.startOnline({ characterIds: ['c1'] }).ok).toBe(false);
        expect(setItem).not.toHaveBeenCalled();
    });

    it('同时开两个号 → 两条记录，各记各的主体', async () => {
        const store = await loadStore(host());
        const result = store.startOnline({ characterIds: ['c1', 'c2'] });
        expect(result.ok).toBe(true);
        const { sessions } = store.useOnline();
        expect(sessions.value).toHaveLength(2);
        expect(sessions.value.map((one) => one.characterId).sort()).toEqual(['c1', 'c2']);
        /* 新模型不再写 roster：一条只有一个号。 */
        expect(sessions.value.every((one) => one.roster.length === 0)).toBe(true);
    });

    it('先开两个、再单开第三个 → 三条都在计时，互不影响', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1', 'c2'] });
        store.startOnline({ characterIds: ['c3'] });
        const { sessions } = store.useOnline();
        expect(sessions.value).toHaveLength(3);
        expect(store.runningSessions()).toHaveLength(3);
    });

    it('已经在计时的号再开一次：整批拒掉，不静默跳过', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1'] });
        const again = store.startOnline({ characterIds: ['c1', 'c2'] });
        expect(again.ok).toBe(false);
        /* 整批拒：c2 也不能偷偷开起来，否则用户以为两个都开了，实际只有一个。 */
        expect(store.runningSessions()).toHaveLength(1);
    });
});

describe('上线：单独结束一个号', () => {
    it('传号只停那一个，其它的接着计时', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1', 'c2', 'c3'] });
        /* 计时不足一分钟的段会被丢掉，所以先把开始时刻挪到两小时前。 */
        const { sessions } = store.useOnline();
        const two = 2 * 60 * 60_000;
        for (const one of sessions.value)
            store.updateOnline(one.id, { startAt: one.startAt - two });

        const result = store.stopOnline(['c2']);
        expect(result.ok).toBe(true);
        const left = store.runningSessions();
        expect(left.map((one) => one.characterId)).toEqual(expect.arrayContaining(['c1', 'c3']));
        expect(left).toHaveLength(2);
        expect(sessions.value.find((one) => one.characterId === 'c2')?.endAt).not.toBeNull();
    });

    it('不传号 = 全停（页头那枚「结束」）', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1', 'c2'] });
        const { sessions } = store.useOnline();
        for (const one of sessions.value)
            store.updateOnline(one.id, { startAt: one.startAt - 3_600_000 });

        expect(store.stopOnline().ok).toBe(true);
        expect(store.runningSessions()).toHaveLength(0);
    });

    it('停不在计时的号：报「没有正在计时的号」，不动别人的段', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1'] });
        const { sessions } = store.useOnline();
        for (const one of sessions.value)
            store.updateOnline(one.id, { startAt: one.startAt - 3_600_000 });

        const result = store.stopOnline(['c9']);
        expect(result.ok).toBe(false);
        expect(store.runningSessions()).toHaveLength(1);
    });

    it('不足一分钟的段丢掉，而不是留一条 0 分钟', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1'] });
        store.stopOnline();
        expect(store.useOnline().sessions.value).toHaveLength(0);
    });
});

describe('上线：时间与冲突校验', () => {
    it('修改结束时间后重算时长与点卡，保留单价快照并写回', async () => {
        const desktop = host();
        const store = await loadStore(desktop);
        const now = Date.now();
        const startAt = now - 3 * 3600000;
        store.backfillOnline({ characterIds: ['c1'], startAt, endAt: now - 2 * 3600000 });
        const { sessions, flush } = store.useOnline();
        const before = sessions.value[0];
        const endAt = now - 3600000;
        expect(store.updateOnline(before.id, { endAt }).ok).toBe(true);
        expect(sessions.value).toHaveLength(1);
        expect(sessions.value[0]).toEqual({ ...before, endAt });
        expect(sessionMinutes(sessions.value[0])).toBe(120);
        expect(sessionCost(sessions.value[0])).toBe(180000);
        expect(await flush()).toBe(true);
        expect(desktop.onlineSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sessions: [expect.objectContaining({ id: before.id, endAt })],
            }),
        );
        expect(store.updateOnline(before.id, { note: '只改备注' }).ok).toBe(true);
        expect(sessions.value[0].endAt).toBe(endAt);
    });

    it('修改结束时间拒绝未来、倒置、不足一分钟和非法时刻，失败不动记录', async () => {
        const desktop = host();
        const store = await loadStore(desktop);
        const now = Date.now();
        const startAt = now - 3600000;
        store.backfillOnline({ characterIds: ['c1'], startAt, endAt: now - 600000 });
        const { sessions, flush } = store.useOnline();
        await flush();
        desktop.onlineSave.mockClear();
        const before = sessions.value[0];
        for (const endAt of [now + 60000, startAt, startAt - 60000, startAt + 30000, NaN]) {
            expect(store.updateOnline(before.id, { endAt }).ok).toBe(false);
            expect(sessions.value[0]).toBe(before);
        }
        await flush();
        expect(desktop.onlineSave).not.toHaveBeenCalled();
    });

    it('延长结束时间不能撞上同角色下一段，恰好衔接允许', async () => {
        const store = await loadStore(host());
        const now = Date.now();
        const hour = 3600000;
        store.backfillOnline({
            characterIds: ['c1'],
            startAt: now - 4 * hour,
            endAt: now - 3 * hour,
        });
        const before = store.useOnline().sessions.value[0];
        store.backfillOnline({
            characterIds: ['c1'],
            startAt: now - 2 * hour,
            endAt: now - hour,
        });
        expect(store.updateOnline(before.id, { endAt: now - hour }).ok).toBe(false);
        expect(store.updateOnline(before.id, { endAt: now - 2 * hour }).ok).toBe(true);
    });

    it('拒绝未来时间、相同时间和不足一分钟，不产生记录', async () => {
        const store = await loadStore(host());
        const now = Date.now();
        for (const [startAt, endAt] of [
            [now, now + 60000],
            [now, now],
            [now - 30000, now],
        ]) {
            expect(store.backfillOnline({ characterIds: ['c1'], startAt, endAt }).ok).toBe(false);
        }
        expect(store.useOnline().sessions.value).toEqual([]);
    });

    it('拒绝相同角色的重叠时段，允许相邻时段与其他角色', async () => {
        const store = await loadStore(host());
        const now = Date.now();
        const hour = 3600000;
        const add = (id: string, start: number, end: number) =>
            store.backfillOnline({
                characterIds: [id],
                startAt: now - start * hour,
                endAt: now - end * hour,
            });
        expect(add('c1', 3, 2).ok).toBe(true);
        expect(add('c1', 2.5, 1.5).ok).toBe(false);
        expect(add('c1', 2, 1).ok).toBe(true);
        expect(add('c2', 3, 2).ok).toBe(true);
    });

    it('编辑不能把另一条计时记录改给已在线角色', async () => {
        const store = await loadStore(host());
        store.startOnline({ characterIds: ['c1', 'c2'] });
        const second = store.useOnline().sessions.value.find((one) => one.characterId === 'c2')!;
        expect(store.updateOnline(second.id, { characterIds: ['c1'] }).ok).toBe(false);
        expect(
            store.useOnline().sessions.value.find((one) => one.id === second.id)?.characterId,
        ).toBe('c2');
    });

    it('补记与修改都以开始时刻确定日期，切换开关只改变新段的快照', async () => {
        const store = await loadStore(host());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);
        yesterday.setHours(10, 0, 0, 0);
        const startAt = yesterday.getTime();
        expect(
            store.backfillOnline({ characterIds: ['c1'], startAt, endAt: startAt + 3600000 }).ok,
        ).toBe(true);
        const { sessions } = store.useOnline();
        const first = sessions.value[0];
        const expected = [
            yesterday.getFullYear(),
            String(yesterday.getMonth() + 1).padStart(2, '0'),
            String(yesterday.getDate()).padStart(2, '0'),
        ].join('-');
        expect(first.date).toBe(expected);
        store.setCardCost(false);
        store.startOnline({ characterIds: ['c2'] });
        expect(sessions.value.find((one) => one.id === first.id)?.cardCost).toBe(true);
        expect(sessions.value.find((one) => one.characterId === 'c2')?.cardCost).toBe(false);
        const earlier = new Date(startAt);
        earlier.setDate(earlier.getDate() - 1);
        expect(store.updateOnline(first.id, { startAt: earlier.getTime() }).ok).toBe(true);
        expect(sessions.value.find((one) => one.id === first.id)?.date).not.toBe(expected);
    });
});
