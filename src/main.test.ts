import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VNode } from 'vue';

const mocks = vi.hoisted(() => ({
    createApp: vi.fn(),
    mount: vi.fn(),
    beforeEach: vi.fn(),
    removeGuard: vi.fn(),
    isReady: vi.fn(),
    initialize: vi.fn(),
    sync: vi.fn(),
    flush: vi.fn(),
    close: vi.fn(),
    confirm: vi.fn(),
    ready: vi.fn(),
}));
vi.mock('vue', async (original) => ({
    ...(await original<typeof import('vue')>()),
    createApp: mocks.createApp,
}));
vi.mock('./App.vue', () => ({ default: {} }));
vi.mock('./router', () => ({
    router: { beforeEach: mocks.beforeEach, isReady: mocks.isReady },
}));
vi.mock('./startup', () => ({ initializeData: mocks.initialize, flushDailySync: mocks.sync }));
vi.mock('./services/desktop', () => ({
    guardWindowClose: mocks.close,
    notifyAppReady: mocks.ready,
}));
vi.mock('./services/persist', () => ({ flushPendingWrites: mocks.flush }));
vi.mock('./composables/use-confirm', () => ({ askConfirm: mocks.confirm }));
vi.mock('./composables/use-theme', () => ({ useTheme: vi.fn() }));
vi.mock('./composables/use-font-scale', () => ({ useFontScale: vi.fn() }));
vi.mock('./composables/use-font-family', () => ({ useFontFamily: vi.fn() }));

let render: () => VNode;
let frames: FrameRequestCallback[];

beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
        frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mocks.createApp.mockImplementation((root: { render: () => VNode }) => {
        render = root.render;
        return { use: () => ({ mount: mocks.mount }) };
    });
    mocks.beforeEach.mockReturnValue(mocks.removeGuard);
    mocks.isReady.mockResolvedValue(undefined);
    mocks.initialize.mockResolvedValue(undefined);
    mocks.sync.mockResolvedValue(true);
    mocks.flush.mockResolvedValue(true);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function paint() {
    const callback = frames.shift();
    expect(callback).toBeDefined();
    callback!(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
}

describe('分阶段启动', () => {
    it('先挂载外壳，数据未完成不放行路由；页面绘制后才通知预热', async () => {
        let release = () => {};
        mocks.initialize.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
        await import('./main');
        expect(mocks.mount).toHaveBeenCalledWith('#app');
        expect(render().props?.loading).toBe(true);
        expect(mocks.initialize).not.toHaveBeenCalled();
        const guard = mocks.beforeEach.mock.calls[0][0] as () => Promise<void>;
        const allowed = vi.fn();
        void guard().then(allowed);
        await paint();
        expect(mocks.initialize).toHaveBeenCalledOnce();
        expect(allowed).not.toHaveBeenCalled();
        expect(render().props?.loading).toBe(true);
        const closing = (mocks.close.mock.calls[0][0] as () => Promise<boolean>)();
        expect(mocks.sync).not.toHaveBeenCalled();
        release();
        await vi.dynamicImportSettled();
        expect(allowed).toHaveBeenCalledOnce();
        expect(mocks.removeGuard).toHaveBeenCalledOnce();
        expect(render().props?.loading).toBe(false);
        expect(mocks.ready).not.toHaveBeenCalled();
        // 关窗等待数据与写队列，不等待下一次绘制或 OCR 预热。
        expect(await closing).toBe(true);
        expect(mocks.sync).toHaveBeenCalledOnce();
        expect(mocks.flush).toHaveBeenCalledOnce();
        await paint();
        expect(mocks.ready).toHaveBeenCalledOnce();
    });

    it('初始化意外失败保留外壳错误，不开放业务页或发预热通知', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.initialize.mockRejectedValue(new Error('chunk unavailable'));
        try {
            await import('./main');
            await paint();
            expect(render().props?.loading).toBe(true);
            expect(render().props?.startupError).toContain('重新加载');
            expect(mocks.removeGuard).not.toHaveBeenCalled();
            expect(mocks.ready).not.toHaveBeenCalled();
            expect(await mocks.close.mock.calls[0][0]()).toBe(true);
            expect(mocks.sync).not.toHaveBeenCalled();
            expect(mocks.flush).toHaveBeenCalledOnce();
        } finally {
            log.mockRestore();
        }
    });

    it('动画帧被暂停时仍可完成启动，不永久卡住加载状态', async () => {
        await import('./main');
        await vi.advanceTimersByTimeAsync(100);
        await vi.dynamicImportSettled();
        expect(mocks.initialize).toHaveBeenCalledOnce();
        expect(render().props?.loading).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(mocks.ready).toHaveBeenCalledOnce();
    });

    it('路由仍在加载或加载失败时，关窗只等待数据和真实写盘', async () => {
        let finishRoute = () => {};
        mocks.isReady.mockReturnValue(new Promise<void>((resolve) => (finishRoute = resolve)));
        await import('./main');
        await paint();
        expect(render().props?.loading).toBe(true);
        expect(await mocks.close.mock.calls[0][0]()).toBe(true);
        expect(mocks.sync).toHaveBeenCalledOnce();
        expect(mocks.flush).toHaveBeenCalledOnce();
        finishRoute();
        await vi.dynamicImportSettled();
    });

    it('路由失败仍刷新已经启动的日常联动，不发送预热通知', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.isReady.mockRejectedValue(new Error('route chunk unavailable'));
        try {
            await import('./main');
            await paint();
            expect(render().props?.startupError).toContain('页面加载失败');
            expect(await mocks.close.mock.calls[0][0]()).toBe(true);
            expect(mocks.sync).toHaveBeenCalledOnce();
            expect(mocks.ready).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
