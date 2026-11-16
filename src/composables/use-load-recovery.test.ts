import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useLoadRecovery } from './use-load-recovery';

describe('失败后就地重读', () => {
    it('无读取错误或存在未保存改动时拒绝重读', async () => {
        const error = ref('');
        const blocked = ref(false);
        const load = vi.fn(async () => {});
        const recovery = useLoadRecovery(
            load,
            () => error.value,
            () => blocked.value,
        );
        expect(await recovery.retryLoad()).toBe(false);
        error.value = '读取失败';
        blocked.value = true;
        expect(await recovery.retryLoad()).toBe(false);
        expect(load).not.toHaveBeenCalled();
        blocked.value = false;
        expect(recovery.canRetry.value).toBe(true);
    });

    it('重读期间保留错误与加载态，重复点击不发起第二次请求', async () => {
        const error = ref('读取失败');
        let finish!: () => void;
        const load = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        const recovery = useLoadRecovery(
            load,
            () => error.value,
            () => false,
        );
        const first = recovery.retryLoad();
        expect(recovery.loading.value).toBe(true);
        expect(error.value).toBe('读取失败');
        expect(await recovery.retryLoad()).toBe(false);
        expect(load).toHaveBeenCalledOnce();
        error.value = '';
        finish();
        expect(await first).toBe(true);
        expect(recovery.loading.value).toBe(false);
        expect(recovery.canRetry.value).toBe(false);
    });

    it('读取仍失败时允许再次重试，只有完整读取成功才报告恢复', async () => {
        const error = ref('读取失败');
        const load = vi.fn(async () => {});
        const recovery = useLoadRecovery(
            load,
            () => error.value,
            () => false,
        );
        expect(await recovery.retryLoad()).toBe(false);
        expect(recovery.canRetry.value).toBe(true);
        load.mockImplementationOnce(async () => {
            error.value = '';
        });
        expect(await recovery.retryLoad()).toBe(true);
    });

    it('页面、历史窗和重建提示共用同一读取锁，防止旧响应覆盖新数据', async () => {
        const error = ref('读取失败');
        let finish!: () => void;
        const load = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        const history = useLoadRecovery(
            load,
            () => error.value,
            () => false,
        );
        const request = history.retryLoad();
        const page = useLoadRecovery(
            load,
            () => error.value,
            () => false,
        );
        expect(page.loading.value).toBe(true);
        expect(await page.retryLoad()).toBe(false);
        expect(load).toHaveBeenCalledOnce();
        finish();
        expect(await request).toBe(false);
        expect(page.loading.value).toBe(false);
        expect(page.canRetry.value).toBe(true);
    });

    it('异常不会卡住重读按钮，保留原错误并显示失败提示', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const error = ref('读取失败');
            const recovery = useLoadRecovery(
                async () => {
                    throw new Error('模拟读取中断');
                },
                () => error.value,
                () => false,
            );
            expect(await recovery.retryLoad()).toBe(false);
            expect(error.value).toBe('读取失败');
            expect(recovery.failure.value).toBe('仍然无法读取，请稍后重试');
            expect(recovery.loading.value).toBe(false);
            expect(recovery.canRetry.value).toBe(true);
        } finally {
            log.mockRestore();
        }
    });
});
