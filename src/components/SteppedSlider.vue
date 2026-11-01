<script setup lang="ts" generic="T extends string">
import { computed } from 'vue';
import { useRovingFocus } from '../composables/use-roving-focus';

/**
 * 多档滑块：一条凹槽，一枚会落格的朱印。
 *
 * 档数由 `options` 决定，不写死三档——轨迹是「按格数等分」，几何只有
 * `repeat(N, …)` 与 `(100% - 4px) / N` 两处跟着 N 走。字号、单边规则都是三档，
 * 但四档不需要改这个文件。
 *
 * 不做原生 `<input type="range">`：那条控件在 Windows 上永远是系统外观，与凹槽语言
 * 完全不搭，也读不出「凹」。这里用同一套凹槽做轨道，滑块是一枚朱印，
 * 位移走 240ms 回弹曲线——每档是一个落点，不是连续值，所以滑块必须「啪」地落到格上。
 *
 * 语义是单选，给 `radiogroup`；各格共用一个 Tab 停靠点，左右方向键切换
 * （`useRovingFocus`，与侧栏竖槽、两格开关、分段胶囊同一套）。
 *
 * **宽度不给**，由调用方定：`inline-grid` 收缩到内容宽，外面写 `width: 100%`
 * （父级 scoped 样式挂在这个根元素上即可）就撑满可用宽度。
 */
const props = withDefaults(
    defineProps<{
        modelValue: T;
        options: { value: T; label: string }[];
        /** 读屏念的组名。缺省时 `radiogroup` 没有名字，读屏只会念「单选组」。 */
        label?: string;
        disabled?: boolean;
    }>(),
    { label: '', disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function choose(value: T) {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
}

/* 格数至少为 1：`options` 为空时 `repeat(0, …)` 是非法值，整条轨道会塌成 0 宽。 */
const count = computed(() => Math.max(1, props.options.length));

const tracks = computed(() => `repeat(${count.value}, minmax(0, 1fr))`);
/* 宽度按「padding box 减去两侧内边距再三等分」算，不能写 `33.3333% - 2px`：
 * 百分比以 padding box（含 2px×2 内边距）为基准解析，减 2px 只得 47.33 而不是 48，
 * 位移又是 `translateX(i * 100%)`（按自身宽度步进），于是末档累计空出 2px、右缘露缝。
 * 两格恰好对得齐，三格才把误差放大出来。 */
const thumbWidth = computed(() => `calc((100% - 4px) / ${count.value})`);

const { cells, indexOf, tabIndexFor, onKeydown } = useRovingFocus<T>({
    values: () => props.options.map((option) => option.value),
    activeValue: () => props.modelValue,
    pick: (index) => choose(props.options[index].value),
    axis: 'horizontal',
    enabled: () => !props.disabled,
});
</script>

<template>
    <span
        class="stepped well"
        role="radiogroup"
        :aria-label="label || undefined"
        :style="{ gridTemplateColumns: tracks }"
        @keydown="onKeydown"
    >
        <span
            class="step-thumb stamp"
            aria-hidden="true"
            :style="{ width: thumbWidth, transform: `translateX(${indexOf(modelValue) * 100}%)` }"
        />
        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="step-opt track-opt"
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
/* 轨道：深度来自全局 `.well`（`base.css`），这里只管「N 格等分」这件几何。
 * 列宽由内联的 `gridTemplateColumns` 给（它是数据，不是样式）。 */
.stepped {
    position: relative;
    display: inline-grid;
    align-items: center;
    padding: 2px;
    border-radius: var(--r-pill);
}
/* 印面（底色 / 受光 / 投影）来自全局 `.stamp`，这里只有几何。 */
.step-thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    border-radius: var(--r-pill);
    transition: transform var(--t-thumb) var(--ease-snap);
}
/* 拖动中只压内影：滑块按下去是「正在拖」，不是「被按」——不换底色。 */
.stepped:active .step-thumb {
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}
/* 单选格：格本身的样式（字色、行高、白空间、过渡）来自全局 `.track-opt`，
 * 这里只有内边距。三格比两格窄，字两侧的留白要收紧到 8px——
 * 12px 在侧栏那种 220px 宽的槽里会让「不收窄」把格子顶出去。 */
.step-opt {
    padding: 3px 8px;
}
.step-opt:disabled {
    cursor: default;
}
</style>
