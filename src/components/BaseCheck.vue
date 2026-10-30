<script setup lang="ts">
/**
 * 勾选项：根元素就是 `<label>`，整行可点。
 *
 * 两条硬约束（踩过）：
 * 1. 表单里写 `label` 规则必须带 `:not(.check)`，否则后代选择器特异性更高，
 *    会把这一行的横排整个顶掉。
 * 2. 对齐靠 `.text` 的行高，不靠 flex 居中——16px 方框与 13.5px 文字的中线不会自己重合。
 */
defineProps<{ modelValue: boolean; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();
</script>

<template>
    <label class="check" :class="{ disabled }">
        <input
            type="checkbox"
            :checked="modelValue"
            :disabled="disabled"
            @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span class="check-box">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                    d="M2 5.2 4.2 7.4 8 2.8"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </span>
        <span class="text"><slot /></span>
    </label>
</template>

<style scoped>
.check.disabled {
    opacity: 0.45;
    cursor: default;
}
/* 中文字形重心偏上，方框与文字的中线差 1px 左右；用行高对齐，别用 align-items 硬掰。 */
.text {
    line-height: 1.6;
}
</style>
