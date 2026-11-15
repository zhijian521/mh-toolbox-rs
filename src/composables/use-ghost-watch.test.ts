import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { ProbeResult } from '../services/ghost';
import { useGhostWatch } from './use-ghost-watch';

const mocks = vi.hoisted(() => ({ maps: vi.fn(), windows: vi.fn(), probe: vi.fn() }));
vi.mock('../services/desktop', () => ({ hasDesktop: () => true }));
vi.mock('../services/ghost', () => ({
    listGhostWindows: mocks.windows,
    probeGhostTask: mocks.probe,
}));
vi.mock('../services/ghost-maps', () => ({ loadGhostMaps: mocks.maps }));

const frame: ProbeResult = {
    hwnd: 1,
    title: '梦幻西游',
    windowWidth: 1024,
    windowHeight: 768,
    roiX: 0,
    roiY: 0,
    roiWidth: 200,
    roiHeight: 400,
    lines: [],
    engine: 'paddle',
    dpi: 96,
    grabMs: 1,
    ocrMs: 2,
};
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}
async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
}
let scope: EffectScope;
beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.stubGlobal('window', { setInterval, clearInterval });
    mocks.maps.mockResolvedValue([]);
    mocks.windows.mockResolvedValue([{ hwnd: 1, title: '梦幻西游' }]);
    mocks.probe.mockResolvedValue(frame);
    scope = effectScope();
});
afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('捉鬼轮询生命周期', () => {
    it('加载地图期间停止，返回后不再启动识别和定时器', async () => {
        const maps = deferred<[]>();
        mocks.maps.mockReturnValue(maps.promise);
        const state = scope.run(useGhostWatch)!;
        const starting = state.start();
        state.toggle();
        maps.resolve([]);
        await starting;
        expect(state.running.value).toBe(false);
        expect(state.starting.value).toBe(false);
        expect(mocks.probe).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['resolve', 'reject'] as const)(
        '离开页面后首帧 %s 不再回写或重建轮询',
        async (result) => {
            const request = deferred<ProbeResult>();
            mocks.probe.mockReturnValue(request.promise);
            const state = scope.run(useGhostWatch)!;
            const starting = state.start();
            await settle();
            expect(mocks.probe).toHaveBeenCalledOnce();
            scope.stop();
            if (result === 'resolve') request.resolve(frame);
            else request.reject(new Error('窗口已关闭'));
            await starting;
            expect(state.running.value).toBe(false);
            expect(state.report.value).toBeNull();
            expect(state.stats.value).toBeNull();
            expect(mocks.windows).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it('进入测试文字后迟到的真实帧不能覆盖测试结果', async () => {
        const request = deferred<ProbeResult>();
        mocks.probe.mockReturnValue(request.promise);
        const state = scope.run(useGhostWatch)!;
        const starting = state.start();
        await settle();
        await state.applyTest('无任务');
        const report = state.report.value;
        request.resolve(frame);
        await starting;
        expect(state.testing.value).toBe(true);
        expect(state.report.value).toBe(report);
        expect(state.stats.value).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('停止后重新开始，旧请求失败不影响新一轮，且仍串行识别', async () => {
        const request = deferred<ProbeResult>();
        mocks.probe.mockReturnValueOnce(request.promise);
        const state = scope.run(useGhostWatch)!;
        const first = state.start();
        await settle();
        state.toggle();
        const second = state.start();
        await settle();
        expect(mocks.probe).toHaveBeenCalledOnce();
        request.reject(new Error('窗口已关闭'));
        await Promise.all([first, second]);
        await vi.advanceTimersByTimeAsync(1100);
        expect(mocks.probe).toHaveBeenCalledTimes(2);
        expect(state.stats.value).toEqual({ grabMs: 1, ocrMs: 2 });
        expect(state.running.value).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
    });
});
