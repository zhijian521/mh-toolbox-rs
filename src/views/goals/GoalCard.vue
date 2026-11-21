<script setup lang="ts">
import { computed } from 'vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import GoalProgress from './GoalProgress.vue';
import {
    deadlineText,
    kindMeta,
    scopeText,
    type ComboGoalRow,
    type GoalRow,
    type GoalSummary,
    type ReadonlyGoal,
} from './goals';

const props = defineProps<{
    goal: ReadonlyGoal;
    summary: GoalSummary;
    today: string;
    disabled: boolean;
}>();
const emit = defineEmits<{
    edit: [];
    history: [];
    record: [];
    growth: [characterId?: string];
    bought: [];
}>();
const deadline = computed(() => deadlineText(props.goal.deadline, props.today, props.summary.done));
const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const rows = computed(() => {
    const { goal, summary } = props;
    if (summary.kind === 'manual') return [];
    return summary.rows
        .map((row: GoalRow | ComboGoalRow) => {
            const item = 'characterId' in row ? row : null;
            const target = item?.target ?? goal.target;
            const unit = item?.unit ?? goal.unit;
            const name = row.name || '未命名';
            const label = item ? `${name} · ${item.tracking.key}` : name;
            const status = !row.exists ? '已删除' : !row.applicable ? '不适用' : '待补录';
            const value = row.value === null ? null : number(row.value);
            const targetText = ` / ${number(target)} ${unit}`;
            const readout = value === null ? status : `${value}${targetText}`;
            return {
                id: row.id,
                label,
                done: row.done,
                value,
                targetText,
                status,
                characterId: item && row.exists && row.applicable ? item.characterId : '',
                percent:
                    row.value === null || target <= 0
                        ? null
                        : Math.max(0, Math.min(row.done ? 100 : 99, (row.value / target) * 100)),
                readout: row.done ? `${readout} · 已达标` : readout,
            };
        })
        .sort((a, b) => Number(a.done) - Number(b.done));
});
</script>

<template>
    <PaperCard
        as="article"
        plain
        class="goal"
        :class="{ done: summary.done }"
        :data-goal-id="goal.id"
    >
        <header class="goal-head">
            <div class="heading">
                <h2>{{ goal.title }}</h2>
                <div class="meta">
                    <span class="category">{{ kindMeta(goal.kind).label }}</span>
                    <span v-if="summary.kind === 'combo'">
                        {{ summary.achieved }} / {{ summary.total }} 项达标
                    </span>
                    <span v-else-if="summary.kind === 'growth'">
                        {{ summary.achieved }} / {{ summary.totalMembers }} 人达标
                    </span>
                    <span v-else-if="goal.members.length">{{ scopeText(goal) }}</span>
                    <span v-if="summary.done" class="mark">已达成</span>
                </div>
            </div>
            <PressButton
                icon="edit"
                label="编辑目标"
                size="sm"
                :disabled="disabled"
                @click="emit('edit')"
            />
        </header>
        <div class="progress-body">
            <GoalProgress shape="ring" :percent="summary.pct" :label="goal.title + '总体进度'" />
            <div v-if="summary.kind === 'manual'" class="manual-value">
                <b class="num">{{ number(summary.current) }}</b>
                <span> / {{ number(summary.total) }} {{ goal.unit }}</span>
            </div>
            <ul v-else class="members">
                <li v-for="row in rows" :key="row.id">
                    <component
                        :is="row.characterId ? 'button' : 'div'"
                        class="member"
                        :class="{ complete: row.done }"
                        :type="row.characterId ? 'button' : undefined"
                        :disabled="row.characterId ? disabled : undefined"
                        :aria-label="row.characterId ? `更新${row.label}的组合进度` : undefined"
                        :title="row.label + ' · ' + row.readout"
                        @click="row.characterId && emit('growth', row.characterId)"
                    >
                        <span class="who">{{ row.label }}</span>
                        <GoalProgress
                            :percent="row.percent"
                            :label="row.label + '的进度'"
                            :value-text="row.readout"
                        />
                        <span class="value">
                            <template v-if="row.value !== null">
                                <b>{{ row.value }}</b
                                >{{ row.targetText }}
                            </template>
                            <template v-else>{{ row.status }}</template>
                        </span>
                    </component>
                </li>
            </ul>
        </div>
        <p v-if="goal.note" class="goal-note">{{ goal.note }}</p>
        <footer class="goal-actions">
            <span class="deadline" :class="{ over: deadline.startsWith('已逾期') }">{{
                deadline || (summary.doneDate ? `${summary.doneDate} 达成` : '')
            }}</span>
            <PressButton
                icon="history"
                text="历史"
                label="目标历史"
                size="sm"
                @click="emit('history')"
            />
            <PressButton
                v-if="summary.kind !== 'manual'"
                text="更新"
                :label="summary.kind === 'combo' ? '更新组合进度' : '更新各角色的当前值'"
                size="sm"
                seal
                :disabled="disabled || !summary.totalMembers"
                @click="emit('growth')"
            />
            <template v-else>
                <PressButton
                    text="记录"
                    label="记录目标进度"
                    size="sm"
                    :seal="goal.kind !== 'gear' || summary.done"
                    :disabled="disabled"
                    @click="emit('record')"
                />
                <PressButton
                    v-if="goal.kind === 'gear' && !summary.done"
                    icon="add"
                    text="购入"
                    label="买了一件，进度加一"
                    size="sm"
                    seal
                    :disabled="disabled"
                    @click="emit('bought')"
                />
            </template>
        </footer>
    </PaperCard>
</template>

<style scoped>
.goal {
    --progress-color: var(--ochre);
    flex: 1 1 340px;
    max-width: 380px;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 10px;
    min-width: 0;
    padding: 12px;
}
.goal.done,
.complete {
    --progress-color: var(--success);
}
.goal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}
.heading {
    min-width: 0;
}
h2 {
    margin: 0 0 4px;
    color: var(--accent);
    font-size: var(--fs-md);
    font-weight: 400;
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.category {
    padding: 1px 6px;
    border-radius: var(--r-3);
    background: var(--paper-2);
    color: var(--indigo-ink);
}
.mark {
    color: var(--success);
}
.progress-body {
    display: grid;
    grid-template-columns: min(21%, 70px) minmax(0, 1fr);
    align-items: center;
    gap: 8px;
}
.progress-body > :deep(.ring) {
    width: 100%;
}
.members {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(22px, 22%) max-content;
    gap: 4px 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
}
.members > li,
.member {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    min-width: 0;
}
.member {
    align-items: center;
    padding: 3px 5px;
    border: 0;
    border-radius: var(--r-3);
    background: var(--paper-2);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-xs);
    text-align: start;
}
button.member:not(:disabled) {
    cursor: pointer;
}
button.member:not(:disabled):hover {
    background: var(--well);
}
.who {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.value {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
}
.value b {
    color: var(--num);
    font-weight: 400;
}
.manual-value {
    color: var(--muted);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.manual-value b {
    color: var(--num);
    font-size: var(--fs-amount);
    font-weight: 400;
}
.goal-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
}
.goal-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    align-self: end;
    padding-top: 7px;
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
