import { afterEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
    guard: vi.fn<(beforeClose: () => Promise<boolean>) => void>(),
    canDiscard: vi.fn<() => Promise<boolean>>(),
    flush: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('vue', async (original) => ({
    ...(await original<typeof import('vue')>()),
    createApp: () => ({ use: () => ({ mount: vi.fn() }) }),
}));
vi.mock('vue-router', () => ({ createRouter: vi.fn(), createWebHashHistory: vi.fn() }));
vi.mock('./LiquidApp.vue', () => ({ default: {} }));
vi.mock('./composables/use-draft-guard', () => ({ confirmDiscardDrafts: host.canDiscard }));
vi.mock('./services/persist', () => ({ flushPendingWrites: host.flush }));
vi.mock('./services/desktop', () => ({ guardWindowClose: host.guard }));

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
    expect(await canClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await canClose()).toBe(false);
    expect(await canClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
});
