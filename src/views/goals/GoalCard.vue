<script setup lang="ts">
import { computed } from 'vue';
import PaperCard from '../../components/PaperCard.vue';
import AppIcon from '../../components/AppIcon.vue';
import MeterBar from '../../components/MeterBar.vue';
import PressButton from '../../components/PressButton.vue';
import {
    deadlineText,
    kindMeta,
    scopeText,
    signedText,
    sourceText,
    type Goal,
    type GoalSummary,
} from './goals';

/**
 * 一张目标卡。三种类型共用一个外壳，区别只在中间那段：
 * 养成目标列成员（谁到了、谁还差多少），手动目标列最近三笔流水。
 *
 * 卡片只摆，不算数——`summary` 由页面用 `goalSummary` 算好传进来。两处各算一遍，
 * 迟早出现「卡片 71%、成员行 5/7 但还有 2 个待补录」这种自相矛盾。
 */
const props = defineProps<{ goal: Goal; summary: GoalSummary; today: string }>();

const emit = defineEmits<{
    edit: [];
    remove: [];
    /** 手动目标：记一笔。
     *  不叫 `progress`：那是 DOM 的原生事件名（`<progress>` 的加载进度），
     *  Vue 会把监听同时挂到根元素上，类型检查里就变成 `ProgressEvent` 与自定义载荷的联合。 */
    record: [];
    /** 手动目标：看全部流水。 */
    logs: [];
    /** 养成目标：批量更新各角色的当前值。 */
    growth: [];
    /** 装备目标：一键 +1（「买了就完成」）。 */
    bought: [];
}>();

const kind = computed(() => kindMeta(props.goal.kind));
const deadline = computed(() => deadlineText(props.goal.deadline, props.today, props.summary.done));

/** 未达标的成员排在前面：目标是「还差什么」，不是「已经有什么」。 */
const rows = computed(() =>
    [...props.summary.rows].sort((a, b) => Number(a.done) - Number(b.done)),
);

/** 最近三笔，新的在上。全部流水在弹窗里。 */
const recent = computed(() =>
    [...props.goal.logs]
        .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
        .slice(0, 3),
);

const readout = computed(() => {
    const { summary, goal } = props;
    if (goal.tracking) return `${summary.achieved} / ${summary.totalMembers} 个角色达标`;
    return `${summary.current} / ${summary.total} ${goal.unit}`;
});
</script>

<template>
    <PaperCard as="article" class="goal" :class="{ done: summary.done }" :data-goal-id="goal.id">
        <header class="goal-head">
            <h2 :title="goal.title">{{ goal.title }}</h2>
            <div class="goal-tools">
                <button class="tool" aria-label="编辑目标" title="编辑目标" @click="emit('edit')">
                    <AppIcon name="edit" />
                </button>
                <button class="tool" aria-label="删除目标" title="删除目标" @click="emit('remove')">
                    <AppIcon name="trash" />
                </button>
            </div>
        </header>

        <p class="goal-meta">
            <span class="kind" :class="'kind-' + goal.kind">
                <AppIcon :name="kind.icon" />
                {{ kind.label }}
            </span>
            <span class="muted">{{ scopeText(goal) }}</span>
            <span class="muted">{{ sourceText(goal) }}</span>
            <span v-if="summary.done && summary.doneDate" class="muted">
                {{ summary.doneDate }} 达成
            </span>
            <span
                v-else-if="deadline"
                class="deadline"
                :class="{ over: deadline.startsWith('已逾期') }"
            >
                {{ deadline }}
            </span>
        </p>

        <div class="readout">
            <span class="left">
                <b>{{ readout }}</b>
                <template v-if="goal.tracking && summary.unknown">
                    · {{ summary.unknown }} 个待补录
                </template>
                <template v-else-if="!goal.tracking && !summary.done">
                    · 还差 {{ Math.max(0, summary.total - summary.current) }} {{ goal.unit }}
                </template>
            </span>
            <span class="pct">{{ summary.pct }}%</span>
        </div>

        <!-- 达成之后不再画条：100% 的条没有信息，只会让「已经结束的东西」占着视觉重量。 -->
        <MeterBar v-if="!summary.done" :percent="summary.pct" label="目标进度" class="goal-meter" />
        <div v-else class="goal-meter done-line" aria-hidden="true" />

        <ul v-if="goal.tracking" class="members">
            <li v-for="row in rows" :key="row.id" class="member">
                <span class="who" :title="row.name">
                    {{ row.name || '未命名' }}
                    <span v-if="!row.exists" class="gone">已删除</span>
                </span>
                <span v-if="!row.exists" class="value">—</span>
                <span v-else-if="row.value === null" class="value">未记录</span>
                <span v-else class="value">
                    <b>{{ row.value }}</b> / {{ goal.target }} {{ goal.unit }}
                </span>
                <span
                    class="state"
                    :class="{
                        ok: row.done,
                        dead: !row.exists,
                        unknown: row.exists && row.value === null,
                    }"
                >
                    <template v-if="!row.exists">不计入</template>
                    <template v-else-if="row.done">已达标</template>
                    <template v-else-if="row.value === null">待补录</template>
                    <template v-else>还差 {{ row.remaining }}</template>
                </span>
            </li>
        </ul>

        <ul v-else-if="recent.length" class="members">
            <li v-for="log in recent" :key="log.id" class="member log">
                <span class="who" :title="log.note">{{ log.date }} {{ log.note || '记一笔' }}</span>
                <span class="value">{{ signedText(log.delta, goal.unit) }}</span>
                <span class="state" />
            </li>
        </ul>
        <p v-else class="goal-empty">
            {{ goal.note ? '' : '还没有记过一笔。点下面的按钮记第一笔。' }}
        </p>

        <p v-if="goal.note && (goal.tracking || !recent.length)" class="goal-note">
            {{ goal.note }}
        </p>

        <div class="goal-actions">
            <template v-if="goal.tracking">
                <PressButton
                    icon="check"
                    :text="summary.done ? '看看档案' : '更新养成'"
                    label="更新各角色的当前值"
                    seal
                    size="md"
                    @click="emit('growth')"
                />
            </template>
            <template v-else>
                <PressButton
                    v-if="!summary.done && goal.kind === 'gear'"
                    icon="check"
                    text="买了一件"
                    label="买了一件，进度加一"
                    seal
                    @click="emit('bought')"
                />
                <PressButton
                    v-if="!summary.done"
                    :seal="goal.kind !== 'gear'"
                    icon="check"
                    text="记一笔"
                    label="记一笔进度"
                    @click="emit('record')"
                />
                <PressButton text="流水" label="看全部流水" @click="emit('logs')" />
            </template>
            <span class="spacer" />
            <span v-if="summary.done" class="mark">达成</span>
        </div>
    </PaperCard>
