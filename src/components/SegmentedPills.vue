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
        /** 外壳圆角。默认大圆角胶囊；贴进方角结构里时用 `sm`。 */
        radius?: 'pill' | 'sm';
    }>(),
    { label: '', disabled: false, radius: 'pill' },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
</script>

<template>
    <div
        class="segmented"
        :class="{ 'radius-sm': radius === 'sm' }"
        role="group"
        :aria-label="label || undefined"
    >
        <BevelPill
            v-for="option in options"
            :key="option.value"
            :on="modelValue === option.value"
            :disabled="disabled"
            :radius="radius"
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
/* 小圆角外壳比里面的胶囊大一号（4 vs 3）：同心才不显得边缘毛糙。 */
.segmented.radius-sm {
    border-radius: var(--r-3);
}
</style>
