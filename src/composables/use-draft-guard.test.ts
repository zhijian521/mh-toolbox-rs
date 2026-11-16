import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useConfirmState } from './use-confirm';
import { confirmDiscardDrafts, useDraftGuard } from './use-draft-guard';

const scopes: ReturnType<typeof effectScope>[] = [];
const { pending, settle } = useConfirmState();

function editor() {
    const scope = effectScope();
    scopes.push(scope);
    const changed = ref(false);
    const busy = ref(false);
    const close = vi.fn();
    const guard = scope.run(() =>
        useDraftGuard(
            () => changed.value,
            () => busy.value,
            close,
        ),
    )!;
    return { ...guard, changed, busy, close, scope };
}

afterEach(async () => {
    settle(false);
    scopes.splice(0).forEach((scope) => scope.stop());
    await Promise.resolve();
});

describe('复杂编辑草稿保护', () => {
    it('没有修改直接关闭；保存期间拒绝关闭且不弹确认', async () => {
        const form = editor();
        form.busy.value = true;
        await form.requestClose();
        expect(form.close).not.toHaveBeenCalled();
        expect(pending.value).toBeNull();
        form.busy.value = false;
        await form.requestClose();
        expect(form.close).toHaveBeenCalledOnce();
    });

    it('取消保留草稿；重复关闭只弹一次，确认后只关闭一次', async () => {
        const form = editor();
        form.changed.value = true;
        const cancelled = form.requestClose();
        expect(pending.value?.cancelText).toBe('继续编辑');
        settle(false);
        await cancelled;
        expect(form.close).not.toHaveBeenCalled();
        const closed = form.requestClose();
        const question = pending.value;
        await form.requestClose();
        expect(pending.value).toBe(question);
        settle(true);
        await closed;
        expect(form.close).toHaveBeenCalledOnce();
        expect(form.changed.value).toBe(true);
    });

    it('页面离开和系统关窗共用一次确认，确认不会把草稿当成已保存', async () => {
        const form = editor();
        form.changed.value = true;
        const route = confirmDiscardDrafts();
        const question = pending.value;
        const windowClose = confirmDiscardDrafts();
        expect(pending.value).toBe(question);
        settle(true);
        expect(await route).toBe(true);
        expect(await windowClose).toBe(true);
        expect(form.close).not.toHaveBeenCalled();
        const again = confirmDiscardDrafts();
        expect(pending.value).not.toBeNull();
        settle(false);
        expect(await again).toBe(false);
    });

    it('等待确认时开始保存则阻止关闭；卸载的编辑器不再拦截导航', async () => {
        const form = editor();
        form.changed.value = true;
        const closing = form.requestClose();
        form.busy.value = true;
        settle(true);
        await closing;
        expect(form.close).not.toHaveBeenCalled();
        expect(await confirmDiscardDrafts()).toBe(false);
        form.scope.stop();
        expect(await confirmDiscardDrafts()).toBe(true);
    });
});
