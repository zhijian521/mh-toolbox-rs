<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { useMinuteNow } from '../../composables/use-minute-now';
import ToolPageShell from './ToolPageShell.vue';
import GroupHead from '../../components/GroupHead.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import { gameDataReady, loadGameData } from '../../services/game-data';
import { notify } from '../../composables/use-notify';
import ActivityCard from './ActivityCard.vue';
import ActivityRemindDialog from './ActivityRemindDialog.vue';
import { ACTIVITIES, groupActivities, type Activity } from './activities';
import { alarmStatusText, nextReminder, type AlarmDraft } from './alarms';
import { useAlarms } from './alarm-store';

/** 日历显示游戏场次，提醒的保存、启停和调度共用闹钟。 */
const { alarms, loadError, retryLoad, add, setEnabled } = useAlarms();
const glass = inject(glassLedger, null);

const minuteNow = useMinuteNow();
const now = computed(() => new Date(minuteNow.value));

const groups = computed(() => (gameDataReady.value ? groupActivities(ACTIVITIES, now.value) : []));
const rulesError = computed(() => (gameDataReady.value ? '' : '活动规则未读取，请重试'));
async function retryRules() {
    await loadGameData();
}

/** 只有具备有效下一次提醒的活动关联记录才算已设置，旧同名手动闹钟不推测归属。 */
const remindedIds = computed(() => {
    if (!gameDataReady.value) return new Set<string | undefined>();
    return new Set(
        alarms.value
            .filter((one) => one.repeat === 'activity' && nextReminder(one, now.value))
            .map((one) => one.activityId),
    );
});

const picked = ref<Activity | null>(null);
const reminderOpen = ref(false);
const reminderKey = ref(0);
const reminderError = ref('');
let reminderTrigger: HTMLElement | null = null;

function openReminder(activity: Activity) {
    const trigger = document.activeElement;
    reminderTrigger = trigger instanceof HTMLElement ? trigger : null;
    reminderError.value = '';
    picked.value = activity;
    reminderKey.value++;
    reminderOpen.value = true;
}

function closeReminder() {
    reminderOpen.value = false;
    if (glass) {
        void nextTick(() => reminderTrigger?.focus({ preventScroll: true }));
    }
}

function onConfirm(draft: AlarmDraft) {
    const result = add(draft);
    if (!result.ok) {
        reminderError.value = result.error;
        return;
    }
    notify.success(`已加提醒：${picked.value?.name ?? '活动'}`);
    closeReminder();
}

function onToggle(id: number, enabled: boolean) {
    const result = setEnabled(id, enabled);
    if (!result.ok) {
        reminderError.value = result.error;
        return;
    }
    notify.success('提醒' + alarmStatusText(enabled));
    closeReminder();
}
</script>

<template>
    <ToolPageShell
        title="活动日历"
        desc="活动场次 · 开场提醒"
        class="activity-page"
        :class="{ 'is-glass': glass }"
    >
        <LoadNotice :error="loadError" :load="retryLoad" />
        <LoadNotice :error="rulesError" :load="retryRules" />
        <section v-for="group in groups" :key="group.key" class="group">
            <GroupHead as="h2" class="group-title">
                <span>{{ group.title }}</span>
                <i>{{ group.items.length }}</i>
            </GroupHead>

            <div class="cards">
                <ActivityCard
                    v-for="one in group.items"
                    :key="one.activity.id"
                    :activity="one.activity"
                    :next="one.next"
                    :now="now"
                    :reminded="remindedIds.has(one.activity.id)"
                    :disabled="!!loadError"
                    @open="openReminder(one.activity)"
                />
            </div>
        </section>

        <ActivityRemindDialog
            v-if="picked && (glass || reminderOpen)"
            :key="reminderKey"
            :open="reminderOpen"
            :activity="picked"
            :now="now"
            :alarms="alarms"
            :error="reminderError"
            @close="closeReminder"
            @confirm="onConfirm"
            @toggle-reminder="onToggle"
        />
    </ToolPageShell>
</template>

<style scoped>
/* ---------- 一组 ---------- */
.group + .group {
    margin-top: 20px;
}

.group-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 9px;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 400;
    letter-spacing: 0.05em;
}

/* 条数是「这里有几条」的读数，用等宽数字；不写成「共 8 项」，组标题已经说了是什么。 */
.group-title i {
    color: var(--muted);
    font-size: var(--fs-mini);
    font-style: normal;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

/* 卡片按 224–252 铺，与物价卡同一个写法（那边是 200–225）：
 * 给上限而不是 `1fr`，一张卡就是一张卡，不该为了填满整行被拉宽——
 * 拉宽之后说明那一行会剩一大片空，反而更松散。
 *
 * 间距 12 也是物价那边的数：卡片是压印块，落地影 3px 硬 + 8px 软摊在卡外，
 * 8 或 10 会让上下两张的影连成一片。 */
.cards {
    display: grid;
    grid-template-columns: repeat(
        auto-fill,
        minmax(calc(224px * var(--fs-scale)), calc(252px * var(--fs-scale)))
    );
    justify-content: start;
    align-items: stretch;
    gap: 12px;
}
.is-glass .group + .group {
    margin-top: 18px;
}
.is-glass .group-title {
    gap: 8px;
    margin-bottom: 8px;
    color: var(--liquid-ink);
    font-size: var(--fs-md);
    letter-spacing: normal;
}
.is-glass .group-title i {
    opacity: 1;
    font-size: var(--fs-xs);
}
.is-glass .cards {
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, calc(220px * var(--fs-scale))), calc(248px * var(--fs-scale)))
    );
    gap: 10px;
}
</style>
