<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PressButton from './PressButton.vue';

/**
 * 价格格：大号数字 + 固定的「万」后缀，可选两侧加减。
 *
 * 梦幻币的价格几乎都在万以上——界面上让人打 `3200000` 再自己数零，是把换算的活推给了人。
 * 这一格只收「万」（320），但 **v-model 进出的都是游戏币原值**（3200000）：
 * 换算关在组件里，调用方拿到的仍是 `prices.ts` 那一套口径，不必每处都记得 ×10000。
 *
 * ## 为什么单独做一个，不直接给 `NumberField` 加后缀
 *
 * 它是**读数主角**。在记价窗里，价格是唯一必须填对的东西：所以它字比正文大两号、
 * 数字居中、两侧留出加减的位置。`NumberField` 是「表格里的一个格子」，
 * 26px 高、左对齐、挤在表单的一列里——两者尺寸和语气都不同，硬合成一个只会两头不像。
 *
 * ## 槽是借来的，不是自画的
 *
 * `.field` 那四件套（边框 / 底色 / 顶壁渐变 / 内底亮线）已经和 `SlotButton` 共用一个槽了，
 * 这里只换尺码：高度不压 26、内衬加大、圆角升一档。再画一套「看起来差不多」的凹槽，
 * 就会重演 2026-11-02 那次「两套深浅」的问题。
 */
const props = withDefaults(
    defineProps<{
        /** 游戏币**原值**。`null` 表示还没填。 */
        modelValue: number | null;
        label?: string;
        error?: string;
        /**
         * `lg` 是主角（记价窗里价格是唯一必须填对的东西），`md` 是配角
         * （新建卡时的「初始价」是可选项，跟其它字段同一档语气就够）。
         * 两档只差字与内衬，槽还是同一道槽。
         */
        size?: 'lg' | 'md';
        placeholder?: string;
        /** 两侧的加减印块。开了之后输入格自己收窄，让出两边。 */
        stepper?: boolean;
    }>(),
    { label: '', error: '', size: 'lg', placeholder: '0', stepper: false },
);

const emit = defineEmits<{ 'update:modelValue': [number | null] }>();

/** 原值 → 输入框里的「万」。最多留 4 位小数：12345 元 → 1.2345 万。 */
function toWan(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value <= 0) return '';
    return String(Number((value / 10000).toFixed(4)));
}

const text = ref(toWan(props.modelValue));

watch(
    () => props.modelValue,
    (value) => {
        /* 只有「外面真的改了」才覆盖输入框。
         *
         * 判定用「回算成原值后是否相等」，而不是比字符串：用户正在打 `3.` 的时候，
         * 上游已经把 30000 写回来了；字符串 `3.` 与 `3` 不等，但它们是同一个值。
         * 直接按字符串覆盖会把刚敲的小数点吃掉——于是永远输不进 3.5 万。 */
        const current = Math.round(Number(text.value) * 10000);
        if (current !== (value ?? 0)) text.value = toWan(value);
    },
);

function onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    /* 只留数字与一个小数点。在输入时清，不是失焦时清——
     * 失焦才清的话，用户会先看着一串非法字符停在那儿，然后才消失。 */
    const cleaned = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    text.value = cleaned;
    /* 受控值被拒时（比如打了第二个小数点），DOM 里还留着旧字符串，手动写回去。 */
    input.value = cleaned;

    const parsed = Number(cleaned);
    emit(
        'update:modelValue',
        cleaned === '' || !Number.isFinite(parsed) ? null : Math.round(parsed * 10000),
    );
}

/**
 * 加减一次的步长，**跟着量级走**。
 *
 * 固定 1 万在 320 万的价上还说得过去，在 15000 万（1.5 亿）上要点一万五千次——
 * 那就不是快捷键，是惩罚。三档按当前值的数量级分：
 * 一千万以上 ±100 万，一百万以上 ±10 万，其余 ±1 万。
 */
function stepSize(value: number): number {
    if (value >= 10000000) return 1000000;
    if (value >= 1000000) return 100000;
    return 10000;
}

