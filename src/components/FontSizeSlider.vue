<script setup lang="ts">
import type { FontScale } from '../composables/use-font-scale';
import { useRovingFocus } from '../composables/use-roving-focus';

/**
 * 三段字号滑块。
 *
 * 不做原生 `<input type="range">`：那条控件在 Windows 上永远是系统外观，与凹槽语言
 * 完全不搭，也读不出「凹」。这里用同一套凹槽做轨道，滑块是一枚朱印，
 * 位移走 240ms 回弹曲线——三格是三个落点，不是连续值，所以滑块必须「啪」地落到格上。
 *
 * 语义是单选，给 `radiogroup`；三格共用一个 Tab 停靠点，左右方向键切换
 * （`useRovingFocus`，与侧栏竖槽、两格开关、分段胶囊同一套）。
 */
const props = defineProps<{ modelValue: FontScale; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: FontScale): void }>();

const options: { value: FontScale; label: string }[] = [
    { value: 'small', label: '较小' },
    { value: 'default', label: '默认' },
    { value: 'large', label: '较大' },
];

function choose(value: FontScale) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

const { cells, indexOf, tabIndexFor, onKeydown } = useRovingFocus<FontScale>({
    values: () => options.map((option) => option.value),
    activeValue: () => props.modelValue,
    pick: (index) => choose(options[index].value),
    axis: 'horizontal',
    enabled: () => !props.disabled,
});
</script>

<template>
    <span class="size-slider well" role="radiogroup" aria-label="字号" @keydown="onKeydown">
        <span
            class="size-thumb stamp"
            aria-hidden="true"
            :style="{ transform: `translateX(${indexOf(modelValue) * 100}%)` }"
        />
        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="size-opt track-opt"
            role="radio"
            :aria-checked="modelValue === option.value"
            :tabindex="tabIndexFor(i)"
            :disabled="disabled"
            @click="choose(option.value)"
        >
            {{ option.label }}
        </button>
    </span>
</template>

<style scoped>
/* 轨道：深度来自全局 `.well`（`base.css`），这里只管它是「三格」这件几何。 */
.size-slider {
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    padding: 2px;
    border-radius: var(--r-pill);
}
/* 宽度按「padding box 减去两侧内边距再三等分」算，不能写 `33.3333% - 2px`：
 * 百分比以 padding box（含 2px×2 内边距）为基准解析，减 2px 只得 47.33 而不是 48，
 * 位移又是 `translateX(i * 100%)`（按自身宽度步进），于是末档累计空出 2px、右缘露缝。
 * 两格的 `.cost-thumb` 恰好在 `50% - 2px` 上对得齐，三格才把误差放大出来。
 * 印面（底色 / 受光 / 投影）来自全局 `.stamp`，这里只有几何。 */
.size-thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / 3);
    border-radius: var(--r-pill);
    transition: transform var(--t-thumb) var(--ease-snap);
}
/* 拖动中只压内影：滑块按下去是「正在拖」，不是「被按」——不换底色。 */
.size-slider:active .size-thumb {
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}
/* 单选格：格本身的样式（字色、行高、白空间、过渡）来自全局 `.track-opt`，
 * 这里只有内边距——三格比两格窄，字两侧的留白要收紧 2px。 */
.size-opt {
    padding: 3px 12px;
}
.size-opt:disabled {
    cursor: default;
}
</style>
