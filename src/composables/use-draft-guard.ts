/** 弹窗、页面切换和系统关窗共用草稿保护；确认不会把草稿标成已保存。 */
import { onScopeDispose } from 'vue';
import { askConfirm } from './use-confirm';

interface DraftGuard {
    changed: () => boolean;
    busy: () => boolean;
}

const guards = new Set<DraftGuard>();
let question: Promise<boolean> | null = null;

async function confirmDiscard(list: readonly DraftGuard[]): Promise<boolean> {
    if (list.some((guard) => guard.busy())) return false;
    if (!list.some((guard) => guard.changed())) return true;
    question ??= askConfirm({
        danger: true,
        title: '放弃未保存的修改？',
        note: '未保存的内容将被丢弃，放弃后需要重新填写。',
        confirmText: '放弃修改',
        cancelText: '继续编辑',
    }).finally(() => {
        question = null;
    });
    return (await question) && !list.some((guard) => guard.busy());
}

export function confirmDiscardDrafts(): Promise<boolean> {
    return confirmDiscard([...guards]);
}

export function useDraftGuard(changed: () => boolean, busy: () => boolean, close: () => void) {
    const guard = { changed, busy };
    guards.add(guard);
    onScopeDispose(() => guards.delete(guard));

    let closing = false;
    async function requestClose() {
        if (closing) return;
        closing = true;
        try {
            if ((await confirmDiscard([guard])) && guards.has(guard)) close();
        } finally {
            closing = false;
        }
    }

    return { requestClose };
}
