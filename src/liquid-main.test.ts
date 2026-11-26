import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
    startup: vi.fn<typeof import('./services/legacy-startup').importLegacyOnStartup>(),
    rules: vi.fn<() => Promise<void>>(),
    flushDaily: vi.fn<() => Promise<boolean>>(),
    beforeRoute: vi.fn<(guard: () => Promise<void>) => void>(),
    notify: vi.fn(),
    guard: vi.fn<(beforeClose: () => Promise<boolean>) => void>(),
    canDiscard: vi.fn<() => Promise<boolean>>(),
    flush: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('vue', async (original) => ({
    ...(await original<typeof import('vue')>()),
    createApp: () => ({ use: () => ({ mount: vi.fn() }) }),
}));
vi.mock('vue-router', () => ({
    createRouter: () => ({ beforeEach: host.beforeRoute, isReady: async () => {} }),
    createWebHashHistory: vi.fn(),
}));
vi.mock('./services/legacy-startup', () => ({ importLegacyOnStartup: host.startup }));
vi.mock('./services/game-data', () => ({ loadGameData: host.rules }));
vi.mock('./liquid-ledger-data', () => ({ flushLiquidDailySync: host.flushDaily }));
vi.mock('./composables/use-confirm', () => ({ askConfirm: host.notify }));
vi.mock('./LiquidApp.vue', () => ({ default: {} }));
vi.mock('./composables/use-draft-guard', () => ({ confirmDiscardDrafts: host.canDiscard }));
vi.mock('./services/persist', () => ({ flushPendingWrites: host.flush }));
vi.mock('./services/desktop', () => ({ guardWindowClose: host.guard }));

beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    host.startup.mockResolvedValue(undefined);
    host.rules.mockResolvedValue(undefined);
    host.flushDaily.mockResolvedValue(true);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

it('玻璃窗口在保存准备期间保持打开，写入失败时由用户决定是否退出', async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm });
    await import('./liquid-main');
    const [canClose] = host.guard.mock.calls[0];
    host.canDiscard.mockResolvedValueOnce(false).mockResolvedValue(true);
    host.flush.mockResolvedValueOnce(true).mockResolvedValue(false);

    expect(await canClose()).toBe(false);
    expect(host.flush).not.toHaveBeenCalled();
    expect(host.flushDaily).not.toHaveBeenCalled();
    expect(await canClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await canClose()).toBe(false);
    expect(await canClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
});

it('账号日同步写入失败时需要确认退出', async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('window', { confirm });
    host.canDiscard.mockResolvedValue(true);
    host.flush.mockResolvedValue(true);
    host.flushDaily.mockResolvedValue(false);
    await import('./liquid-main');
    const [canClose] = host.guard.mock.calls[0];

    expect(await canClose()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
});

it('直接进入业务路由前等待游戏规则读取', async () => {
    let finishRules!: () => void;
    host.rules.mockReturnValue(
        new Promise<void>((resolve) => {
            finishRules = resolve;
        }),
    );
    await import('./liquid-main');
    let entered = false;
    const entering = host.beforeRoute.mock.calls[0][0]().then(() => {
        entered = true;
    });
    await Promise.resolve();
    expect(entered).toBe(false);
    expect(host.rules).toHaveBeenCalledOnce();
    finishRules();
    await entering;
    expect(entered).toBe(true);
});

it('直达业务页与系统退出都等待同一次旧账检测，完成后提示导入结果', async () => {
    const notice = { title: '已导入', note: '旧版原件已保留' };
    let finish!: (result: typeof notice) => void;
    host.startup.mockReturnValue(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    host.canDiscard.mockResolvedValue(true);
    host.flush.mockResolvedValue(true);
    await import('./liquid-main');
    let entered = false;
    const entering = host.beforeRoute.mock.calls[0][0]().then(() => {
        entered = true;
    });
    const closing = host.guard.mock.calls[0][0]();
    await Promise.resolve();
    expect(entered).toBe(false);
    expect(host.flush).not.toHaveBeenCalled();
    finish(notice);
    await entering;
    expect(await closing).toBe(true);
    expect(host.startup).toHaveBeenCalledTimes(1);
    expect(host.notify).toHaveBeenCalledWith({ ...notice, confirmText: '知道了', cancelText: '' });
});
