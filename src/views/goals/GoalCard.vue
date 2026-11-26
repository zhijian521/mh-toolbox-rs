<script setup lang="ts">
import { computed, inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import GoalProgress from './GoalProgress.vue';
import GoalResources from './GoalResources.vue';
import type { GoalResources as ResourceEstimate } from './goal-resources';
import {
    deadlineText,
    groupComboRows,
    kindMeta,
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
    resources?: ResourceEstimate | null;
    resourceStatus?: string;
}>();
const emit = defineEmits<{
    edit: [];
    history: [];
    record: [];
    growth: [characterId?: string];
}>();
const glassCard = inject(glassLedger, null)?.card;
const deadline = computed(() => deadlineText(props.goal.deadline, props.today, props.summary.done));
const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const rows = computed(() => {
    const { goal, summary } = props;
    if (summary.kind === 'manual') return [];
    if (glassCard && summary.kind === 'combo') {
        return groupComboRows(summary.rows)
            .map((group) => {
                const name = group.name || '未命名';
                const readout = `${group.achieved} / ${group.total} 项达标`;
                const status = group.rows.some((row) => row.exists) ? '无适用项' : '已删除';
                return {
                    id: group.id,
                    label: name,
                    done: group.done,
                    value: group.total ? String(group.achieved) : null,
                    targetValue: String(group.total),
                    unit: '项',
                    status,
                    characterId: group.total ? group.id : '',
                    percent: group.total ? group.pct : null,
                    readout: group.total ? readout : status,
                };
            })
            .sort((a, b) => Number(a.done) - Number(b.done));
    }
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
                targetValue: number(target),
                unit,
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
    <component
        :is="glassCard ?? PaperCard"
        :as="glassCard ? undefined : 'article'"
        :plain="glassCard ? undefined : true"
        :role="glassCard ? 'article' : undefined"
        class="goal"
        :class="{ done: summary.done, 'is-liquid-goal': glassCard }"
        :data-goal-id="goal.id"
    >
        <header class="goal-head">
            <div class="heading">
                <div v-if="glassCard && summary.done" class="goal-eyebrow meta">
                    <span class="mark">已达成</span>
                </div>
                <h2>{{ goal.title }}</h2>
                <div v-if="!glassCard && summary.done" class="meta">
                    <span class="mark">已达成</span>
                </div>
            </div>
            <div class="goal-head-actions">
                <PressButton icon="history" label="目标历史" size="sm" @click="emit('history')" />
                <PressButton
                    icon="refresh"
                    :label="
                        summary.kind === 'manual'
                            ? '更新目标进度'
                            : summary.kind === 'combo'
                              ? '更新组合进度'
                              : '更新各角色的当前值'
                    "
                    size="sm"
                    :disabled="disabled || (summary.kind !== 'manual' && !summary.totalMembers)"
                    @click="summary.kind === 'manual' ? emit('record') : emit('growth')"
                />
                <PressButton
                    icon="edit"
                    label="编辑目标"
                    size="sm"
                    :disabled="disabled"
                    @click="emit('edit')"
                />
            </div>
        </header>
        <div class="progress-body">
            <figure class="goal-figure">
                <GoalProgress
                    shape="ring"
                    :percent="summary.pct"
                    :label="goal.title + '总体进度'"
                />
                <figcaption class="category">
                    {{ kindMeta(goal.kind).label }}
                </figcaption>
            </figure>
            <dl v-if="glassCard && summary.kind === 'manual'" class="goal-figures">
                <div>
                    <dt>当前</dt>
                    <dd>
                        {{ number(summary.current) }} <small>{{ goal.unit }}</small>
                    </dd>
                </div>
                <div>
                    <dt>目标</dt>
                    <dd>
                        {{ number(summary.total) }} <small>{{ goal.unit }}</small>
                    </dd>
                </div>
            </dl>
            <div v-else-if="summary.kind === 'manual'" class="manual-value">
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
                                <b>{{ row.value }}</b> / <b>{{ row.targetValue }}</b> {{ row.unit }}
                            </template>
                            <template v-else>{{ row.status }}</template>
                        </span>
                    </component>
                </li>
            </ul>
        </div>
        <p v-if="goal.note" class="goal-note">{{ goal.note }}</p>
        <GoalResources
            v-if="summary.kind !== 'manual'"
            :resources="resources"
            :status="resourceStatus"
        />
        <footer v-if="deadline || summary.doneDate" class="goal-actions">
            <span class="deadline" :class="{ over: deadline.startsWith('已逾期') }">{{
                deadline || (summary.doneDate ? `${summary.doneDate} 达成` : '')
            }}</span>
        </footer>
    </component>
</template>

<style scoped>
.goal {
    --progress-color: var(--goal-progress-color, var(--ochre));
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
.goal-head-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
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
    color: var(--muted);
    font-size: var(--fs-xs);
    white-space: nowrap;
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
.goal-figure {
    display: grid;
    justify-items: center;
    gap: 4px;
    min-width: 0;
    margin: 0;
    font-size: var(--fs-xs);
}
.goal-figure > :deep(.ring) {
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
    color: var(--goal-progress-color, var(--accent));
    font-size: var(--fs-md);
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

.is-liquid-goal {
    max-width: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
}
.is-liquid-goal h2 {
    color: var(--liquid-ink);
    margin-block: 3px;
}
.goal-eyebrow .mark {
    color: var(--success);
}
.is-liquid-goal .progress-body {
    grid-template-columns: min(25%, calc(78px * var(--fs-scale))) minmax(0, 1fr);
    gap: 12px;
    align-items: center;
}
.is-liquid-goal .goal-figure > :deep(.ring) {
    background: var(--ledger-surface);
    box-shadow: inset 0 0 0 1px var(--rule);
}
.is-liquid-goal .goal-figure :deep(.ring svg) {
    filter: none;
}
.is-liquid-goal .goal-figure :deep(.ring-bed),
.is-liquid-goal .goal-figure :deep(.ring-depth) {
    display: none;
}
.is-liquid-goal .goal-figure :deep(.ring-track) {
    stroke: var(--rule);
}
.is-liquid-goal .members {
    grid-template-columns: minmax(0, 1fr) minmax(22px, 27%) minmax(0, auto);
}
.is-liquid-goal .member {
    min-height: 24px;
    padding-inline: 7px;
    background: var(--ledger-surface);
}
.is-liquid-goal button.member:not(:disabled):hover {
    background: var(--lg-field-fill);
}
.is-liquid-goal .value {
    white-space: normal;
    overflow-wrap: anywhere;
}
.goal-figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 68px), 1fr));
    gap: 8px 12px;
    margin: 0;
    font-variant-numeric: tabular-nums;
}
.goal-figures dt,
.goal-figures small {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.goal-figures dd {
    margin: 2px 0 0;
    color: var(--goal-progress-color, var(--num));
    font-size: var(--fs-amount);
    line-height: 1.2;
    overflow-wrap: anywhere;
}
.is-liquid-goal .goal-actions {
    align-self: stretch;
    margin-top: auto;
    padding-top: 10px;
    gap: 6px;
}
</style>
