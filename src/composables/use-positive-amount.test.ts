import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { usePositiveAmount } from './use-positive-amount';

describe('金额校验', () => {
    it('未输入不显示错误，输入后显示，改正后清除', () => {
        const amount = ref<number | null>(null);
        const form = usePositiveAmount(amount, () => '单价');
        expect(form.showError.value).toBe(false);
        form.typed.value = true;
        expect(form.showError.value).toBe(true);
        amount.value = 1;
        expect(form.canSave.value).toBe(true);
        expect(form.showError.value).toBe(false);
    });

    it('拒绝无穷值和取整后为零的金额', () => {
        const amount = ref<number | null>(Infinity);
        const form = usePositiveAmount(amount, () => '金额');
        expect(form.canSave.value).toBe(false);
        amount.value = 0.4;
        expect(form.canSave.value).toBe(false);
        amount.value = 0.6;
        expect(form.canSave.value).toBe(true);
    });
});
