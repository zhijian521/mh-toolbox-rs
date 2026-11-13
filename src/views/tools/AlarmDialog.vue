<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import TimeField from '../../components/TimeField.vue';
import TogglePills from '../../components/TogglePills.vue';
import { useToday } from '../../composables/use-today';
import { minuteText } from '../../services/clock';
import {
    LABEL_LIMIT,
    WEEKDAY_OPTIONS,
    alarmDraftError,
    alarmTime,
    isDayText,
    type AlarmDraft,
    type AlarmLike,
    type AlarmRepeat,
} from './alarms';

/**
 * 新建 / 编辑一个闹钟。
 *
 * ---- 排布：一列，从上到下就是「什么时候 → 提醒什么」 ----
 *
 * 重复在最上面（一条滑块），中间是时刻与它自己的条件（星期几 / 哪一天），备注在最下面。
 * 全部居中、单列——这张表单只有一件事在填，分成两栏会让「时刻」和「备注」看起来
 * 同等重要，而它们不是。
 *
 * ---- 四种重复只改第二格，不改数据形状 ----
 *
 * `每天` 与 `仅一次` 用完整时刻，`每周` 再加一行星期几，`每小时` 只填分钟。
 * 落盘一律是同一个 `time` 字段（`每小时` 的小时部分固定 `00` 占位）——界面分叉、
 * 数据不分叉，判定与提醒那边就不必按模式写四套。
 *
 * 时刻那一格是 `TimeField`（另一份文件）：居中的大号数字，失焦归一。这里只管
 * 「按模式告诉它收几位」以及切换模式时把值搬成对方要的形态。
 */
const props = defineProps<{
    alarm: AlarmLike | null;
    /** 父级写盘失败的原因。留在窗内显示：关掉窗再报错，用户得重填一遍。 */
    error?: string;
}>();

const emit = defineEmits<{
    save: [draft: AlarmDraft];
    close: [];
}>();

const today = useToday();

/* 父级用 `:key` 保证换编辑对象时这个组件重建，所以草稿只初始化读一次。 */
const draft = reactive<AlarmDraft>(
    props.alarm
        ? {
              time:
                  props.alarm.repeat === 'hourly' ? minuteText(props.alarm.time) : props.alarm.time,
              label: props.alarm.label,
              repeat: props.alarm.repeat,
              weekdays: [...props.alarm.weekdays],
              date: props.alarm.date || today.value,
          }
        : {
              time: '07:30',
              label: '',
              repeat: 'daily',
              /* 新建切到「每周」时默认给工作日：多数人设的就是这五天，
               * 一个都不选只会立刻撞上一条红字。 */
              weekdays: [1, 2, 3, 4, 5],
              date: today.value,
          },
);

const REPEAT_OPTIONS: { value: AlarmRepeat; label: string }[] = [
    { value: 'daily', label: '每天' },
    { value: 'hourly', label: '每小时' },
    { value: 'weekly', label: '每周' },
    { value: 'once', label: '仅一次' },
];

/* 星期几的多选。`TogglePills` 只吃字符串值，这里与 `draft.weekdays` 的数字编号来回换。 */
const WEEKDAY_PILLS = WEEKDAY_OPTIONS.map((one) => ({
    value: String(one.value),
    label: one.label,
}));

const weekdaysPicked = computed<string[]>({
    get: () => draft.weekdays.map(String),
    set: (list) => {
        draft.weekdays = list.map(Number);
    },
});

/**
 * 换模式时把时间搬成对方要的形态。
 *
 * `daily → hourly` 取分钟（`07:30` → `30`），`hourly → daily` 补回 `00:30` 的完整写法。
 * 不搬的话，`07:30` 会以裸数字进到「分钟」格、或者 `30` 以小时进到「时刻」格，
 * 用户看到的是一个自己没打过的数。
 */
function pickRepeat(value: AlarmRepeat) {
    const stored = alarmTime(draft.repeat, draft.time);
    draft.repeat = value;
    if (!stored) return;
    draft.time = value === 'hourly' ? minuteText(stored) : stored;
}

/* 「未填」不是「填错」：一打开就挂红字是在用户还没动手时先告状。 */
const submitted = ref(false);
const touched = reactive({ time: false, date: false });
const showTimeError = computed(
    () => (submitted.value || touched.time) && !alarmTime(draft.repeat, draft.time),
);
const showWeekdayError = computed(
    () => submitted.value && draft.repeat === 'weekly' && draft.weekdays.length === 0,
);
const showDateError = computed(
    () => (submitted.value || touched.date) && draft.repeat === 'once' && !isDayText(draft.date),
);

function submit() {
    submitted.value = true;
    if (alarmDraftError(draft)) return;
    emit('save', { ...draft, time: alarmTime(draft.repeat, draft.time) as string });
}

