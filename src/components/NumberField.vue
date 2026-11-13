<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * 数字输入格：`<input class="field">` 的一个特例，只管「什么时候把字变成数」。
 *
 * 业务表单启用 `updateOnInput`，逐键同步数值供保存条件使用；本地草稿保留空白、小数点
 * 与尾零，失焦或 Enter 才规范化显示。外部回写同一个数值不覆盖输入过程，避免光标跳动。
 * 不启用时仍在失焦或 Enter 写回。
 *
 * 空值与非数字一律按 0 记：等级、上限、资质、寿命这几个字段上，「没填」与「0」
 * 是同一个意思（没练、没加），不需要第四种状态。负数也归 0——这些量没有负数。
 * 真正的「不知道」只出现在 `cap` 上，那里用一张空行表示，不是填 0。
 *
 * ---- Enter 也要 commit ----
 * 光标还在格子里按 Enter 时，浏览器先跑 `keydown` 处理器、再执行「隐式提交表单」。
 * 若只监听 `change`，值要等**失焦**才写回，于是表单拿到的仍是旧值：价格格里按 Enter，
 * 提交逻辑看到的是 0，`canSave` 为假，界面一动不动——不是报错，是**毫无反应**。
 * 所以 Enter 先 commit 一次，把值写回父级，随后的隐式提交才读到新数。
 */
const props = withDefaults(
    defineProps<{
        modelValue: number;
        /** 读屏念的字段名。表单里每个格子都必须有，否则读屏只念「编辑框」。 */
        label: string;
        placeholder?: string;
        /**
         * 0 显示成空格。给「上限」这类字段用：那里的 0 是「没填」，
         * 而屏幕上摆一个 0 会被读成「上限就是 0」。
         */
        zeroAsEmpty?: boolean;
        /**
         * 允许的小数位。**默认 0 = 整数**——等级、上限、资质、寿命这些量没有小数，
         * 而这个组件最早就是为它们写的。
         *
         * 账号页的人民币要两位：把一个 12.5 元的记录悄悄存成 13，是替用户改账，
         * 而且它不会报错。账号页梦幻币按万输入同样传 2。
         */
        precision?: number;
        /** 表单需要实时判断能否保存时启用；输入中的文字保留到提交再规范化。 */
        updateOnInput?: boolean;
    }>(),
    { placeholder: '', zeroAsEmpty: false, precision: 0, updateOnInput: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const displayValue = (value: number) => (props.zeroAsEmpty && !value ? '' : String(value));
const draft = ref(displayValue(props.modelValue));

function numberValue(text: string): number {
    const parsed = Number(text.trim());
    if (!Number.isFinite(parsed)) return 0;
    /* 先按精度放大取整、再缩回来：`Math.round(parsed * 100) / 100` 对 12.5 稳定，
     * 而直接 `toFixed` 返回的是字符串，再 `Number()` 一次又多一步转换。 */
    const factor = 10 ** Math.max(0, props.precision);
    return Math.max(0, Math.round(parsed * factor) / factor);
}

watch(
    () => props.modelValue,
    (value) => {
        // 自己回传的数值不覆盖「1.」「1.20」等输入草稿；外部重置仍同步显示。
        if (value !== numberValue(draft.value)) draft.value = displayValue(value);
    },
);

function onInput(event: Event) {
    if (!props.updateOnInput) return;
    draft.value = (event.target as HTMLInputElement).value;
    if ((event as InputEvent).isComposing) return;
    emit('update:modelValue', numberValue(draft.value));
}

function commit(event: Event) {
    if ((event as KeyboardEvent).isComposing) return;
    const input = event.target as HTMLInputElement;
    const value = numberValue(input.value);
    draft.value = displayValue(value);
    input.value = draft.value;
    emit('update:modelValue', value);
}
</script>

<template>
    <input
        class="field num number-field"
        type="text"
        :inputmode="precision > 0 ? 'decimal' : 'numeric'"
        autocomplete="off"
        :aria-label="label"
        :placeholder="placeholder"
        :value="updateOnInput ? draft : displayValue(modelValue)"
        @input="onInput"
        @compositionend="onInput"
        @change="commit"
        @keydown.enter="commit"
    />
</template>

<style scoped>
/* 宽度由调用方给（等级 72、资质 84 各不同），这里只兜一个下限：
 * 三个数字以下会被浏览器算成 0 宽，整列会塌成一条线。 */
.number-field {
    width: 72px;
}
</style>
