<script setup lang="ts">
import type { FontScale } from '../composables/use-font-scale';

/**
 * 三段字号滑块。
 *
 * 不做原生 `<input type="range">`：那条控件在 Windows 上永远是系统外观，与凹槽语言
 * 完全不搭，也读不出「凹」。这里用同一套四件套做轨道，滑块是一枚朱印，
 * 位移走 240ms 回弹曲线——三格是三个落点，不是连续值，所以滑块必须「啪」地落到格上。
 *
 * 语义是单选，给 `radiogroup`；左右方向键可切换。
 */
const props = defineProps<{ modelValue: FontScale; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: FontScale): void }>();

const options: { value: FontScale; label: string }[] = [
    { value: 'small', label: '较小' },
    { value: 'default', label: '默认' },
    { value: 'large', label: '较大' },
];

const indexOf = (value: FontScale) => Math.max(0, options.findIndex((item) => item.value === value));

function choose(value: FontScale) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

function onKeydown(event: KeyboardEvent) {
    if (props.disabled) return;
    const current = indexOf(props.modelValue);
    if (event.key === 'ArrowLeft' && current > 0) {
        event.preventDefault();
        choose(options[current - 1].value);
    } else if (event.key === 'ArrowRight' && current < options.length - 1) {
        event.preventDefault();
        choose(options[current + 1].value);
    }
}
</script>

<template>
    <span class="size-slider" role="radiogroup" aria-label="字号" @keydown="onKeydown">
        <span
            class="size-thumb"
            aria-hidden="true"
            :style="{ transform: `translateX(${indexOf(modelValue) * 100}%)` }"
        />
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="size-opt"
            role="radio"
            :aria-checked="modelValue === option.value"
            :disabled="disabled"
            @click="choose(option.value)"
        >
            {{ option.label }}
        </button>
    </span>
</template>

<style scoped>
/* 轨道：与 .cost-switch 同一套凹槽四件套，只是三格而不是两格。 */
.size-slider {
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    padding: 2px;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 80%, transparent);
    border-radius: var(--r-pill);
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
}
.size-thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc(33.3333% - 2px);
    border-radius: var(--r-pill);
    background-color: var(--cinnabar);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 46%, var(--bevel-lo));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 3px 7px color-mix(in srgb, var(--cinnabar) 28%, transparent);
    transition: transform var(--t-thumb) var(--ease-snap);
}
.size-slider:active .size-thumb {
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}
.size-opt {
    position: relative;
    z-index: 1;
    padding: 3px 12px;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: var(--fs-sm);
    line-height: 17px;
    white-space: nowrap;
    transition: color var(--t-mid) var(--ease-soft);
}
/* 选中那格的字要压在朱印上：用 --on-cinnabar，别用纯白（暗色下会发飘）。 */
.size-opt[aria-checked='true'] {
    color: var(--on-cinnabar);
    font-weight: 600;
}
.size-opt:disabled {
    cursor: default;
}
</style>
