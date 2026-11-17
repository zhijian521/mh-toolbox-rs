<script setup lang="ts">
/** 组合卡片用圆环汇总达标项数，每个角色仅保留一条进度。 */
import { computed } from 'vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import GoalProgress from './GoalProgress.vue';
import { useRoster } from '../characters/roster';
import {
    comboGoalRows,
    groupComboRows,
    deadlineText,
    type ReadonlyGoal,
    type GoalSummary,
} from './goals';
const props = defineProps<{
    goal: ReadonlyGoal;
    summary: GoalSummary;
    today: string;
    disabled: boolean;
}>();
const emit = defineEmits<{ edit: []; remove: []; growth: [characterId?: string] }>();
const { roster } = useRoster();
const groups = computed(() => groupComboRows(comboGoalRows(props.goal, roster.value)));
const deadline = computed(() => deadlineText(props.goal.deadline, props.today, props.summary.done));
</script>

<template>
    <PaperCard
        as="article"
        class="combo-goal"
        :data-goal-id="goal.id"
        :class="{ done: summary.done }"
    >
        <header class="combo-card-head">
            <div class="combo-heading">
                <h2>{{ goal.title }}</h2>
                <span class="combo-meta"
                    >组合 · {{ summary.achieved }} / {{ summary.total }} 项达标<span
                        v-if="summary.done"
                    >
                        · 已达成</span
                    ></span
                >
            </div>
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
        </header>
        <div class="combo-card-body">
            <GoalProgress shape="ring" :percent="summary.pct" :label="goal.title + '总体进度'" />
            <div class="combo-member-list">
                <button
                    v-for="group in groups"
                    :key="group.id"
                    type="button"
                    class="combo-member"
                    :class="{ complete: group.done }"
                    :disabled="disabled || !group.total"
                    :aria-label="`更新${group.name}的组合进度`"
                    @click="emit('growth', group.id)"
                >
                    <span class="combo-who">{{ group.name }}</span>
                    <GoalProgress
                        :percent="group.total ? (group.achieved / group.total) * 100 : null"
                        :label="`${group.name}组合进度`"
                        :value-text="`${group.achieved} / ${group.total} 项达标`"
                        :steps="Math.min(20, Math.max(1, group.total))"
                    />
                    <span class="combo-count">{{
                        group.total
                            ? `${group.achieved} / ${group.total} 项`
                            : group.rows.some((row) => row.exists)
                              ? '不适用'
                              : '已删除'
                    }}</span>
                </button>
            </div>
        </div>
        <footer class="combo-card-footer">
            <span :class="{ over: deadline.startsWith('已逾期') }">{{ deadline }}</span
            ><PressButton
                text="更新"
                label="更新组合进度"
                size="sm"
                :disabled="disabled || !summary.total"
                @click="emit('growth')"
            />
        </footer>
    </PaperCard>
</template>

<style scoped>
.combo-goal {
    --progress-color: var(--ochre);
    display: grid;
    gap: 14px;
    padding: 11px 12px;
    background-image: var(--income-board-texture);
}
.combo-goal.done,
.complete {
    --progress-color: var(--success);
}
.combo-card-head {
    display: flex;
    align-items: flex-start;
    gap: 4px;
}
.combo-heading {
    flex: 1;
    min-width: 0;
}
h2 {
    margin: 0 0 3px;
    color: var(--accent);
    font-size: var(--fs-md);
    font-weight: 400;
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.combo-meta {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.combo-member-list {
    display: grid;
    gap: 5px;
}
.combo-card-body {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
}
.combo-member {
    display: grid;
    grid-template-columns: minmax(32px, 0.8fr) minmax(40px, 1fr) max-content;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: calc(20px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    text-align: left;
    cursor: pointer;
}
.combo-member:hover:not(:disabled) {
    background: var(--well);
}
.combo-member:disabled {
    cursor: default;
}
.combo-who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.combo-count {
    color: var(--muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.combo-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: var(--w-hair) solid var(--rule);
}
.combo-card-footer > span {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.combo-card-footer > .over {
    color: var(--danger);
}
</style>
