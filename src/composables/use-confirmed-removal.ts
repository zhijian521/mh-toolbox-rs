import { readonly, ref } from 'vue';
import { askConfirm, type ConfirmOptions } from './use-confirm';
import { saved } from './save-feedback';

/** 从确认到落盘共用一把锁，确认期间状态改变也不能继续删除。 */
export function useConfirmedRemoval(blocked: () => boolean, flush: () => Promise<boolean>) {
    const removing = ref(false);

    async function run(options: ConfirmOptions, apply: () => void): Promise<boolean> {
        if (removing.value || blocked()) return false;
        removing.value = true;
        try {
            if (!(await askConfirm(options)) || blocked()) return false;
            apply();
            return await saved(flush);
        } finally {
            removing.value = false;
        }
    }

    return { removing: readonly(removing), run };
}
