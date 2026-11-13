import { computed, ref, type Ref } from 'vue';

/** 金额只接受整币正数；实际输入或提交后才显示错误，避免取消时失焦撑高弹窗。 */
export function usePositiveAmount(amount: Ref<number | null>, label: () => string) {
    const typed = ref(false);
    const submitted = ref(false);
    const canSave = computed(
        () => Number.isFinite(amount.value) && Math.round(amount.value ?? 0) > 0,
    );
    const error = computed(() => (canSave.value ? '' : label() + '要大于 0'));
    const showError = computed(() => (typed.value || submitted.value) && !!error.value);
    return { typed, submitted, canSave, error, showError };
}
