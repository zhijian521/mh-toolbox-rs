<script setup lang="ts">
/**
 * 两格位移开关（不是勾选框）。
 *
 * 状态变化靠**位移**：滑块真的滑过去，240ms 带回弹的曲线；关闭时不是变灰而是「灭灯」
 * （墨 16% 哑面），因为朱红的明度比槽底高，浅色下会与槽同色读不出来。
 *
 * 语义是二选一，所以按 `radiogroup` 给读屏，左右方向键也能切换。
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

function choose(value: boolean) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        choose(false);
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        choose(true);
    }
}
</script>

<template>
    <span
        class="cost-switch"
        :class="{ off: !modelValue }"
        role="radiogroup"
        :aria-disabled="disabled"
        @keydown="onKeydown"
    >
        <span class="cost-thumb" :class="{ right: modelValue }" aria-hidden="true" />
        <button
            class="cost-opt"
            type="button"
            role="radio"
            :aria-checked="!modelValue"
            :disabled="disabled"
            @click="choose(false)"
        >
            {{ offLabel }}
        </button>
        <button
            class="cost-opt"
            type="button"
            role="radio"
            :aria-checked="modelValue"
            :disabled="disabled"
            @click="choose(true)"
        >
            {{ onLabel }}
        </button>
    </span>
</template>
