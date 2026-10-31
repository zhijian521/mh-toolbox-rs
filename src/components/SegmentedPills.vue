<script setup lang="ts" generic="T extends string">
import { ref } from 'vue';
import { useRovingFocus } from '../composables/use-roving-focus';

/**
 * 分段胶囊：一组互斥选项，选中的那格灌满朱红。
 *
 * 它只管「一组里选一个」这件事——选项文案与值的类型由调用方给（泛型 T）。
 * 单格的质感来自全局 `.bevel-pill`，这里不重写。
 *
 * **不用 `BevelPill` 组件**：那枚胶囊自带 `aria-pressed`，语义是「独立的开关」；
 * 放进互斥组里会与 `aria-checked` 打架，读屏会念成「切换按钮，已按下」而不是
 * 「选项，三之一，已选中」。一组里的格子还需要 roving tabindex（整组一个停靠点），
 * 这也不是单枚胶囊能表达的状态。
 *
 * 底下垫一层 `--paper-2` 的板：胶囊直接摆在页面底色上读不出凹（暗色下尤甚）。
 * 这层板是**容器**的职责，不是胶囊的——写在 `base.css` 的 `.pill-group` 里，
 * 演示页的胶囊组用的是同一条，两边不会再各改一份。
 */
const props = withDefaults(
    defineProps<{
        modelValue: T;
        /** 单个选项也可以禁用（除了整组禁用）：禁用项不参与方向键，但位置保留。 */
        options: { value: T; label: string; disabled?: boolean }[];
        label?: string;
        disabled?: boolean;
        /** 外壳圆角。默认大圆角胶囊；贴进方角结构里时用 `sm`。 */
        radius?: 'pill' | 'sm';
    }>(),
    { label: '', disabled: false, radius: 'pill' },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const cells = ref<HTMLButtonElement[]>([]);

const indexOf = (value: T) =>
    Math.max(
        0,
        props.options.findIndex((option) => option.value === value),
    );

const isDisabled = (index: number) => Boolean(props.options[index]?.disabled);

function choose(value: T) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

/* 与侧栏竖槽、两个滑块共用同一套键盘行为：整组一个 Tab 停靠点，左右键切换并带走焦点。 */
const { tabIndexFor, onKeydown } = useRovingFocus({
    count: () => props.options.length,
    activeIndex: () => indexOf(props.modelValue),
    pick: (index) => choose(props.options[index].value),
    cells: () => cells.value,
    axis: 'horizontal',
    enabled: () => !props.disabled,
    isDisabled,
});
</script>

<template>
    <div
        class="pill-group"
        :class="{ 'radius-sm': radius === 'sm' }"
        role="radiogroup"
        :aria-label="label || undefined"
        @keydown="onKeydown"
    >
        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="bevel-pill well"
            :class="{ on: modelValue === option.value, 'radius-sm': radius === 'sm' }"
            role="radio"
            :aria-checked="modelValue === option.value"
            :tabindex="tabIndexFor(i)"
            :disabled="disabled || option.disabled"
            @click="choose(option.value)"
        >
            {{ option.label }}
        </button>
    </div>
</template>
