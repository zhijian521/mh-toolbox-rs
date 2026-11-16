import { describe, expect, it, vi } from 'vitest';
import { listBackups } from '../../services/data-files';
import { useBackups } from './use-backups';

vi.mock('../../services/data-files', () => ({ listBackups: vi.fn() }));

describe('设置页备份状态', () => {
    it('只用最新日常备份报告成功时间，替换前备份不冒充自动备份', async () => {
        vi.mocked(listBackups).mockResolvedValueOnce({
            entries: [
                { name: 'old', createdAt: 10, kind: 'daily', bytes: 100 },
                { name: 'before', createdAt: 30, kind: 'before', bytes: 100 },
                { name: 'new', createdAt: 20, kind: 'daily', bytes: 100 },
            ],
            error: '本次自动备份失败',
        });
        const state = useBackups();
        await state.refresh();
        expect(state.latestDaily.value?.name).toBe('new');
        expect(state.warning.value).toBe('本次自动备份失败');
        expect(state.loaded.value).toBe(true);
    });

    it('空列表、读取失败分开；刷新失败仍保留上次成功列表，重试可恢复', async () => {
        vi.mocked(listBackups).mockResolvedValueOnce({ entries: [], error: null });
        const state = useBackups();
        await state.refresh();
        expect(state.loaded.value).toBe(true);
        expect(state.error.value).toBe('');
        vi.mocked(listBackups).mockRejectedValueOnce(new Error('读取失败'));
        await state.refresh();
        expect(state.error.value).toContain('读取失败');
        vi.mocked(listBackups).mockResolvedValueOnce({
            entries: [{ name: 'daily', createdAt: 42, kind: 'daily', bytes: 100 }],
            error: null,
        });
        await state.refresh();
        expect(state.error.value).toBe('');
        vi.mocked(listBackups).mockRejectedValueOnce(new Error('再次失败'));
        await state.refresh();
        expect(state.entries.value[0].name).toBe('daily');
    });

    it('卡片和弹窗同时刷新只发起一次读取', async () => {
        let resolve!: (value: Awaited<ReturnType<typeof listBackups>>) => void;
        vi.mocked(listBackups).mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const state = useBackups();
        const first = state.refresh();
        await state.refresh();
        expect(state.loading.value).toBe(true);
        resolve({ entries: [], error: null });
        await first;
        expect(state.loading.value).toBe(false);
    });
});
