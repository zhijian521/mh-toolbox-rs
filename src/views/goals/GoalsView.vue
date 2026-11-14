<script setup lang="ts">
import { useRouteAction } from '../../composables/use-route-action';
import { computed, ref } from 'vue';
import SaveNotice from '../../components/SaveNotice.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { ALL_OPTIONS } from '../../components/select-options';
import { notify } from '../../composables/use-notify';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { characterOptions } from '../characters/character-options';
import { useRoster } from '../characters/roster';
import GoalCard from './GoalCard.vue';
import GoalEditor from './GoalEditor.vue';
import GoalGrowth from './GoalGrowth.vue';
import GoalLogs from './GoalLogs.vue';
import {
    GOAL_KINDS,
    applyMetric,
    goalSummary,
    metricApplicable,
    orderGoals,
    type Goal,
    type GoalSummary,
} from './goals';
import { useGoals, type GoalInput, type LogInput } from './goals-store';

const {
    goals,
    loadError,
    writeError,
    pending,
    flush,
    retry,
    addGoal,
    updateGoal,
    removeGoal,
    addLog,
    removeLog,
} = useGoals();
const {
    roster,
    update: updateCharacter,
    loadError: rosterLoadError,
    writeError: rosterWriteError,
    flush: flushRoster,
    retry: retryRoster,
} = useRoster();
const today = useToday();
const entries = computed(() =>
    goals.value.map((goal) => ({ goal, summary: goalSummary(goal, roster.value) })),
);
const ordered = computed(() => orderGoals(entries.value));
const active = computed(() => entries.value.filter((entry) => !entry.summary.done));
const status = ref<'active' | 'done' | 'all'>('active');
const kind = ref(ALL_OPTIONS);
const who = ref(ALL_OPTIONS);
const keyword = ref('');
const statusOptions = computed(() => [
    { value: 'active' as const, label: `进行中 ${active.value.length}` },
    { value: 'done' as const, label: `已达成 ${entries.value.length - active.value.length}` },
    { value: 'all' as const, label: `全部 ${entries.value.length}` },
]);
const kindOptions = [
    { value: ALL_OPTIONS, label: '全部类型' },
    ...GOAL_KINDS.map((row) => ({ value: row.value, label: row.label })),
];
const whoOptions = computed(() =>
    characterOptions(
        roster.value,
        goals.value.flatMap((goal) => goal.members.map((member) => member.id)),
        { all: true },
    ),
);
const visible = computed(() => {
    const text = keyword.value.trim().toLocaleLowerCase();
    return ordered.value.filter(({ goal, summary }) => {
        if (status.value === 'active' && summary.done) return false;
        if (status.value === 'done' && !summary.done) return false;
        if (kind.value !== ALL_OPTIONS && goal.kind !== kind.value) return false;
        if (who.value !== ALL_OPTIONS && !goal.members.some((member) => member.id === who.value))
            return false;
        const names = goal.members
            .map(
                (member) =>
                    roster.value.find((character) => character.id === member.id)?.name ||
                    member.name,
            )
            .join(' ');
        return `${goal.title} ${goal.tracking?.key ?? ''} ${goal.note} ${names}`
            .toLocaleLowerCase()
            .includes(text);
    });
});

const editing = ref<{ goal?: Goal } | null>(null);
const growthId = ref('');
const logsId = ref('');
const growth = computed(() => goals.value.find((goal) => goal.id === growthId.value));
const logs = computed(() => goals.value.find((goal) => goal.id === logsId.value));
const editSubmit = usePersistedSubmit(flush, retry);
const { saving: editSaving, locked: editLocked, action: editAction } = editSubmit;
const growthSubmit = usePersistedSubmit(flushRoster, retryRoster);
const { saving: growthSaving, locked: growthLocked, action: growthAction } = growthSubmit;
const progressSubmit = usePersistedSubmit(flush, retry);
const { saving: progressSaving, locked: progressLocked, action: progressAction } = progressSubmit;
const editError = ref('');
const growthError = ref('');
const progressError = ref('');
const recorded = ref(0);
let savedGoalId = '';
let beforeSave: GoalSummary | null = null;
let beforeProgress: GoalSummary | null = null;
let beforeGrowth: GoalSummary | null = null;
const removal = useConfirmedRemoval(
    () =>
        !!loadError.value ||
        !!writeError.value ||
        pending.value > 0 ||
        editLocked.value ||
        growthLocked.value ||
        progressLocked.value,
    flush,
);
const { removing } = removal;
const blocked = computed(
    () =>
        !!loadError.value ||
        !!writeError.value ||
        pending.value > 0 ||
        editLocked.value ||
        growthLocked.value ||
        progressLocked.value ||
        removing.value,
);

