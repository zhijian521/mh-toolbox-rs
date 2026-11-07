<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PressButton from './PressButton.vue';

/**
 * 带加减的数字格：槽 + 两侧印块，中间一枚大号的数。
 *
 * ---- 与 `PriceField` 的关系：同一套槽，不是同一件东西 ----
 * 视觉照 `PriceField`（记价窗那一枚）：数字居中、字号比正文大一档、两边各一枚
 * 加减的印块，槽本身仍借 `.field` 那四件套，不另画一套「看起来差不多」的凹槽。
 *
 * 但它**不是**价格格的参数化版本，两者约束相反：
 *   · `PriceField` 绑死「万」——输入框里是万、进出的都是原值（×10000），
 *     而且它是记价窗的读数主角（52 高）。这里多数格子**没有单位**
 *     （等级、段数、资质、寿命），值也不换算；
 *   · `PriceField` 的进出类型是 `number | null`，这里一律**字符串**：
 *     空串 = 没填（属性值、装备段数都允许空），而且经验那两格的值是
 *     `3968.6万` 这种带单位的文本，转 number 会把单位丢掉。
 * 硬把两个需求塞进一个组件，就得给它加三个互斥开关，最后谁看都像特例。
 *
 * ---- 单位是可选的，默认没有 ----
 * 只有真需要的时候才传 `unit`（眼下只有经验那两格传「万」）。金额那种换算不在这里做：
 * 这一格只负责「数字 + 后缀」，`3968.6` 与 `3968.6万` 对它是两个字符串。
 *
 * ---- 输入过程中的值归自己管 ----
 * `text` 是本组件的真值，`@input` 只把清理过的数字交出去；外面的 `modelValue`
 * 回来时**只在「数字部分真的变了」才覆盖**。与 `PriceField` 同一条理由：
 * 用户正打 `3.` 时上游写回 `3`，按字符串比就会把刚敲的小数点吃掉。
 */
