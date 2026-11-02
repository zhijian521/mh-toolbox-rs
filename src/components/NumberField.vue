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
 */
withDefaults(
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
    }>(),
    { placeholder: '', zeroAsEmpty: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

function commit(event: Event) {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = Number(raw);
    emit('update:modelValue', Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
}
</script>

<template>
    <input
        class="field num number-field"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :aria-label="label"
        :placeholder="placeholder"
        :value="zeroAsEmpty && !modelValue ? '' : modelValue"
        @change="commit"
    />
</template>

<style scoped>
/* 宽度由调用方给（等级 72、资质 84 各不同），这里只兜一个下限：
 * 三个数字以下会被浏览器算成 0 宽，整列会塌成一条线。 */
.number-field {
    width: 72px;
}
</style>