function summaryOf(id: string) {
    const goal = goals.value.find((row) => row.id === id);
    return goal ? goalSummary(goal, roster.value) : null;
}
function announce(before: GoalSummary | null, id: string) {
    if (before?.done || !summaryOf(id)?.done) return;
    notify.success('目标达成');
    if (status.value === 'active') status.value = 'all';
}
function openEditor(goal?: Goal) {
    if (blocked.value) return;
    editSubmit.reset();
    savedGoalId = '';
    editError.value = '';
    editing.value = { goal };
}
function closeEditor() {
    if (editSaving.value) return;
    editSubmit.reset();
    editing.value = null;
}
async function save(input: GoalInput) {
    if (!editing.value) return;
    const ok = await editSubmit.run('editor', () => {
        editError.value = '';
        const goal = editing.value?.goal;
        beforeSave = goal ? summaryOf(goal.id) : null;
        const result = goal ? updateGoal(goal.id, input) : addGoal(input);
        if (!result.ok) {
            editError.value = result.error;
            return false;
        }
        savedGoalId = result.goal.id;
        return true;
    });
    if (!ok) return;
    announce(beforeSave, savedGoalId);
    closeEditor();
    notify.success('已保存');
}
async function askRemove(goal: Goal) {
    if (
        await removal.run(
            {
                danger: true,
                title: `删除「${goal.title}」？`,
                note: goal.tracking
                    ? '角色档案保持不变。'
                    : `同时删除 ${goal.logs.length} 条记录。`,
                confirmText: '删除',
            },
            () => removeGoal(goal.id),
        )
    )
        notify.success('已删除');
}
function openGrowth(goal: Goal) {
    if (blocked.value) return;
    growthSubmit.reset();
    growthError.value = '';
    growthId.value = goal.id;
}
function closeGrowth() {
    if (growthSaving.value) return;
    growthSubmit.reset();
    growthId.value = '';
}
async function applyGrowth(values: { id: string; value: number }[]) {
    const goal = growth.value;
    if (!goal?.tracking) return;
    const tracking = goal.tracking;
    const ok = await growthSubmit.run(goal.id, () => {
        growthError.value = '';
        if (rosterLoadError.value) {
            growthError.value = rosterLoadError.value;
            return false;
        }
        const updates = values.map((item) => ({
            ...item,
            character: roster.value.find((character) => character.id === item.id),
        }));
        if (
            !updates.length ||
            updates.some(
                (item) =>
                    !item.character ||
                    !goal.members.some((member) => member.id === item.id) ||
                    !Number.isSafeInteger(item.value) ||
                    item.value < 0 ||
                    !metricApplicable(item.character, tracking),
            )
        ) {
            growthError.value = '角色或数值已变化，请重新打开后修改';
            return false;
        }
        const prepared = updates.map((item) => ({
            current: item.character!,
            next: applyMetric(item.character!, tracking, item.value),
        }));
        if (prepared.some((item) => item.next === item.current)) {
            growthError.value = '此项目暂不能写入角色档案';
            return false;
        }
        beforeGrowth = summaryOf(goal.id);
        for (const item of prepared) updateCharacter(item.next, 'goal', goal.title);
        return true;
    });
    if (!ok) return;
    announce(beforeGrowth, goal.id);
    closeGrowth();
    notify.success('角色档案已更新');
}
function openLogs(goal: Goal) {
    if (blocked.value) return;
    progressSubmit.reset();
    progressError.value = '';
    logsId.value = goal.id;
}
function closeLogs() {
    if (progressSaving.value || removing.value) return;
    progressSubmit.reset();
    logsId.value = '';
}
async function record(input: LogInput) {
    const goal = logs.value;
    if (!goal || removing.value || (!progressAction.value && !!writeError.value)) return;
    const ok = await progressSubmit.run(progressAction.value ?? `log:${goal.id}`, () => {
        progressError.value = '';
        beforeProgress = summaryOf(goal.id);
        const result = addLog(goal.id, input);
        if (!result.ok) {
            progressError.value = result.error;
            return false;
        }
        return true;
    });
    if (!ok) return;
    progressError.value = '';
    recorded.value += 1;
    announce(beforeProgress, goal.id);
}
async function bought(goal: Goal) {
    if (blocked.value) return;
    beforeProgress = summaryOf(goal.id);
    const ok = await progressSubmit.run(`bought:${goal.id}`, () => {
        const result = addLog(goal.id, { date: today.value, delta: 1, note: '买了一件' });
        if (!result.ok) {
            notify.error(result.error);
            return false;
        }
        return true;
    });
    if (ok) announce(beforeProgress, goal.id);
    else if (progressAction.value) {
        progressError.value = '';
        logsId.value = goal.id;
    }
}
async function dropLog(logId: string) {
    const goal = logs.value;
    if (!goal) return;
    await removal.run(
        {
            danger: true,
            title: '删除这条记录？',
            note: '目标进度会重新计算。',
            confirmText: '删除',
        },
        () => removeLog(goal.id, logId),
    );
}
useRouteAction('/goals', {
    new() {
        openEditor();
    },
    update(query) {
        const goal = goals.value.find((one) => one.id === query.goal);
        if (!goal) return;
        if (goal.tracking) openGrowth(goal);
        else openLogs(goal);
    },
});
</script>