const props = withDefaults(
    defineProps<{
        /** 完整值（含单位），如 `120`、`3968.6万`。空串 = 没填。 */
        modelValue: string;
        /** 读屏念的字段名。 */
        label: string;
        placeholder?: string;
        /** 小数位。0 = 整数（输入时就把小数点清掉）。 */
        precision?: number;
        /**
         * 加减一次的量。
         *
         * `'auto'` 按当前值的量级走（1 / 10 / 100 / 1000）：气血 3916 一次 ±100 才顺手，
         * 而段数 5 一次 ±100 就没法用了。等级这类「一次一级」的字段显式写 1。
         */
        step?: number | 'auto';
        /** 后缀单位。**默认不传**——多数格子没有单位，见文件头。 */
        unit?: string;
    }>(),
    { placeholder: '', precision: 0, step: 1, unit: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/** 去掉后缀只留数字部分。`3968.6万` → `3968.6`。 */
function digits(raw: string): string {
    const text = (raw ?? '').trim();
    const unit = props.unit;
    if (unit && text.endsWith(unit)) return text.slice(0, -unit.length).trim();
    return text;
}

/** 数字部分 + 后缀。空值不加后缀（空串就是空串，不留一个孤零零的「万」）。 */
function compose(value: string): string {
    if (!value) return '';
    return props.unit ? `${value}${props.unit}` : value;
}

const text = ref(digits(props.modelValue));

watch(
    () => props.modelValue,
    (value) => {
        const shown = digits(value);
        /* 按「数字部分」比而不是按字符串：`3.` 与 `3` 是同一个值，
         * 按字符串覆盖会把正在输入的小数点吃掉。 */
        if (Number(shown) !== Number(text.value)) text.value = shown;
    },
);

/** 清理输入：只留数字（`precision > 0` 时再留一个小数点）。 */
function clean(raw: string): string {
    if (props.precision <= 0) return raw.replace(/[^\d]/g, '');
    return raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}

function onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const cleaned = clean(input.value);
    text.value = cleaned;
    /* 受控值被拒时（比如打了第二个小数点）DOM 里还留着旧串，手动写回去。 */
    input.value = cleaned;
    emit('update:modelValue', compose(cleaned));
}

/**
 * 失焦收尾：把中间态落成规范写法。
 *
 * 输入时允许 `3.`（否则小数点刚敲下去就被吃掉），离开这一格时去掉尾巴；
 * 小数位也在这里截，不在输入时截——边打边截会让「0.123」打到一半就跳。
 */
function onBlur() {
    let value = text.value;
    if (props.precision <= 0) {
        value = value.replace(/\.$/, '');
    } else {
        const dot = value.indexOf('.');
        if (dot >= 0) value = value.slice(0, dot + 1 + props.precision).replace(/\.$/, '');
    }
    text.value = value;
    emit('update:modelValue', compose(value));
}

/** 加减一次的步长。`'auto'` 按量级分档，固定 1 在大数上等于让人点几百次。 */
function autoStep(value: number): number {
    if (value >= 10000) return 1000;
    if (value >= 1000) return 100;
    if (value >= 100) return 10;
    return 1;
}

const stepNow = computed(() => {
    if (props.step !== 'auto') return props.step;
    return autoStep(Number(text.value) || 0);
});

/** 读屏念的步长，与按钮实际加减用同一个数。 */
const stepLabel = computed(() => String(stepNow.value));

function nudge(direction: 1 | -1) {
    const base = Number(text.value) || 0;
    const factor = 10 ** Math.max(0, props.precision);
    const next = Math.max(0, Math.round((base + direction * stepNow.value) * factor) / factor);
    text.value = String(next);
    emit('update:modelValue', compose(text.value));
}

/**
 * 输入框宽度跟着内容收放：定死宽度时，数字与「万」会分家（一个贴右、一个在槽中）。
 *
 * 多给几像素是量出来的坑（`PriceField` 那边记过）：`ch` 是字体里 "0" 的宽度，
 * 而霞鹜文楷的数字实际渲染更宽一点，正好等于「字数 × ch」时末位会被裁掉半边。
 */
const inputStyle = computed(() => ({
    width: `calc(${Math.max(2, text.value.length)}ch + 8px)`,
}));
</script>

<template>
    <!-- 外层用 `div` 不用 `label`：里面有按钮，`label` 会把「点加减」也当成
         「聚焦输入框」，而按加减时焦点不该跳走。标签文字由调用方给（表单那一行），
         输入框自己的 `aria-label` 负责让读屏念全。 -->
    <div class="counter-field">
        <PressButton
            class="cf-step"
            icon="subtract"
            :label="`减 ${stepLabel}`"
            :disabled="!text"
            @click="nudge(-1)"
        />
        <span class="field cf-well">
            <input
                class="cf-input"
                type="text"
                :inputmode="precision > 0 ? 'decimal' : 'numeric'"
                autocomplete="off"
                :value="text"
                :style="inputStyle"
                :placeholder="placeholder"
                :aria-label="label"
                @input="onInput"
                @blur="onBlur"
                @keydown.enter="onBlur"
            />
            <span v-if="unit" class="cf-unit" aria-hidden="true">{{ unit }}</span>
        </span>
        <PressButton class="cf-step" icon="add" :label="`加 ${stepLabel}`" @click="nudge(1)" />
    </div>
</template>

<style scoped>
/* 一行三件：减 / 槽 / 加。**整组定宽居中**，不是铺满整行——
 * 铺满时一个数字孤零零悬在长槽正中，读起来像「这条槽还没填完」；
 * 收窄成一枚读数签之后，两侧的印块才贴得住它。宽度上限取 100%：
 * 字号调到最大档时 `--fs-scale` 会把 272 顶出弹窗，那时以容器为准。
 *
 * 与 `PriceField` 的 180 + 38 同一套比例，只是整体小一档（槽 42 / 印 34）：
 * 这一窗最多六行，各 52 高会撑到一屏之外，而它不像记价那样只有一个主角。 */
.counter-field {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: min(calc(272px * var(--fs-scale)), 100%);
}

/* 槽还是 `.field` 那一道，只换尺码：解掉 26 的锁、内衬加大、圆角升一档。
 * 内容居中——表单里的输入格是左对齐的「一格字」，这一枚是「一个读数」。 */
.cf-well {
    display: flex;
    flex: 1;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    height: calc(42px * var(--fs-scale));
    padding: 6px 12px 8px;
    border-radius: var(--r-3);
}

/* 数字比正文大一号、加粗、等宽：加减时位数不跳，整组也不左右晃。
 * 不写 `width`——宽度由 `:style` 按内容给。 */
.cf-input {
    border: 0;
    background: none;
    color: var(--num);
    font-family: inherit;
    font-size: calc(var(--fs-base) * 1.7);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    outline: none;
}
.cf-input::placeholder {
    color: var(--muted);
    font-weight: 400;
    opacity: 0.45;
}

.cf-unit {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-base);
    letter-spacing: 0.04em;
}

/* 焦点环画在槽上：input 自己没有边框，环贴着数字会读成「光标框」。
 * 与 `PriceField` 同一条。 */
.cf-well:focus-within {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

/* 印块放大到与槽成比例。选择器写成 `.counter-field .cf-step` 而不是 `.cf-step`：
 * `PressButton` 内部那条 `--tile-h` 挂在 `.press-btn` 上（scoped 后 (0,2,0)），
 * 与 `.cf-step[data-v]` 打平、只靠加载顺序分胜负；多一层父选择器才稳赢。
 * （`PriceField` 的 `.pf-step` 那边记过同一条。） */
.counter-field .cf-step {
    flex: none;
    --tile-h: calc(34px * var(--fs-scale));
    --icon-size: calc(17px * var(--fs-scale));
}
</style>
