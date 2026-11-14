import { computed, readonly, ref } from 'vue';

/** 内存变更只执行一次；落盘失败后锁定草稿，重试只重新写盘。 */
export function usePersistedSubmit(flush: () => Promise<boolean>, retry: () => Promise<boolean>) {
    const saving = ref(false);
    const action = ref<string | null>(null);
    const locked = computed(() => saving.value || action.value !== null);

    async function run(key: string, apply: () => boolean): Promise<boolean> {
        if (saving.value || (action.value !== null && action.value !== key)) return false;
        saving.value = true;
        try {
            if (action.value !== null) {
                await retry();
            } else {
                if (!apply()) return false;
                action.value = key;
            }
            if (!(await flush())) return false;
            action.value = null;
            return true;
        } finally {
            saving.value = false;
        }
    }

    function reset() {
        if (!saving.value) action.value = null;
    }

    return { saving: readonly(saving), action: readonly(action), locked, run, reset };
}