/* 表单里没有 `type="submit"` 的按钮时，隐式提交什么都不做，所以回车要自己接。
 * 只认输入框上的回车：焦点在「保存」上时不能再走一遍。 */
function onEnter(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell
        :title="alarm ? '编辑闹钟' : '新增闹钟'"
        :width="440"
        :scroll="false"
        @close="emit('close')"
    >
        <form
            id="alarm-form"
            class="alarm-form modal-form"
            @submit.prevent="submit"
            @keydown.enter="onEnter"
        >
            <SteppedSlider
                class="alarm-repeat"
                :model-value="draft.repeat"
                :options="REPEAT_OPTIONS"
                label="重复方式"
                @update:model-value="pickRepeat"
            />

            <!-- 时刻与它的条件（星期几 / 哪一天）是一组「什么时候」：组内 10、组外 16，
                 否则日期会被 14 的间距推得像另一件事。 -->
            <div class="alarm-when">
                <TimeField
                    v-model="draft.time"
                    :label="draft.repeat === 'hourly' ? '每小时的几分' : '时刻'"
                    :mode="draft.repeat === 'hourly' ? 'minute' : 'clock'"
                    @commit="touched.time = true"
                />
                <span v-if="showTimeError" class="note error alarm-note">
                    {{ draft.repeat === 'hourly' ? '写 0–59' : '写成 07:30 这样' }}
                </span>

                <div v-if="draft.repeat === 'weekly'" class="alarm-row">
                    <TogglePills
                        v-model="weekdaysPicked"
                        :options="WEEKDAY_PILLS"
                        label="每周的哪几天"
                        radius="sm"
                    />
                    <span v-if="showWeekdayError" class="note error">选几天</span>
                </div>

                <label v-if="draft.repeat === 'once'" class="alarm-day">
                    <span class="field-label">哪一天</span>
                    <DateField v-model="draft.date" :min="today" label="闹钟响的日期" />
                    <span v-if="showDateError" class="note error">选一个日子</span>
                </label>
            </div>

            <label class="alarm-label">
                <span class="field-label">备注（可空）</span>
                <input
                    v-model="draft.label"
                    class="field alarm-input"
                    :maxlength="LABEL_LIMIT"
                    aria-label="备注"
                    placeholder="签到 / 摆摊收摊"
                />
            </label>

            <p class="note alarm-hint">
                提醒在时刻前一分钟发出；不在这一页也会弹出来。关掉窗口就不再提醒。
            </p>

            <p v-if="error" class="note error alarm-note">{{ error }}</p>
        </form>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次编辑"
                @click="emit('close')"
            />
            <PressButton icon="check" text="保存" label="保存这个闹钟" seal @click="submit" />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 一列、居中、间距 14。没有栅格：这张表单从上到下只讲一件事，
 * 分成两栏会让「时刻」和「备注」看起来同等重要。 */
.alarm-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

/* 「什么时候」这一组：时刻、出错的红字、星期几或日期。组内 10、组外 16。 */
.alarm-when {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
}

/* 重复是这页最先要定的事，所以它在最上面，且撑满——四档一字排开，
 * 点哪档都是同一种手势。`--step-pad-y` 是它的尺寸入口（见 `SteppedSlider` 的注释）：
 * 8 → 格高 33、整条 39，与下面 52 高的时刻格配得上。 */
.alarm-repeat {
    width: 100%;
    --step-pad-y: 8px;
}

.alarm-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

/* 日期与时刻同宽（208 = `TimeField` 的宽度），两行读成一组「什么时候」。
 * 触发条内部的排布是它自己的事，这里只借居中：文字居中、箭头绝对定位到右缘，
 * 否则文字会为了给箭头让位而整体偏左 9px。 */
.alarm-day {
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: calc(208px * var(--fs-scale));
}
.alarm-day :deep(.date-field) {
    width: 100%;
}
.alarm-day :deep(.date-trigger) {
    position: relative;
    justify-content: center;
    height: calc(34px * var(--fs-scale));
}
.alarm-day :deep(.date-text) {
    flex: none;
    text-align: center;
    font-size: var(--fs-md);
}
.alarm-day :deep(.date-arrow) {
    position: absolute;
    right: calc(8px * var(--fs-scale));
}

.alarm-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
}

/* 备注在最下面：比时刻宽一档（280 对 208），但不铺满——铺满时那条凹槽横贯整张窗，
 * 读起来像「这里还有一个更大的字段」。它是顺带写一句的位置，收窄之后中心仍在同一条线上。 */
.alarm-input {
    width: calc(280px * var(--fs-scale));
    max-width: 100%;
    height: calc(32px * var(--fs-scale));
    text-align: center;
}

.alarm-hint {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.5;
    text-align: center;
}

.alarm-note {
    margin: 0;
    text-align: center;
}
</style>
