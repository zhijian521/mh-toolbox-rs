<script setup lang="ts">
/**
 * 数字输入格：`<input class="field">` 的一个特例，只管「什么时候把字变成数」。
 *
 * 用 `:value` + `@change` 而不是 `v-model.number`，是两个具体问题：
 * 1. `v-model.number` 每敲一个字符就把值写回父级，父级再渲染回输入框——
 *    输入「12」时中间那个「1」会被规范化一次，光标跳到末尾；中文输入法在数字框里
 *    虽然少见，但退格删到空时值立刻变 0，用户没法清空重输。
 * 2. 失焦（`change`）才写回，输入过程中的字符归浏览器管，写完一次就落定。
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
         * 而且它不会报错。梦幻币传 0（币没有小数），一个字段两种精度。
         */
        precision?: number;
    }>(),
    { placeholder: '', zeroAsEmpty: false, precision: 0 },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

function commit(event: Event) {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        emit('update:modelValue', 0);
        return;
    }
    /* 先按精度放大取整、再缩回来：`Math.round(parsed * 100) / 100` 对 12.5 稳定，
     * 而直接 `toFixed` 返回的是字符串，再 `Number()` 一次又多一步转换。 */
    const factor = 10 ** Math.max(0, props.precision);
    emit('update:modelValue', Math.max(0, Math.round(parsed * factor) / factor));
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
        :value="zeroAsEmpty && !modelValue ? '' : modelValue"
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
