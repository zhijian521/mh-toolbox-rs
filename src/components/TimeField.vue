<script setup lang="ts">
import { ref, watch } from 'vue';
import { minuteText, normalizeTime } from '../services/clock';

/**
 * 时刻选择：一格居中的大号数字。
 *
 * ---- 为什么是「一整格」而不是「时」「分」两格 ----
 *
 * 试过两个并排的数字格：`00:30` 里的 `0` 在那种格子里是「没填」还是「就是零」判不出来，
 * 而手敲 `07` 之后焦点还要跳到下一格、中间夹一个冒号，键盘走一趟按三次。一整格
 * `07:30` 一次敲完更顺，`normalizeTime` 又认 `7:5` / `0705` / `7` 这些省事的写法。
 *
 * ---- 归一放在失焦，不放逐键 ----
 *
 * 打到一半的 `07:` 不是一个时刻，逐键纠正会把用户正在输入的字符改掉。失焦时把格子里的
 * 字换成规范值——敲 `7` 松开，格子里显示 `07:00`，他立刻知道系统理解成了什么；
 * 认不出来就原样留着，红字由外面的表单挂（这里不判错、不换色）。
 *
 * ---- 字号 ----
 *
 * `--fs-xl`（22px）与页面标题、卡片上的价格同一档。时刻是这张表单的主角，
 * 一眼要能确认「不是 08:30」，所以它比旁边的备注格大两档，且**居中**——
 * 居中的数字读起来是一串，左对齐的数字读起来是一个输入框。
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        /** 格子上方那行小字，同时是 `label`，点它也聚焦。 */
        label: string;
        /** `clock` 收完整时刻；`minute` 只收「每小时的几分」（0–59）。 */
        mode?: 'clock' | 'minute';
    }>(),
    { mode: 'clock' },
);

const emit = defineEmits<{
    'update:modelValue': [value: string];
    /** 失焦且已把格子里的字换成规范值之后发。外面的表单用它决定要不要显示红字。
     * 不叫 `blur`：那是原生的焦点事件名，声明成 emit 之后 Vue 会把根元素冒上来的
     * `FocusEvent` 也一起接上，类型就变成「无参 与 FocusEvent 两个签名的交集」。 */
    commit: [];
}>();

const text = ref(props.modelValue);

/**
 * 把格子里的字收成规范形态；认不出原样返回。
 *
 * `minute` 模式先认裸数字：`5` 补成 `05`，`60` 原样留着让校验去报。
 */
function tidy(raw: string): string {
    const value = raw.trim();
    if (props.mode === 'minute' && /^\d{1,2}$/.test(value)) {
        return Number(value) <= 59 ? value.padStart(2, '0') : raw;
    }
    const time = normalizeTime(value);
    if (!time) return raw;
    return props.mode === 'minute' ? minuteText(time) : time;
}

/* 外面改了值（切重复方式时把 `07:30` 搬成 `30`、或者换了一个闹钟来编辑）时跟着变。
 *
 * 比较的是**格子里的原字**，不是归一后的字：`07:30` 从「每天」切到「每小时」时，
 * 父级给的是 `30`，而归一后的 `07:30` 也正好是 `30`——按归一值比就判成「没变」，
 * 格子里会留着一个 `07:30` 冒充分钟。 */
watch(
    () => props.modelValue,
    (value) => {
        if (value !== text.value) text.value = value;
    },
);

/**
 * 逐键同步给父级。
 *
 * **不能只在失焦时同步**：用户填完直接按 Enter、或者点「保存」，那一格可能还没失焦
 * （`HTMLElement.click()` 甚至根本不会让它失焦），父级手上还是上一次的值，存下去的是
 * 他没填的那个时间。2026-11-08 的烟测就是这么红的：程序化填了 `06:15`，卡上出现的是
 * `07:30`。
 *
 * 这里发的是**原字**（可能是 `7:3`），归一留给失焦那一次——逐键补零会把光标顶到末尾。
 */
function onInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    text.value = target.value;
    emit('update:modelValue', text.value);
}

function commit() {
    const next = tidy(text.value);
    if (next !== text.value) text.value = next;
    emit('update:modelValue', next);
    emit('commit');
}
</script>

<template>
    <label class="time-field">
        <span class="field-label">{{ label }}</span>
        <input
            :value="text"
            class="field time-input"
            :class="{ 'is-minute': mode === 'minute' }"
            inputmode="numeric"
            :maxlength="mode === 'minute' ? 2 : 5"
            :placeholder="mode === 'minute' ? '30' : '07:30'"
            @input="onInput"
            @blur="commit"
        />
    </label>
</template>

<style scoped>
.time-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
}

/* 外观（凹槽四件套）整份来自 `.field`，这里只改尺寸与字的排布。
 * 双类名是为了压过 `base.css` 里那条 `.field`（同为 0-1-0，靠样式顺序不保险）。 */
.field.time-input {
    width: calc(208px * var(--fs-scale));
    max-width: 100%;
    height: calc(56px * var(--fs-scale));
    /* 右侧多留 0.1em：`letter-spacing` 会在末字后面也加一格，不补的话整串看着偏左。 */
    padding: 0 calc(10px * var(--fs-scale)) 0 calc(10px * var(--fs-scale) + 0.1em);
    font-family: inherit;
    /* 比页面标题再大一档：这一格里只有四个数字，字号不够大就镇不住 208 的宽度。
     * 26 = `--fs-xl` 22 × 1.18，跟着 `--fs-scale` 一起缩。 */
    font-size: calc(var(--fs-xl) * 1.18);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1em;
    text-align: center;
    color: var(--ink);
}
/* 只填分钟时不需要为四位数字留宽度，收窄到三字宽，仍居中。 */
.field.time-input.is-minute {
    width: calc(136px * var(--fs-scale));
}
</style>
