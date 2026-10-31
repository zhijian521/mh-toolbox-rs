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

const indexOf = (value: FontScale) =>
    Math.max(
        0,
        options.findIndex((item) => item.value === value),
    );

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
/* 宽度按「padding box 减去两侧内边距再三等分」算，不能写 `33.3333% - 2px`：
 * 百分比以 padding box（含 2px×2 内边距）为基准解析，减 2px 只得 47.33 而不是 48，
 * 位移又是 `translateX(i * 100%)`（按自身宽度步进），于是末档累计空出 2px、右缘露缝。
 * 两格的 `.cost-thumb` 恰好在 `50% - 2px` 上对得齐，三格才把误差放大出来。 */
.size-thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / 3);
    border-radius: var(--r-pill);
    background-color: var(--seal);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 46%, var(--bevel-lo));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 3px 7px color-mix(in srgb, var(--seal) 28%, transparent);
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
/* 选中那格的字要压在朱印上：用成对的 `--on-seal`（暗色下它与 `--seal` 一起换）。
 * 不加粗：文楷本地只有 Regular，600 是合成加粗，会把撇捺糊成一块；
 * 也不描边——竖版那个滑块就是被 0.25px 描边撑成了「假粗」，两版要有一致的字重。 */
.size-opt[aria-checked='true'] {
    color: var(--on-seal);
}
.size-opt:disabled {
    cursor: default;
}
</style>
