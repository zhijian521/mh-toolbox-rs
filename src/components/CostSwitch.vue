<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRovingFocus } from '../composables/use-roving-focus';

/**
 * 两格位移开关（不是勾选框）。
 *
 * 状态变化靠**位移**：滑块真的滑过去，240ms 带回弹的曲线；关闭时不是变灰而是「灭灯」
 * （墨 16% 哑面），因为朱红的明度比槽底高，浅色下会与槽同色读不出来。
 *
 * 语义是二选一，所以按 `radiogroup` 给读屏：两格共用一个 Tab 停靠点，
 * 左右方向键切换（`useRovingFocus`，与滑块、分段胶囊同一套）。
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        offLabel?: string;
        onLabel?: string;
        disabled?: boolean;
    }>(),
    { offLabel: '不记', onLabel: '记', disabled: false },
);
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();

const cells = ref<HTMLButtonElement[]>([]);

/* 两格写成一份数据而不是两段硬编码的模板：顺序、`aria-checked`、tabindex 都只有一个来源，
 * 加第三格时也不必再复制一段。 */
const items = computed(() => [
    { value: false, label: props.offLabel },
    { value: true, label: props.onLabel },
]);

function choose(value: boolean) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

const { tabIndexFor, onKeydown } = useRovingFocus({
    count: () => items.value.length,
    activeIndex: () => (props.modelValue ? 1 : 0),
    pick: (index) => choose(index === 1),
    cells: () => cells.value,
    axis: 'horizontal',
    enabled: () => !props.disabled,
});
</script>

<template>
    <span
        class="cost-switch well"
        :class="{ off: !modelValue }"
        role="radiogroup"
        :aria-disabled="disabled"
        @keydown="onKeydown"
    >
        <span class="cost-thumb" :class="{ right: modelValue }" aria-hidden="true" />
        <button
            v-for="(item, i) in items"
            :key="String(item.value)"
            ref="cells"
            class="cost-opt"
            type="button"
            role="radio"
            :aria-checked="modelValue === item.value"
            :tabindex="tabIndexFor(i)"
            :disabled="disabled"
            @click="choose(item.value)"
        >
            {{ item.label }}
        </button>
    </span>
</template>
