<script setup lang="ts">
import { lazyDialog } from '../../components/lazy-dialog';
import { useRouteAction } from '../../composables/use-route-action';
import { computed, inject, ref } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import LiquidLedgerFrame from '../../components/LiquidLedgerFrame.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { gameDataError, gameDataReady } from '../../services/game-data';
import { notify } from '../../composables/use-notify';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { loadRoster, useRoster } from '../characters/roster';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import GlassDialog from '../../components/liquid-glass/GlassDialog.vue';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import ModalShell from '../../components/ModalShell.vue';
import GoalCard from './GoalCard.vue';
import GoalHistory from './GoalHistory.vue';
import {
    goalSummary,
    orderGoals,
    prepareComboUpdates,
    prepareGrowthUpdates,
    type GoalProgressInput,
    type ReadonlyGoal,
    type GoalSummary,
} from './goals';
import { loadGoals, useGoals, type GoalInput, type LogInput } from './goals-store';

const props = defineProps<{
    reloadGoals?: () => Promise<void>;
    reloadRoster?: () => Promise<void>;
}>();
const glass = inject(glassLedger, null);

const GoalEditor = lazyDialog(() => import('./GoalEditor.vue'));
const GoalGrowth = lazyDialog(() => import('./GoalGrowth.vue'));
const GoalComboProgress = lazyDialog(() => import('./GoalComboProgress.vue'));
const GoalLogs = lazyDialog(() => import('./GoalLogs.vue'));

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
    pending: rosterPending,
} = useRoster();
const today = useToday();
const entries = computed(() =>
    goals.value.map((goal) => ({ goal, summary: goalSummary(goal, roster.value) })),
);
const byId = computed(() => new Map(entries.value.map((entry) => [entry.goal.id, entry])));
const ordered = computed(() => orderGoals(entries.value));
const status = ref<'active' | 'done' | 'all'>('active');
const statusOptions = [
    { value: 'active' as const, label: '进行中' },
    { value: 'done' as const, label: '已达成' },
    { value: 'all' as const, label: '全部' },
];
const visible = computed(() =>
    ordered.value.filter(
        ({ summary }) => status.value === 'all' || summary.done === (status.value === 'done'),
    ),
);

const emptyText = computed(() => {
    if (loadError.value && !goals.value.length) return '暂时无法读取目标，请重新读取。';
    if (!goals.value.length) return '暂无目标';
    return status.value === 'done' ? '暂无已达成目标' : '暂无进行中的目标';
});

const editing = ref<{ goal?: ReadonlyGoal } | null>(null);
const growthId = ref('');
const growthCharacter = ref('');
const logsId = ref('');
const historyGoal = ref<ReadonlyGoal | null>(null);
const historyOpen = ref(false);
function openHistory(goal: ReadonlyGoal) {
    historyGoal.value = goal;
    historyOpen.value = true;
}
const growth = computed(() => byId.value.get(growthId.value));
const logEntry = computed(() => byId.value.get(logsId.value));
const logs = computed(() => logEntry.value?.goal);
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
    return byId.value.get(id)?.summary ?? null;
}
function announce(before: GoalSummary | null, id: string) {
    if (before?.done || !summaryOf(id)?.done) return;
    notify.success('目标达成');
    if (status.value === 'active') status.value = 'all';
}
function openEditor(goal?: ReadonlyGoal) {
    if (blocked.value) return;
    editSubmit.reset();
    savedGoalId = '';
    editError.value = '';
    editing.value = { goal };
}
function closeEditor() {
    if (editSaving.value || removing.value) return;
    editSubmit.reset();
    editing.value = null;
}
async function save(input: GoalInput) {
    if (!editing.value || removing.value) return;
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
async function askRemove() {
    const goal = editing.value?.goal;
    if (!goal) return;
    if (
        await removal.run(
            {
                danger: true,
                title: `删除「${goal.title}」？`,
                note:
                    goal.tracking || goal.kind === 'combo'
                        ? '角色档案保持不变。'
                        : `同时删除 ${goal.logs.length} 条记录。`,
                confirmText: '删除',
            },
            () => {
                removeGoal(goal.id);
                editing.value = null;
            },
        )
    )
        notify.success('已删除');
}
function openGrowth(goal: ReadonlyGoal, characterId = '') {
    if (blocked.value) return;
    growthSubmit.reset();
    growthError.value = '';
    growthId.value = goal.id;
    growthCharacter.value = characterId;
}
function closeGrowth() {
    if (growthSaving.value) return;
    growthSubmit.reset();
    growthId.value = '';
    growthCharacter.value = '';
}
async function applyGrowth(values: GoalProgressInput[]) {
    const goal = growth.value?.goal;
    if (!goal) return;
    const ok = await growthSubmit.run(goal.id, () => {
        growthError.value = '';
        if (rosterLoadError.value || !gameDataReady.value) {
            growthError.value =
                rosterLoadError.value || gameDataError.value || '角色规则尚未加载，请重试后保存';
            return false;
        }
        const prepare = goal.kind === 'combo' ? prepareComboUpdates : prepareGrowthUpdates;
        const prepared = prepare(goal, roster.value, values);
        if (!prepared) {
            growthError.value = '角色或数值已变化，请重新打开后修改';
            return false;
        }
        beforeGrowth = summaryOf(goal.id);
        for (const character of prepared) updateCharacter(character, 'goal', goal.title);
        return true;
    });
    if (!ok) return;
    announce(beforeGrowth, goal.id);
    closeGrowth();
    notify.success('角色档案已更新');
}
function openLogs(goal: ReadonlyGoal) {
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
async function bought(goal: ReadonlyGoal) {
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
        if (goal.tracking || goal.kind === 'combo') openGrowth(goal);
        else openLogs(goal);
    },
});
</script>

