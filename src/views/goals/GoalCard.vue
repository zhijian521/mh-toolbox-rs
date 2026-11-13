<script setup lang="ts">
import { computed } from 'vue';
import PaperCard from '../../components/PaperCard.vue';
import GoalProgress from './GoalProgress.vue';
import PressButton from '../../components/PressButton.vue';
import {
    deadlineText,
    kindMeta,
    scopeText,
    type Goal,
    type GoalRow,
    type GoalSummary,
} from './goals';

const props = defineProps<{ goal: Goal; summary: GoalSummary; today: string; disabled: boolean }>();
const emit = defineEmits<{ edit: []; remove: []; record: []; growth: []; bought: [] }>();
const deadline = computed(() => deadlineText(props.goal.deadline, props.today, props.summary.done));
const rows = computed(() =>
    [...props.summary.rows]
        .sort((a, b) => Number(a.done) - Number(b.done))
        .map((row) => ({
            ...row,
            percent:
                !row.exists || !row.applicable || row.value === null || props.goal.target <= 0
                    ? null
                    : Math.max(
                          0,
                          Math.min(row.done ? 100 : 99, (row.value / props.goal.target) * 100),
                      ),
        })),
);
const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
function rowText(row: GoalRow): string {
    if (!row.exists) return '已删除';
    if (!row.applicable) return '不适用';
    if (row.value === null) return '待补录';
    return `${number(row.value)} / ${number(props.goal.target)} ${props.goal.unit} · ${row.done ? '已达标' : '差 ' + number(row.remaining ?? 0)}`;
}
</script>

<template>
    <PaperCard as="article" class="goal" :class="{ done: summary.done }" :data-goal-id="goal.id">
        <header class="goal-head">
            <div class="heading">
                <h2>{{ goal.title }}</h2>
                <span class="eyebrow"
                    ><span class="category">{{ kindMeta(goal.kind).label }}</span
                    ><template v-if="goal.tracking">
                        · 目标 {{ number(goal.target) }} {{ goal.unit }}</template
                    ><template v-else> · {{ scopeText(goal) }}</template></span
                >
            </div>
            <div class="goal-tools">
                <PressButton
                    icon="edit"
                    label="编辑目标"
                    size="sm"
                    :disabled="disabled"
                    @click="emit('edit')"
                />
                <PressButton
                    icon="trash"
                    label="删除目标"
                    size="sm"
                    danger
                    :disabled="disabled"
                    @click="emit('remove')"
                />
            </div>
        </header>
        <div class="progress-summary">
            <span v-if="goal.tracking"
                ><b>{{ summary.achieved }} / {{ summary.totalMembers }}</b> 达标</span
            >
            <span v-else>累计进度</span>
            <span v-if="summary.done" class="mark">已达成</span>
            <span
                v-if="goal.tracking"
                class="milestones"
                role="img"
                :aria-label="`${summary.achieved} / ${summary.totalMembers} 个角色达标`"
            >
                <i
                    v-for="row in rows"
                    :key="row.id"
                    :class="{ on: row.exists && row.applicable && row.done }"
                    :title="row.name + ' · ' + rowText(row)"
                />
            </span>
            <span v-else class="target">目标 {{ number(goal.target) }} {{ goal.unit }}</span>
        </div>
        <div class="progress-body">
            <GoalProgress shape="ring" :percent="summary.pct" :label="goal.title + '总体进度'" />
            <ul v-if="goal.tracking" class="members">
                <li
                    v-for="row in rows"
                    :key="row.id"
                    class="member"
                    :class="{
                        muted: !row.exists || !row.applicable,
                        complete: row.exists && row.applicable && row.done,
                    }"
                    :title="row.name + ' · ' + rowText(row)"
                >
                    <span class="who" :title="row.name">{{ row.name || '未命名' }}</span>
                    <GoalProgress
                        :percent="row.percent"
                        :label="(row.name || '未命名') + '的进度'"
                        :value-text="rowText(row)"
                    />
                    <span class="value">
                        <template v-if="!row.exists">已删除</template>
                        <template v-else-if="!row.applicable">不适用</template>
                        <template v-else-if="row.value === null">待补录</template>
                        <template v-else
                            ><b>{{ number(row.value) }}</b
                            ><small>{{ goal.unit }}</small></template
                        >
                    </span>
                </li>
            </ul>
            <div v-else class="manual-progress">
                <div class="manual-value">
                    <b>{{ number(summary.current) }}</b
                    ><small>/ {{ number(goal.target) }} {{ goal.unit }}</small>
                </div>
                <GoalProgress :percent="summary.pct" :label="goal.title + '累计进度'" />
                <span v-if="!summary.done" class="remaining"
                    >还差 {{ number(Math.max(0, goal.target - summary.current)) }}
                    {{ goal.unit }}</span
                >
            </div>
        </div>
        <p v-if="goal.note" class="goal-note" :title="goal.note">{{ goal.note }}</p>
        <footer class="goal-actions">
            <span class="deadline" :class="{ over: deadline.startsWith('已逾期') }">{{
                deadline || (summary.doneDate ? `${summary.doneDate} 达成` : '')
            }}</span>
            <PressButton
                v-if="goal.tracking"
                icon="edit"
                text="更新"
                label="更新各角色的当前值"
                size="sm"
                :disabled="disabled || !summary.totalMembers"
                @click="emit('growth')"
            />
            <template v-else>
                <PressButton
                    v-if="goal.kind === 'gear' && !summary.done"
                    icon="add"
                    text="购入"
                    label="买了一件，进度加一"
                    size="sm"
                    :disabled="disabled"
                    @click="emit('bought')"
                />
                <PressButton
                    icon="edit"
                    text="记录"
                    label="记录目标进度"
                    size="sm"
                    :disabled="disabled"
                    @click="emit('record')"
                />
            </template>
        </footer>
    </PaperCard>
