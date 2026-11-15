import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeData } from './startup';

const mocks = vi.hoisted(() => {
    const domain = () => ({ load: vi.fn(), loadError: { value: '' } });
    return {
        rules: vi.fn(),
        roster: domain(),
        prices: domain(),
        income: domain(),
        online: domain(),
        accounts: domain(),
        goals: domain(),
        sync: vi.fn(),
        watch: vi.fn(),
    };
});

vi.mock('./services/game-data', () => ({ loadGameData: mocks.rules }));
vi.mock('./views/characters/roster', () => ({
    loadRoster: mocks.roster.load,
    useRoster: () => mocks.roster,
}));
vi.mock('./views/prices/prices-store', () => ({
    loadPrices: mocks.prices.load,
    usePrices: () => mocks.prices,
}));
vi.mock('./views/income/income-store', () => ({
    loadIncome: mocks.income.load,
    useIncome: () => mocks.income,
}));
vi.mock('./views/income/online-store', () => ({
    loadOnline: mocks.online.load,
    useOnline: () => mocks.online,
}));
vi.mock('./views/accounts/accounts-store', () => ({
    loadAccounts: mocks.accounts.load,
    useAccounts: () => mocks.accounts,
}));
vi.mock('./views/goals/goals-store', () => ({
    loadGoals: mocks.goals.load,
    useGoals: () => mocks.goals,
}));
vi.mock('./views/accounts/daily-sync', () => ({
    syncAllDays: mocks.sync,
    startDailySync: mocks.watch,
    flushDailySync: vi.fn(),
}));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.rules.mockResolvedValue(undefined);
    for (const domain of [
        mocks.roster,
        mocks.prices,
        mocks.income,
        mocks.online,
        mocks.accounts,
        mocks.goals,
    ]) {
        domain.load.mockResolvedValue(undefined);
        domain.loadError.value = '';
    }
});

describe('启动数据边界', () => {
    it('独立账本并行读取，角色与物价等规则，全部读取结束后才对账和订阅', async () => {
        let releaseRules = () => {};
        let releaseIncome = () => {};
        mocks.rules.mockReturnValue(new Promise<void>((resolve) => (releaseRules = resolve)));
        mocks.income.load.mockReturnValue(
            new Promise<void>((resolve) => (releaseIncome = resolve)),
        );
        const startup = initializeData();
        expect(mocks.accounts.load).toHaveBeenCalledOnce();
        expect(mocks.online.load).toHaveBeenCalledOnce();
        expect(mocks.goals.load).toHaveBeenCalledOnce();
        expect(mocks.roster.load).not.toHaveBeenCalled();
        expect(mocks.prices.load).not.toHaveBeenCalled();
        releaseRules();
        await Promise.resolve();
        expect(mocks.roster.load).toHaveBeenCalledOnce();
        expect(mocks.prices.load).toHaveBeenCalledOnce();
        expect(mocks.sync).not.toHaveBeenCalled();
        expect(mocks.watch).not.toHaveBeenCalled();
        releaseIncome();
        await startup;
        expect(mocks.sync).toHaveBeenCalledOnce();
        expect(mocks.watch).toHaveBeenCalledOnce();
        expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.watch.mock.invocationCallOrder[0],
        );
    });

    it('单个领域异常立写入错误，其他领域仍完成加载', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.income.load.mockRejectedValue(new Error('database is locked'));
        try {
            await initializeData();
            expect(mocks.income.loadError.value).toContain('已暂停写入');
            expect(mocks.accounts.loadError.value).toBe('');
            expect(mocks.roster.load).toHaveBeenCalledOnce();
            expect(mocks.sync).toHaveBeenCalledOnce();
            expect(mocks.watch).toHaveBeenCalledOnce();
        } finally {
            log.mockRestore();
        }
    });
});
