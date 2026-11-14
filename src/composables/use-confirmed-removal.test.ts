import { describe, expect, it, vi } from 'vitest';
import { useConfirmedRemoval } from './use-confirmed-removal';

const confirm = vi.hoisted(() => vi.fn());
vi.mock('./use-confirm', () => ({ askConfirm: confirm }));
vi.mock('./save-feedback', () => ({ saved: (flush: () => Promise<boolean>) => flush() }));

describe('确认删除共用防连点', () => {
    it('确认和写盘期间只应用一次删除', async () => {
        let answer!: (value: boolean) => void;
        let finish!: (value: boolean) => void;
        confirm.mockImplementationOnce(
            () =>
                new Promise<boolean>((resolve) => {
                    answer = resolve;
                }),
        );
        const flush = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finish = resolve;
                }),
        );
        const apply = vi.fn();
        const removal = useConfirmedRemoval(() => false, flush);
        const first = removal.run({ title: '删除？' }, apply);
        expect(removal.removing.value).toBe(true);
        expect(await removal.run({ title: '删除？' }, apply)).toBe(false);
        answer(true);
        await Promise.resolve();
        expect(apply).toHaveBeenCalledTimes(1);
        expect(await removal.run({ title: '删除？' }, apply)).toBe(false);
        finish(true);
        expect(await first).toBe(true);
        expect(removal.removing.value).toBe(false);
    });

    it('取消或确认期间出现写入阻塞时不删，失败释放交互锁', async () => {
        const apply = vi.fn();
        const flush = vi.fn().mockResolvedValue(false);
        let blocked = false;
        const removal = useConfirmedRemoval(() => blocked, flush);
        confirm.mockResolvedValueOnce(false);
        expect(await removal.run({ title: '删除？' }, apply)).toBe(false);
        confirm.mockImplementationOnce(async () => {
            blocked = true;
            return true;
        });
        expect(await removal.run({ title: '删除？' }, apply)).toBe(false);
        expect(apply).not.toHaveBeenCalled();
        expect(flush).not.toHaveBeenCalled();
        blocked = false;
        confirm.mockResolvedValueOnce(true);
        expect(await removal.run({ title: '删除？' }, apply)).toBe(false);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(removal.removing.value).toBe(false);
    });
});

it('业务删除失败不等待写盘或返回成功', async () => {
    confirm.mockResolvedValueOnce(true);
    const flush = vi.fn(async () => true);
    const removal = useConfirmedRemoval(() => false, flush);
    expect(await removal.run({ title: '删除？' }, () => false)).toBe(false);
    expect(flush).not.toHaveBeenCalled();
});