</template>

<style scoped>
.goal {
    --progress-color: var(--ochre);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 11px 12px;
    background-image: var(--income-board-texture);
}
.goal.done,
.complete {
    --progress-color: var(--success);
}
.goal-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}
.heading {
    flex: 1;
    min-width: 0;
}
.eyebrow {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.category {
    color: var(--indigo-ink);
}
h2 {
    margin: 0 0 2px;
    color: var(--accent);
    font-size: var(--fs-md);
    font-weight: 400;
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.goal-tools {
    display: flex;
    flex: none;
    gap: 4px;
}
.progress-summary {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 10px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.progress-summary b {
    color: var(--ink);
    font-weight: 400;
    font-size: var(--fs-md);
    font-variant-numeric: tabular-nums;
}
.mark {
    color: var(--success);
}
.milestones {
    display: flex;
    align-self: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    margin-left: auto;
    max-width: 55%;
}
.milestones i {
    width: 16px;
    height: 6px;
    border-radius: 1px;
    background: var(--well);
    box-shadow:
        inset 0 1px 1px var(--shadow-lg),
        0 1px 0 var(--bevel-hi);
}
.milestones .on {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--success) 65%, var(--bevel-hi)),
        var(--success) 55%
    );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 0 -1px 0 var(--bevel-lo),
        0 1px 0 color-mix(in srgb, var(--success) 75%, var(--ink-base)),
        0 2px 2px var(--shadow);
}
.target {
    margin-left: auto;
}
.progress-body {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
}
.members {
    display: grid;
    grid-template-columns: minmax(32px, 0.8fr) minmax(40px, 1.5fr) max-content;
    align-items: center;
    gap: 5px 7px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.member {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    gap: 7px;
    min-height: calc(20px * var(--fs-scale));
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.who {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.value {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 2px;
    color: var(--muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.value b {
    color: var(--num);
    font-weight: 400;
}
.complete .value b {
    color: var(--success);
}
.value small {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.muted {
    color: var(--muted);
}
.manual-progress {
    display: grid;
    gap: 6px;
    min-width: 0;
}
.manual-value {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px;
    font-variant-numeric: tabular-nums;
}
.manual-value b {
    color: var(--num);
    font-size: var(--fs-xl);
    font-weight: 400;
    line-height: 1.2;
}
.manual-value small,
.remaining {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.goal-note {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.goal-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 6px;
    border-top: var(--w-hair) solid var(--rule);
}
.deadline {
    flex: 1;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.deadline.over {
    color: var(--danger);
}
</style>
