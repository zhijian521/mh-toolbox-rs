<script setup lang="ts">
import { computed, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import {
    remindDraft,
    remindNote,
    repeatText,
    timesText,
    type Activity,
    type ActivitySlot,
} from './activities';
import type { AlarmDraft } from './alarms';

/**
 * 「给这条活动加个提醒」：确认是哪一场，然后把它翻成一份闹钟。
 *
 * 为什么要有这个窗而不是点一下直接加：一条活动可能有好几段（衣冠古丘一天五场），
 * 直接加要么一次加五个闹钟，要么替用户挑一个——两种都不该由代码决定。所以先让人
 * 选一段，顺便把「这个提醒会怎么响」说清楚。
 *
 * 换算的口径全在 `activities.ts` 的 `remindDraft()`，这里不重复判断——它那句注释里
 * 写着「每月第几周只能退成仅一次」，那是全局唯一的解释。
 */
const props = defineProps<{
    activity: Activity;
    now: Date;
}>();

const emit = defineEmits<{
    close: [];
    confirm: [draft: AlarmDraft];
}>();

/* 多段的活动先挑一段；只有一段时没什么可挑的，直接用它。 */
const slotOptions = computed(() =>
    props.activity.slots.map((slot) => ({
        value: slot.start,
        label: `${slot.start}–${slot.end}`,
    })),
);

const pickedStart = ref(props.activity.slots[0]?.start ?? '');

const pickedSlot = computed<ActivitySlot>(() => {
    const found = props.activity.slots.find((slot) => slot.start === pickedStart.value);
    /* 整点类没有时段（它每小时都有一场），这里给一个占位：`remindDraft()` 对整点类
     * 根本不读这个参数，占位只是为了类型上过得去。 */
    return found ?? { start: '00:00', end: '00:00' };
});

const note = computed(() => remindNote(props.activity));

/* 规则那行只说「多久一次」：时段已经在下面说了，两处都写一遍会让窗里出现
 * 「每月第 2 周周日 · 12:00–17:00」紧跟「12:00–17:00 开场」这种复读。
 * 多段的活动把「一天几场」补在这里——胶囊上只有时刻，看不出一天有几场。 */
const ruleLine = computed(() => {
    const base = repeatText(props.activity);
    const count = props.activity.slots.length;
    return count > 1 ? `${base} · 一天 ${count} 场` : base;
});

/** 提醒落在哪一刻。多段时由胶囊回答，这里不写。 */
const whenLine = computed(() => {
    const slots = props.activity.slots;
    if (!slots.length) return `${timesText(props.activity)}开场`;
    if (slots.length === 1) return `${slots[0].start}–${slots[0].end} 开场`;
    return '';
});

function submit() {
    emit('confirm', remindDraft(props.activity, pickedSlot.value, props.now));
}
</script>

<template>
    <ModalShell title="新增提醒" :width="404" :scroll="false" @close="emit('close')">
        <div class="remind modal-form">
            <div class="head">
                <h3 class="name">{{ activity.name }}</h3>
                <p class="rule">{{ ruleLine }}</p>
            </div>

            <div v-if="slotOptions.length > 1" class="pick">
                <SegmentedPills
                    v-model="pickedStart"
                    :options="slotOptions"
                    label="提醒哪一场"
                    radius="sm"
                />
            </div>

            <p v-if="whenLine" class="when">{{ whenLine }}</p>

            <p class="hint">开场前一分钟提醒。</p>
            <p v-if="note" class="hint warn">{{ note }}</p>
        </div>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不加了" @click="emit('close')" />
            <PressButton icon="check" text="保存" label="加进闹钟" seal @click="submit" />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 一列、居中、间距 12。这张窗只讲一件事：给哪一场加提醒。 */
.remind {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}

.name {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-xl);
    font-weight: 400;
    letter-spacing: 0.04em;
    line-height: 1.2;
}

.rule {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
}

.pick {
    width: 100%;
}

/* 只有一场时不必给一排胶囊：一句话比一枚按不动的按钮清楚。 */
.when {
    margin: 0;
    color: var(--ochre);
    font-size: var(--fs-base);
    font-variant-numeric: tabular-nums;
}

.hint {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.7;
    text-align: center;
}

/* 有损换算那一条要说得出声：它决定「下个月还要不要回来点一次」。 */
.hint.warn {
    color: var(--warning);
}
</style>
