<script setup lang="ts" generic="T extends string">
import { ref } from 'vue';

/**
 * 多选胶囊：一组**可以同时按下好几枚**的独立开关。
 *
 * 与 `SegmentedPills` 是同一套材质、两种语义：
 *   - `SegmentedPills` 是 `radiogroup`——九个里选一个，读屏念「选项，三之一，已选中」；
 *   - 这里是 `group` + 每枚 `aria-pressed`——读屏念「切换按钮，已按下」，
 *     因为按下第二枚不会弹起第一枚。
 *
 * **不靠一个 prop 兼两种**：`role="radio"` 配上可多选，读屏会把状态念反，而这套界面
 * 里「选了谁」是账本的口径问题、不是外观差异。两件东西的材质与几何完全一致，所以
 * `.pill-group` 与 `.bevel-pill` 一字不写地复用 `base.css` 里那一份——这里只留
 * 「按下了哪几个」。
 *
 * ---- 键盘没有复用 `useRovingFocus` ----
 * 那个 composable 的方向键**顺着把选项选中**（单选组的约定：移到哪格就到哪格）。
 * 放进多选组会变成「用左右键从头翻到尾，一路把经过的每一格都按下去」——多选最典型的
 * 误操作。所以这里自己管键盘，按 WAI-ARIA 的开关组约定：
 *   - 整组一个 Tab 停靠点（`tabindex` 只给一格 0，其余 -1）；
 *   - 左右键**只移动焦点**，不动选中；
 *   - `空格 / 回车` 切换当前格（原生 `<button>` 的 click 本来就管这两键）。
 *
 * 焦点记在**组件自己的下标**上而不是「第一个选中项」：多选组里选中项会变、会清空，
 * 而焦点是一个独立的东西——跟着选中项走会让方向键按两下就跳回原处。
 */
const props = withDefaults(
    defineProps<{
        /** 已按下的值。空数组 = 一个都没按。 */
        modelValue: T[];
        options: { value: T; label: string; disabled?: boolean }[];
        label?: string;
        disabled?: boolean;
        /** 外壳圆角。与 `SegmentedPills` 同义：贴进方角结构时用 `sm`。 */
        radius?: 'pill' | 'sm';
    }>(),
    { label: '', disabled: false, radius: 'pill' },
);

const emit = defineEmits<{ 'update:modelValue': [value: T[]] }>();

const isDisabled = (index: number) => Boolean(props.options[index]?.disabled);
const isOn = (value: T) => props.modelValue.includes(value);

function toggle(value: T) {
    if (props.disabled) return;
    emit(
        'update:modelValue',
        isOn(value)
            ? props.modelValue.filter((one) => one !== value)
            : [...props.modelValue, value],
    );
}

/* 焦点格：初始落在第一枚可选项上，之后跟着人走。
 * `focus` 事件也要更新它——鼠标点了第三枚之后按方向键，该从第三枚继续，而不是回第一枚。 */
const focusIndex = ref(0);
const cells = ref<HTMLButtonElement[]>([]);

function tabIndexFor(index: number) {
    return index === focusIndex.value ? 0 : -1;
}

function onFocus(index: number) {
    focusIndex.value = index;
}

/** 下一个可选格；一路到底就停在原地（不绕圈——绕圈会让「到头了」没有可感知的边界）。 */
function step(from: number, dir: 1 | -1): number {
    const last = props.options.length - 1;
    for (let i = from + dir; i >= 0 && i <= last; i += dir) {
        if (!isDisabled(i)) return i;
    }
    return from;
}

function onKeydown(event: KeyboardEvent) {
    if (props.disabled) return;
    const current = focusIndex.value;
    let next: number | undefined;

    if (event.key === 'ArrowRight') next = step(current, 1);
    else if (event.key === 'ArrowLeft') next = step(current, -1);
    else if (event.key === 'Home') next = step(-1, 1);
    else if (event.key === 'End') next = step(props.options.length, -1);
    else return;

    /* 上下键、空格、回车一律放行：空格要给下面的 `<button>` 去切换，
     * 上下键要给页面去滚。只吃自己认的这四个。 */
    event.preventDefault();
    if (next === current) return;
    focusIndex.value = next;
    cells.value[next]?.focus();
}
</script>

<template>
    <div
        class="pill-group"
        :class="{ 'radius-sm': radius === 'sm' }"
        role="group"
        :aria-label="label || undefined"
        @keydown="onKeydown"
    >
        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="bevel-pill"
            :class="{
                well: !isOn(option.value),
                on: isOn(option.value),
                stamp: isOn(option.value),
                'radius-sm': radius === 'sm',
            }"
            :aria-pressed="isOn(option.value)"
            :tabindex="tabIndexFor(i)"
            :disabled="disabled || option.disabled"
            @click="toggle(option.value)"
            @focus="onFocus(i)"
        >
            {{ option.label }}
        </button>
    </div>
</template>
