import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime();
const entry = (date: string, id = date) => ({
    id,
    date,
    characterId: 'c1',
    kind: 'income',
    amount: 10000,
    item: '物品',
    note: '',
    createdAt: 1,
});
const session = (patch = {}) => ({
    id: 'online',
    date: '2026-11-12',
    startAt: at(12, 23),
    endAt: at(13, 1),
    characterId: 'c1',
    roster: [],
    cardPrice: 15000,
    cardCost: true,
    note: '',
    createdAt: 1,
    ...patch,
});

async function loadSync(
    input: { entries?: unknown[]; sessions?: unknown[]; failed?: boolean } = {},
) {
    vi.resetModules();
    const { ref } = await import('vue');
    const minute = ref(Date.now());
    const storage = {
        incomeLoad: vi.fn(async () =>
            input.failed ? null : { entries: input.entries ?? [], prices: [] },
        ),
        incomeSave: vi.fn(async () => true),
        onlineLoad: vi.fn(async () => ({ sessions: input.sessions ?? [], settings: {} })),
        onlineSave: vi.fn(async () => true),
        accountLoad: vi.fn(async () => []),
        accountSave: vi.fn(async () => true),
    };
    vi.doMock('../../services/desktop', () => ({ hasDesktop: () => true }));
    vi.doMock('../../services/storage', () => storage);
    vi.doMock('../../services/storage-sync', () => ({ onStorageSync: () => {} }));
    vi.doMock('../../composables/use-minute-now', () => ({ useMinuteNow: () => minute }));
    const income = await import('../income/income-store');
    const online = await import('../income/online-store');
    const accounts = await import('./accounts-store');
    await Promise.all([income.loadIncome(), online.loadOnline(), accounts.loadAccounts()]);
    const sync = await import('./daily-sync');
    return {
        sync,
        income: income.useIncome(),
        online: online.useOnline(),
        accounts: accounts.useAccounts(),
        minute,
        storage,
    };
}

let stop: (() => void) | undefined;
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(13));
});
afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
});

describe('收益自动同步', () => {
    it('启动补齐所有源日期，连续同步一天不会清掉其他日期', async () => {
        const { sync, accounts } = await loadSync({
            entries: [entry('2026-10-01'), entry('2026-11-13')],
        });
        expect(sync.syncAllDays().ok).toBe(true);
        sync.syncDay('2026-11-13');
        expect(accounts.entries.value.map((one) => one.date).sort()).toEqual([
            '2026-10-01',
            '2026-11-13',
        ]);
    });

    it('修改、删除上月收益，只重算对应日期；关闭窗口前排空防抖队列', async () => {
        const { sync, accounts, income } = await loadSync({
            entries: [entry('2026-10-01', 'old'), entry('2026-11-13')],
        });
        sync.syncAllDays();
        stop = sync.startDailySync();
        income.updateEntry('old', { amount: 25000 });
        expect(await sync.flushDailySync()).toBe(true);
        expect(accounts.entries.value.find((one) => one.date === '2026-10-01')?.amount).toBe(25000);
        income.removeEntry('old');
        await vi.advanceTimersByTimeAsync(401);
        expect(accounts.entries.value.map((one) => one.date)).toEqual(['2026-11-13']);
    });

    it('跨日时段删除后，两天的成本都移除', async () => {
        const { sync, accounts, online } = await loadSync({ sessions: [session()] });
        sync.syncAllDays();
        expect(accounts.entries.value).toHaveLength(2);
        stop = sync.startDailySync();
        online.removeOnline('online');
        await sync.flushDailySync();
        expect(accounts.entries.value).toEqual([]);
    });

    it('分钟更新同步进行中成本；全局开关不改本段快照', async () => {
        const { sync, accounts, online, minute } = await loadSync({
            sessions: [session({ date: '2026-11-13', startAt: at(13, 11), endAt: null })],
        });
        sync.syncAllDays();
        stop = sync.startDailySync();
        const before = accounts.entries.value[0].amount;
        online.setCardCost(false);
        vi.setSystemTime(at(13) + 60000);
        minute.value = Date.now();
        await vi.advanceTimersByTimeAsync(401);
        expect(accounts.entries.value[0].amount).toBeGreaterThan(before);
        expect(online.sessions.value[0].cardCost).toBe(true);
        online.startOnline({ characterIds: ['c2'] });
        expect(online.sessions.value.find((one) => one.characterId === 'c2')?.cardCost).toBe(false);
    });

    it('不计入的时段仍保留记录，但不生成账号点卡支出', async () => {
        const { sync, accounts, online } = await loadSync({
            sessions: [session({ cardCost: false })],
        });
        sync.syncAllDays();
        expect(online.sessions.value).toHaveLength(1);
        expect(accounts.entries.value).toEqual([]);
    });

    it('源账读取失败不把空数据同步到账户', async () => {
        const { sync, storage } = await loadSync({ failed: true });
        expect(sync.syncAllDays().ok).toBe(false);
        expect(sync.useDailySync().error.value).toContain('同步到账户失败');
        expect(storage.accountSave).not.toHaveBeenCalled();
    });

    it('账号写盘失败在收益页可见，并支持重试', async () => {
        const { sync, accounts, storage } = await loadSync({ entries: [entry('2026-11-13')] });
        storage.accountSave.mockResolvedValueOnce(false);
        sync.syncAllDays();
        expect(await accounts.flush()).toBe(false);
        expect(sync.useDailySync().error.value).toContain('同步到账户失败');
        await sync.useDailySync().retry();
        expect(sync.useDailySync().error.value).toBe('');
    });
});
