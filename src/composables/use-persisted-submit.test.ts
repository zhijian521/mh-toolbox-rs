import { describe, expect, it, vi } from 'vitest';
import { usePersistedSubmit } from './use-persisted-submit';

vi.mock('./save-feedback', () => ({
    saved: (flush: () => Promise<boolean>) => flush(),
}));

describe('弹窗提交与写盘重试', () => {
    it('写盘失败后保留已应用操作，重试不重复新增或补记', async () => {
        const flush = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const retry = vi.fn().mockResolvedValue(true);
        const apply = vi.fn(() => true);
        const draft = usePersistedSubmit(flush, retry);

        expect(await draft.run('save', apply)).toBe(false);
        expect(draft.locked.value).toBe(true);
        expect(draft.saving.value).toBe(false);
        expect(await draft.run('save', apply)).toBe(true);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(retry).toHaveBeenCalledTimes(1);
        expect(draft.locked.value).toBe(false);
    });

    it('等待落盘时拒绝连点和重置草稿', async () => {
        let resolve!: (ok: boolean) => void;
        const flush = () =>
            new Promise<boolean>((done) => {
                resolve = done;
            });
        const apply = vi.fn(() => true);
        const draft = usePersistedSubmit(flush, vi.fn());
        const pending = draft.run('save', apply);

        expect(await draft.run('save', apply)).toBe(false);
        draft.reset();
        expect(draft.action.value).toBe('save');
        resolve(true);
        expect(await pending).toBe(true);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it('校验未通过不锁定；删除失败后不能改走保存', async () => {
        const flush = vi.fn().mockResolvedValue(false);
        const draft = usePersistedSubmit(flush, vi.fn());
        expect(await draft.run('save', () => false)).toBe(false);
        expect(draft.locked.value).toBe(false);
        expect(flush).not.toHaveBeenCalled();

        await draft.run('delete', () => true);
        const save = vi.fn(() => true);
        expect(await draft.run('save', save)).toBe(false);
        expect(save).not.toHaveBeenCalled();
        draft.reset();
        expect(draft.locked.value).toBe(false);
    });
});