/** 读屏念的「减 10 万」与按钮实际步长用同一个数。 */
const stepWan = computed(() => stepSize(props.modelValue ?? 0) / 10000);

/**
 * 输入框宽度跟着内容收放。
 *
 * 定死 7ch 时数字总会和「万」分家：右对齐的话数字贴着 input 右缘、靠近单位，
 * 但整组在槽里偏右（截图里就是这个样子）；改成居中，数字又停在 7ch 的正中、
 * 离单位老远。
 *
 * 宽度随内容走之后，「数字 + 万」永远紧挨着，整组再由槽的 `justify-content: center`
 * 居中。最短 2ch——空值时得放得下 placeholder 那个 `0`。
 */
const inputStyle = computed(() => ({ width: `${Math.max(2, text.value.length)}ch` }));

function nudge(direction: 1 | -1) {
    const base = props.modelValue ?? 0;
    const next = Math.max(0, base + direction * stepSize(base));
    text.value = toWan(next);
    emit('update:modelValue', next > 0 ? next : null);
}
</script>

<template>
    <!-- 外层用 `div` 不用 `label`：里面有按钮，`label` 会把「点按钮」也当成「聚焦输入框」，
         而用户按加减时并不想焦点跳走。标签文字照留，输入框自己的 `aria-label` 负责念全。 -->
    <div class="price-field">
        <span v-if="label" class="pf-label">{{ label }}</span>
        <div class="pf-row">
            <PressButton
                v-if="stepper"
                class="pf-step"
                icon="subtract"
                :label="`减 ${stepWan} 万`"
                @click="nudge(-1)"
            />
            <span class="field pf-well" :class="[`pf-well--${size}`, { 'pf-bad': !!error }]">
                <input
                    class="pf-input"
                    :class="`pf-input--${size}`"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :value="text"
                    :style="inputStyle"
                    :placeholder="placeholder"
                    :aria-label="label ? `${label}，以万为单位` : '价格，以万为单位'"
                    @input="onInput"
                />
                <span class="pf-unit" aria-hidden="true">万</span>
            </span>
            <PressButton
                v-if="stepper"
                class="pf-step"
                icon="add"
                :label="`加 ${stepWan} 万`"
                @click="nudge(1)"
            />
        </div>
        <span v-if="error" class="note error pf-hint">{{ error }}</span>
    </div>
</template>

<style scoped>
.price-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
}

.pf-label {
    color: var(--ink-2);
    font-size: var(--fs-sm);
    letter-spacing: 0.08em;
}

.pf-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
}

/* 复用 `.field` 那道槽，只换尺码：高度解掉 26 的锁、内衬加大、圆角升一档。
 *
 * **宽度定死，不铺满整行**：整行铺满时一个数字孤零零悬在长槽中间，读起来像
 * 「这条槽还没填完」；收窄到 180 之后它才像一枚价签，两边的加减也才有地方站。
 * 焦点环画在槽上而不是 input 上——input 自己没有边框，环贴着数字会读成「光标框」。 */
.pf-well {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 3px;
    flex: 0 0 auto;
    width: calc(180px * var(--fs-scale));
    height: auto;
    padding: 8px 16px 10px;
    border-radius: var(--r-3);
}

.pf-well--md {
    width: calc(156px * var(--fs-scale));
    padding: 5px 16px 6px;
}

.pf-well:focus-within {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

/* 宽度由 `:style="inputStyle"` 给（随内容收放），这里不要再写死。 */
.pf-input {
    border: 0;
    background: none;
    color: var(--num);
    font-family: inherit;
    font-size: calc(var(--fs-base) * 1.8);
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    text-align: center;
    outline: none;
}

.pf-input--md {
    font-size: calc(var(--fs-base) * 1.3);
}

.pf-input::placeholder {
    color: var(--muted);
    opacity: 0.45;
}

.pf-unit {
    color: var(--muted);
    font-size: var(--fs-base);
    letter-spacing: 0.04em;
}

/* 26px 的印块对着 47px 的槽，靠 `align-items: center` 落在中线。 */
.pf-step {
    flex: none;
}

.pf-bad {
    border-color: var(--cinnabar);
}

.pf-hint {
    margin: 0;
}
</style>
