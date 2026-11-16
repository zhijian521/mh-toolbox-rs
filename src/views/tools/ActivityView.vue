<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMinuteNow } from '../../composables/use-minute-now';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import { notify } from '../../composables/use-notify';
import ActivityCard from './ActivityCard.vue';
import ActivityRemindDialog from './ActivityRemindDialog.vue';
import { ACTIVITIES, groupActivities, type Activity } from './activities';
import { nextReminder, type AlarmDraft } from './alarms';
import { useAlarms } from './alarm-store';

/**
 * 活动日历：把游戏里那些固定活动按「最近一次」排开，点一张卡就能加提醒。
 *
 * ---- 三件事，缺一不可 ----
 *
 * ① 分组：今天 / 明天 / 本周内 / 之后 / 每天。用户来这一页问的是「这几天有什么」，
 *    不是「一共有多少条活动」——所以按时间分，不按类别分。
 * ② 每张卡说清「什么时候、多久一次」，以及最近一次是哪天（右上那枚签）。
 * ③ 点卡加提醒，落进已有的闹钟里。**不另起一套提醒机制**：闹钟那边已经有计时、
 *    全站浮层、右下角小卡与 Windows 系统通知，这一页再造一份只会两套时间对不上。
 *
 * ---- 为什么活动数据是这个文件之外的常量 ----
 *
 * `activities.ts` 里那张表是游戏规则，不是用户数据；这里只负责摆和接线。
 * 分组、文案、与闹钟的换算都是那边的纯函数，所以能单测。
 */
const router = useRouter();
const { alarms, add, setEnabled } = useAlarms();

const minuteNow = useMinuteNow();
const now = computed(() => new Date(minuteNow.value));

const groups = computed(() => groupActivities(ACTIVITIES, now.value));

/** 只有具备有效下一次提醒的活动关联记录才算已设置，旧同名手动闹钟不推测归属。 */
const remindedIds = computed(
    () =>
        new Set(
            alarms.value
                .filter((one) => one.repeat === 'activity' && nextReminder(one, now.value))
                .map((one) => one.activityId),
        ),
);

const picked = ref<Activity | null>(null);

function onConfirm(draft: AlarmDraft) {
    const result = add(draft);
    if (!result.ok) {
        /* 留在窗内说：关掉窗再报错，用户得重新点一次卡。 */
        notify.error(result.error);
        return;
    }
    notify.success(`已加提醒：${picked.value?.name ?? '活动'}`);
    picked.value = null;
}

function onToggle(id: number, enabled: boolean) {
    const result = setEnabled(id, enabled);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    notify.success(enabled ? '已开启提醒' : '已停用提醒');
    picked.value = null;
}
</script>

<template>
    <PageShell title="活动日历" desc="日常活动 · 日程提醒">
        <template #actions>
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
        </template>

        <!-- 直接摆在台面上，与物价页同一个摆法。
             中间试过「便签墙」——一块更深、带点阵的板，卡片微斜着贴在上面；
             用户否了：那层点阵与斜纸不属于这套设计。现在卡片自己就是一块压印的纸
             （`PressTile`），底下不需要再垫一块东西。 -->
        <section v-for="group in groups" :key="group.key" class="group">
            <h2 class="group-title">
                <span>{{ group.title }}</span>
                <i>{{ group.items.length }}</i>
            </h2>

            <div class="cards">
                <ActivityCard
                    v-for="one in group.items"
                    :key="one.activity.id"
                    :activity="one.activity"
                    :next="one.next"
                    :now="now"
                    :reminded="remindedIds.has(one.activity.id)"
                    @open="picked = one.activity"
                />
            </div>
        </section>

        <ActivityRemindDialog
            v-if="picked"
            :activity="picked"
            :now="now"
            :alarms="alarms"
            @close="picked = null"
            @confirm="onConfirm"
            @toggle-reminder="onToggle"
        />
    </PageShell>
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

.group-title::before {
    content: '';
    width: 2px;
    height: 12px;
    border-radius: 1px;
    background: var(--rule-2);
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
</style>