<template>
    <PageShell title="目标" desc="修炼、技能与属性，按角色跟踪养成进度">
        <template #actions
            ><PressButton
                icon="add"
                text="新增"
                label="新建目标"
                seal
                :disabled="blocked"
                @click="openEditor()"
        /></template>
        <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <p v-if="rosterLoadError" class="note error" role="alert">{{ rosterLoadError }}</p>
        <SaveNotice
            v-if="rosterWriteError"
            :error="rosterWriteError"
            :pending="0"
            @retry="retryRoster"
        />
        <div class="filters page-filters">
            <SegmentedPills v-model="status" :options="statusOptions" label="目标状态" />
            <SelectField v-model="kind" :options="kindOptions" label="目标类型" />
            <SelectField v-model="who" :options="whoOptions" label="按角色筛选" />
            <input
                v-model="keyword"
                class="field search filter-search"
                type="search"
                placeholder="搜索目标、角色"
                aria-label="搜索目标"
            />
        </div>
        <div v-if="!goals.length" class="record-empty">暂无目标</div>
        <div v-else-if="!visible.length" class="record-empty">暂无符合条件的目标</div>
        <div v-else class="grid">
            <GoalCard
                v-for="entry in visible"
                :key="entry.goal.id"
                :goal="entry.goal"
                :summary="entry.summary"
                :today="today"
                :disabled="blocked"
                @edit="openEditor(entry.goal)"
                @remove="askRemove(entry.goal)"
                @growth="openGrowth(entry.goal)"
                @record="openLogs(entry.goal)"
                @bought="bought(entry.goal)"
            />
        </div>
    </PageShell>
    <GoalEditor
        v-if="editing"
        :goal="editing.goal"
        :saving="editSaving"
        :locked="editLocked"
        :retrying="editAction !== null"
        :error="editError || writeError"
        @save="save"
        @close="closeEditor"
    />
    <GoalGrowth
        v-if="growth"
        :goal="growth"
        :saving="growthSaving"
        :locked="growthLocked"
        :retrying="growthAction !== null"
        :error="growthError || rosterLoadError || rosterWriteError"
        @save="applyGrowth"
        @close="closeGrowth"
    />
    <GoalLogs
        v-if="logs"
        :goal="logs"
        :summary="goalSummary(logs, roster)"
        :saving="progressSaving || removing"
        :locked="progressLocked || removing || !!writeError"
        :retrying="progressAction !== null"
        :error="progressError || writeError"
        :recorded="recorded"
        @add="record"
        @remove="dropLog"
        @retry="retry"
        @close="closeLogs"
    />
</template>

<style scoped>
.filters :deep(.select-field) {
    flex: 0 1 140px;
    width: 140px;
    max-width: 100%;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 16px;
    align-items: start;
}
</style>