</template>

<style scoped>
.goal {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* 底边比上边多 2px：达成章是斜的，贴着底边会压到那圈双线。 */
    padding: 13px 15px 15px;
}
/* 达成的那张：只有边线与一枚章。不换底色——目标卡本来就躺在纸面上，
 * 换底色会让「已经结束的东西」比进行中的还显眼。 */
.goal.done {
    border-color: color-mix(in srgb, var(--success) 42%, var(--rule));
}
.goal-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}
.goal-head h2 {
    min-width: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-md);
    font-weight: 400;
    line-height: 1.45;
    letter-spacing: 0.03em;
    overflow-wrap: anywhere;
}
.goal-tools {
    display: flex;
    flex: none;
    gap: 2px;
    margin-left: auto;
}
.tool {
    --icon-size: calc(13px * var(--fs-scale));
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition: background-color var(--t-quick) var(--ease-soft);
}
.tool:hover {
    background: var(--paper-2);
    color: var(--ink);
}
.goal-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: 0;
}
.muted {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.05em;
}
/* 类型章：只给一条边、不灌底。它说的是「这张卡怎么读」，不是分类色块。 */
.kind {
    --icon-size: calc(11px * var(--fs-scale));
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 5px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
    line-height: 1.75;
}
.kind-growth {
    color: var(--moss);
    border-color: color-mix(in srgb, var(--moss) 48%, transparent);
}
.kind-money {
    color: var(--num);
    border-color: color-mix(in srgb, var(--num) 48%, transparent);
}
/* 装备用中性墨：赭只有一档，与存钱共用就分不出来；朱要留给印面。 */
.kind-gear {
    color: var(--ink-2);
    border-color: color-mix(in srgb, var(--ink-2) 34%, transparent);
}
.deadline {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.05em;
}
.deadline.over {
    color: var(--danger);
}
.readout {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-top: 2px;
}
.readout .left {
    min-width: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    letter-spacing: 0.03em;
}
.readout .left b {
    color: var(--ink-2);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.readout .pct {
    flex: none;
    color: var(--num);
    font-size: calc(var(--fs-base) * 1.15);
    font-variant-numeric: tabular-nums;
}
.goal.done .readout .pct {
    color: var(--success);
}
/* 达成后那条线只留一道底槽（`MeterBar` 拿不到 `percent` 时不画填充），
 * 占位保持卡片高度一致，但不假装还有进度。 */
.done-line {
    height: 10px;
}
.members {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
}
.member {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 72px;
    align-items: baseline;
    gap: 10px;
    padding: 3px 0;
    font-size: var(--fs-sm);
    border-top: var(--w-hair) solid color-mix(in srgb, var(--rule) 55%, transparent);
}
.member:first-child {
    border-top: 0;
}
.member .who {
    display: flex;
    align-items: baseline;
    gap: 5px;
    overflow: hidden;
    color: var(--ink-2);
    white-space: nowrap;
    text-overflow: ellipsis;
}
.member .gone {
    flex: none;
    padding: 0 4px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    color: var(--muted);
    font-size: var(--fs-mini);
}
.member .value {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.member .value b {
    color: var(--ink);
    font-weight: 400;
}
.member .state {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.03em;
    text-align: right;
    white-space: nowrap;
}
.member .state.ok {
    color: var(--success);
}
.member .state.unknown {
    color: color-mix(in srgb, var(--muted) 70%, var(--paper));
}
.member .state.dead {
    color: color-mix(in srgb, var(--muted) 60%, var(--paper));
}
.member.log .who {
    color: var(--ink-2);
}
.goal-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.65;
    overflow-wrap: anywhere;
}
.goal-empty {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.goal-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding-top: 6px;
}
.goal-actions .spacer {
    flex: 1;
}
/* 达成章：方形、微转。全站只有「已入账 / 已达成」配盖章（CONVENTIONS §2.4）。 */
.mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: var(--w-hair) solid var(--seal-edge);
    border-radius: var(--r-1);
    background: var(--seal);
    color: var(--on-seal);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
    transform: rotate(-5deg);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bevel-hi) 22%, transparent);
}
</style>
