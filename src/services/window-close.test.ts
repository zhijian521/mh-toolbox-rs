import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ close: vi.fn(), subscribe: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ close: host.close, onCloseRequested: host.subscribe }),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('窗口关闭等待保存', () => {
    it('慢写未完成前拦住系统关闭，重复请求不再启动另一轮，成功后才放行', async () => {
        vi.resetModules();
        vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
        const { guardWindowClose } = await import('./desktop');
        let resolve!: (ok: boolean) => void;
        const saved = new Promise<boolean>((done) => {
            resolve = done;
        });
        const beforeClose = vi.fn(() => saved);
        await guardWindowClose(beforeClose);
        const handler = host.subscribe.mock.calls[0][0];
        const event = { preventDefault: vi.fn() };
        const waiting = handler(event);
        await handler(event);
        expect(beforeClose).toHaveBeenCalledOnce();
        expect(event.preventDefault).toHaveBeenCalledTimes(2);
        expect(host.close).not.toHaveBeenCalled();
        resolve(true);
        await waiting;
        expect(host.close).toHaveBeenCalledOnce();
        const approved = { preventDefault: vi.fn() };
        await handler(approved);
        expect(approved.preventDefault).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
    it('写入失败且用户取消退出时保留窗口，下次可重试', async () => {
        vi.resetModules();
        vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
        const { guardWindowClose } = await import('./desktop');
        await guardWindowClose(vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true));
        const handler = host.subscribe.mock.calls[0][0];
        await handler({ preventDefault: vi.fn() });
        expect(host.close).not.toHaveBeenCalled();
        await handler({ preventDefault: vi.fn() });
        expect(host.close).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});