<template>
    <component
        :is="glass ? LiquidLedgerFrame : PageShell"
        :class="glass ? 'liquid-goals' : undefined"
        title="目标"
        desc="养成计划 · 进度跟踪"
    >
        <template #actions>
            <PressButton
                icon="add"
                text="新增"
                label="新建目标"
                seal
                :disabled="blocked"
                @click="openEditor()"
            />
        </template>
        <LoadNotice
            :error="loadError"
            :load="props.reloadGoals ?? loadGoals"
            :blocked="pending > 0 || !!writeError || !!editing || !!growth || !!logs"
        />
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <LoadNotice
            :error="rosterLoadError"
            :load="props.reloadRoster ?? loadRoster"
            :blocked="rosterPending > 0 || !!rosterWriteError || !!editing || !!growth"
        />
        <SaveNotice
            v-if="rosterWriteError"
            :error="rosterWriteError"
            :pending="rosterPending"
            @retry="retryRoster"
        />
        <div class="filters page-filters">
            <GlassSegmented v-if="glass" v-model:value="status" class="lg-status-tabs" data-size="compact" aria-label="目标状态">
                <GlassSegment v-for="option in statusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                </GlassSegment>
            </GlassSegmented>
            <SegmentedPills v-else v-model="status" :options="statusOptions" label="目标状态" />
        </div>
        <div v-if="!visible.length" class="goal-empty">
            <GlassEmptyState v-if="glass">{{ emptyText }}</GlassEmptyState>
            <div v-else class="record-empty">{{ emptyText }}</div>
        </div>
        <div v-else class="grid">
            <GoalCard
                v-for="entry in visible"
                :key="entry.goal.id"
                :goal="entry.goal"
                :summary="entry.summary"
                :today="today"
                :disabled="blocked"
                @edit="openEditor(entry.goal)"
                @history="openHistory(entry.goal)"
                @growth="openGrowth(entry.goal, $event)"
                @record="openLogs(entry.goal)"
                @bought="bought(entry.goal)"
            />
        </div>
        <GlassDialog v-if="glass" v-model:open="historyOpen" class="goal-history-sheet" bottom lazy detents="400" label="目标历史">
            <GoalHistory v-if="historyGoal" :key="historyGoal.id" :goal="historyGoal" embedded @close="historyOpen = false" />
        </GlassDialog>
    </component>
    <GoalEditor
        v-if="editing"
        :goal="editing.goal"
        :saving="editSaving"
        :locked="editLocked || removing"
        :retrying="editAction !== null"
        :error="editError || writeError"
        @save="save"
        @remove="askRemove"
        @close="closeEditor"
    />
    <component
        :is="growth?.summary.kind === 'combo' ? GoalComboProgress : GoalGrowth"
        v-if="growth"
        v-bind="growth.summary.kind === 'combo' ? { initialCharacter: growthCharacter } : {}"
        :goal="growth.goal"
        :rows="growth.summary.rows"
        :saving="growthSaving"
        :locked="growthLocked"
        :retrying="growthAction !== null"
        :error="growthError || rosterLoadError || rosterWriteError"
        @save="applyGrowth"
        @close="closeGrowth"
    />
    <GoalLogs
        v-if="logEntry"
        :goal="logEntry.goal"
        :summary="logEntry.summary"
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
    <ModalShell v-if="!glass && historyOpen && historyGoal" title="目标历史" :width="620" @close="historyOpen = false">
        <GoalHistory :goal="historyGoal" />
        <template #footer>
            <PressButton text="关闭" label="关闭目标历史" @click="historyOpen = false" />
        </template>
    </ModalShell>
</template>

<style scoped>
.liquid-goals {
    --goal-progress-color: var(--liquid-focus);
}
.liquid-goals :deep(.goal-progress) {
    --progress-light: color-mix(in srgb, var(--progress-color) 72%, white);
    --progress-dark: color-mix(in srgb, var(--progress-color) 80%, black);
}
.liquid-goals :deep(.tick) {
    border-radius: 2px;
    background: var(--ledger-surface);
    box-shadow: inset 0 1px 1px rgb(0 0 0 / 18%), 0 1px 0 var(--lg-edge-light);
}
.liquid-goals :deep(.tick i) {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 26%), inset 0 -1px 0 rgb(0 0 0 / 14%);
}
.goal-history-sheet {
    --glass-sheet-max-width: 660px;
    --glass-foreground: var(--liquid-ink);
}
.goal-history-sheet::part(sheet) { max-height: calc(100dvh - 24px); }
.goal-history-sheet::part(body) { display: flex; flex-direction: column; }
.grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}
.liquid-goals .goal-empty {
    padding-block: 28px;
}
</style>
