<script setup lang="ts" generic="T extends string">
import BevelPill from './BevelPill.vue';

/**
 * 分段胶囊：一组互斥选项，选中的那格灌满朱红。
 *
 * 它只管「一组里选一个」这件事——选项文案与值的类型由调用方给（泛型 T）。
 * 单格的样子交给 `BevelPill`，自己不重复写质感。
 *
 * 底下垫一层 `--paper-2` 的板：胶囊直接摆在页面底色上读不出凹（暗色下尤甚）。
 * 这层板和 `base.css` 里的 `.bevel-pill` 一样，是**容器**的职责，不是胶囊的。
 */
withDefaults(
    defineProps<{
        modelValue: T;
        options: { value: T; label: string }[];
        label?: string;
        disabled?: boolean;
    }>(),
    { label: '', disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
</script>

<template>
    <div class="segmented" role="group" :aria-label="label || undefined">
        <BevelPill
            v-for="option in options"
            :key="option.value"
            :on="modelValue === option.value"
            :disabled="disabled"
            @click="emit('update:modelValue', option.value)"
        >
            {{ option.label }}
        </BevelPill>
    </div>
</template>

<style scoped>
.segmented {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--paper-2);
}
</style>
