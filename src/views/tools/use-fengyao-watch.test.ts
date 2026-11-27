import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fengyaoStatus, fengyaoSummary, type WatchStatus } from '../../services/fengyao';
import { useFengyaoWatch } from './use-fengyao-watch';

vi.mock('../../services/desktop', () => ({ hasDesktop: () => true }));
vi.mock('../../services/fengyao', () => ({ fengyaoStatus: vi.fn(), fengyaoSummary: vi.fn() }));

const readStatus = vi.mocked(fengyaoStatus);
const readSummary = vi.mocked(fengyaoSummary);
const stopped: WatchStatus = {
    running: false,
    config: null,
    title: '',
    error: '',
    text: [],
    lastReadAt: 0,
    checkedAt: 0,
    ocrMs: 0,
    baselineReady: false,
    alerts: [],
    notificationError: '',
    speechError: '',
    rules: { sourceUrl: '', checkedOn: '', note: '', scenes: [] },
};
const running = { ...stopped, running: true };
const scopes: EffectScope[] = [];

function subscribe(withDetails = true) {
    const scope = effectScope();
    scopes.push(scope);
    return { scope, session: scope.run(() => useFengyaoWatch(withDetails))! };
}

beforeEach(() => {
    readStatus.mockReset();
    readSummary.mockReset();
    vi.useFakeTimers();
});

afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop();
    vi.useRealTimers();
});

describe('提醒助手共享监听状态', () => {
    it('两处入口共用一次读取，失败时暂停启停，重试后以后台状态恢复', async () => {
        readStatus.mockRejectedValueOnce(new Error('监听状态暂不可读'));
        const { session: overview } = subscribe();
        const { session: settings } = subscribe();
        await overview.refreshStatus();
        const start = vi.fn(async () => running);
        await overview.runAction(start);
        expect(start).not.toHaveBeenCalled();
        expect(readStatus).toHaveBeenCalledTimes(1);
        expect(settings.known.value).toBe(false);
        expect(settings.statusError.value).toContain('暂不可读');

        readStatus.mockResolvedValueOnce(running);
        await settings.refreshStatus();
        expect(overview.statusError.value).toBe('');
        expect(overview.known.value).toBe(true);
        expect(overview.running.value).toBe(true);
    });

    it('共享操作锁，启停前发出的旧查询不会覆盖新状态', async () => {
        readStatus.mockResolvedValueOnce(running);
        const { session: overview } = subscribe();
        const { session: settings } = subscribe();
        await overview.refreshStatus();

        let finishRead!: (value: WatchStatus) => void;
        const pendingRead = new Promise<WatchStatus>((resolve) => {
            finishRead = resolve;
        });
        readStatus.mockReturnValueOnce(pendingRead);
        const staleRead = overview.refreshStatus();
        let finishStop!: (value: WatchStatus) => void;
        const pendingStop = new Promise<WatchStatus>((resolve) => {
            finishStop = resolve;
        });
        const stop = overview.runAction(() => pendingStop);
        expect(settings.busy.value).toBe(true);
        const otherAction = vi.fn(async () => running);
        await settings.runAction(otherAction);
        expect(otherAction).not.toHaveBeenCalled();

        finishStop(stopped);
        await stop;
        finishRead(running);
        await staleRead;
        expect(settings.running.value).toBe(false);
        expect(settings.busy.value).toBe(false);
    });

    it('总览查摘要，详情订阅后再取完整公告', async () => {
        readStatus.mockResolvedValue(running);
        readSummary.mockResolvedValue({ running: true, error: '', baselineReady: true });
        const overview = subscribe(false);
        await overview.session.refreshStatus();
        expect(readSummary).toHaveBeenCalledTimes(1);
        expect(readStatus).not.toHaveBeenCalled();
        expect(overview.session.running.value).toBe(true);

        const detail = subscribe();
        await detail.session.refreshStatus();
        expect(readStatus).toHaveBeenCalledTimes(1);
        expect(detail.session.known.value).toBe(true);
    });

    it('重新进入总览时丢弃上一次订阅尚未返回的摘要', async () => {
        let finishRead!: (value: WatchStatus) => void;
        const pendingRead = new Promise<WatchStatus>((resolve) => {
            finishRead = resolve;
        });
        readSummary.mockReturnValueOnce(pendingRead).mockResolvedValueOnce(stopped);
        const previous = subscribe(false);
        previous.scope.stop();

        const overview = subscribe(false);
        expect(overview.session.known.value).toBe(false);
        finishRead(running);
        await overview.session.refreshStatus();
        expect(readSummary).toHaveBeenCalledTimes(2);
        expect(overview.session.known.value).toBe(true);
        expect(overview.session.running.value).toBe(false);
    });

    it('只在总览或详情订阅期间轮询', async () => {
        readStatus.mockResolvedValue(running);
        const overview = subscribe();
        const settings = subscribe();
        await overview.session.refreshStatus();
        overview.scope.stop();
        await vi.advanceTimersByTimeAsync(1200);
        expect(readStatus).toHaveBeenCalledTimes(2);

        settings.scope.stop();
        await vi.advanceTimersByTimeAsync(1200);
        expect(readStatus).toHaveBeenCalledTimes(2);
    });
});
