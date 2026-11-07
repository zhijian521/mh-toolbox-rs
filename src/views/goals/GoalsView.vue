<script setup lang="ts">
import SaveNotice from '../../components/SaveNotice.vue';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { saved } from '../../composables/save-feedback';
import { askConfirm } from '../../composables/use-confirm';
import { notify } from '../../composables/use-notify';

import { useRoster } from '../characters/roster';
import GoalCard from './GoalCard.vue';
import GoalEditor from './GoalEditor.vue';
import GoalGrowth from './GoalGrowth.vue';
import GoalLogs from './GoalLogs.vue';
import {
    GOAL_KINDS,
    applyMetric,
    daysLeft,
    goalSummary,
    orderGoals,
    type Goal,
    type GoalKind,
    type GoalSummary,
} from './goals';
import {
    addLog,
    addGoal,
    removeGoal,
    removeLog,
    updateGoal,
    useGoals,
    type GoalInput,
} from './goals-store';

/**
 * 目标页。
 *
 * 三种类型一张卡：养成读档案、存钱与装备记流水。**页面上每一个数都从 `goalSummary` 出**
 * （原因见 `goals.ts` 文件头），这一层只做三件事：算一遍、筛、把动作转给 store。
 *
 * 排序不给人拖：进行中在前、有期限的按近的在前。旧仓的拖拽 + 方向键换来一条看不见的
 * `sortOrder` 与一整块拖放代码，而目标的自然读法是「快要到期的、还差得多的先看」。
 */
const { goals, loadError, writeError, pending, flush, retry } = useGoals();
const { roster, update: updateCharacter, flush: flushRoster } = useRoster();

const today = useToday();

/* ---------- 汇总 ---------- */
const entries = computed(() =>
    goals.value.map((goal) => ({ goal, summary: goalSummary(goal, roster.value) })),
);
const ordered = computed(() => orderGoals(entries.value));

const active = computed(() => entries.value.filter((entry) => !entry.summary.done));
const doneEntries = computed(() => entries.value.filter((entry) => entry.summary.done));

/**
 * 最近的那个期限：只看「还没过期」的。
 *
 * 只算未过期的，是因为这一格回答的是「接下来该干什么」；过期的另有「逾期」那一格，
 * 两边混在一起会让「最近期限」永远显示一个负数。
 */
const nearest = computed(() => {
    let best: { title: string; days: number } | null = null;
    for (const { goal } of active.value) {
        const days = daysLeft(goal.deadline, today.value);
        if (days === null || days < 0) continue;
        if (!best || days < best.days) best = { title: goal.title, days };
    }
    return best;
});
const overdue = computed(
    () =>
        active.value.filter(({ goal }) => {
            const days = daysLeft(goal.deadline, today.value);
            return days !== null && days < 0;
        }).length,
);

/* ---------- 筛选 ---------- */
const ALL_WHO = '__all__';
const status = ref<'active' | 'done' | 'all'>('active');
const kind = ref<'' | GoalKind>('');
const who = ref(ALL_WHO);
const keyword = ref('');

const statusOptions = computed(() => [
    { value: 'active' as const, label: `进行中 ${active.value.length}` },
    { value: 'done' as const, label: `已达成 ${doneEntries.value.length}` },
    { value: 'all' as const, label: `全部 ${entries.value.length}` },
]);
const kindOptions = computed(() => [
    { value: '', label: '全部类型' },
    ...GOAL_KINDS.map((one) => ({ value: one.value, label: one.label })),
]);
const whoOptions = computed(() => [
    { value: ALL_WHO, label: '全部角色' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name || '未命名' })),
]);

const visible = computed(() => {
    const text = keyword.value.trim().toLocaleLowerCase();
    return ordered.value.filter(({ goal, summary }) => {
        if (status.value === 'active' && summary.done) return false;
        if (status.value === 'done' && !summary.done) return false;
        if (kind.value && goal.kind !== kind.value) return false;
        if (who.value !== ALL_WHO && !goal.members.some((one) => one.id === who.value))
            return false;
        if (!text) return true;
        const names = goal.members.map((one) => one.name).join(' ');
        return `${goal.title} ${goal.note} ${names}`.toLocaleLowerCase().includes(text);
    });
});

const filtered = computed(
    () => status.value !== 'active' || !!kind.value || who.value !== ALL_WHO || !!keyword.value,
);

/* ---------- 动作 ---------- */
const editing = ref<{ goal?: Goal } | null>(null);
/* 弹窗只记 id，目标本身从 store 现查。
 * 存整条对象的话，写回后外面那个对象就是旧的——流水窗里刚记的一笔不会出现在
 * 「当前 0 / 100 万」里，卡片却已经变了（第一次走查就是这么发现的）。 */
const growthId = ref('');
let growthVersion = 0;
const logsId = ref('');
const growth = computed(() => goals.value.find((one) => one.id === growthId.value) ?? null);
const logs = computed(() => goals.value.find((one) => one.id === logsId.value) ?? null);

function summaryOf(id: string): GoalSummary | null {
    const goal = goals.value.find((one) => one.id === id);
    return goal ? goalSummary(goal, roster.value) : null;
}

/**
 * 写入之后如果「刚达成」，多给一句回执，并**把它留在眼前**。
 *
 * 默认筛选是「进行中」，达成那一刻卡片会直接从列表里消失——用户刚记完最后一笔，
 * 看到的是一片空。所以顺手切到「全部」，让那枚章留在原地。
 */
function announce(before: GoalSummary | null, id: string) {
    const after = summaryOf(id);
    if (!after?.done || before?.done) return;
    notify.success('目标达成');
    if (status.value === 'active') status.value = 'all';
}

async function save(input: GoalInput) {
    if (pending.value > 0) return;
    const target = editing.value?.goal;
    const before = target ? summaryOf(target.id) : null;
    const result = target ? updateGoal(target.id, input) : addGoal(input);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    editing.value = { goal: result.goal };
    const source = editing.value;
    if (!(await saved(flush))) return;
    notify.success(target ? '已保存' : `已建「${result.goal.title}」`);
    if (editing.value === source) editing.value = null;
    announce(before, result.goal.id);
}

async function askRemove(goal: Goal) {
    const ok = await askConfirm({
        title: `删掉「${goal.title}」？`,
        note: goal.tracking
            ? '只是不再跟踪这一项，角色档案与其中的数值不受影响。'
            : `这条目标的 ${goal.logs.length} 笔流水会一起删掉，没法撤回。`,
        confirmText: '删除',
    });
    if (!ok) return;
    removeGoal(goal.id);
    if (await saved(flush)) notify.success('目标已删除');
}

async function record(log: { date: string; delta: number; note: string }) {
    const goal = logs.value;
    if (!goal) return;
    const before = summaryOf(goal.id);
    const result = addLog(goal.id, log);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flush)) announce(before, goal.id);
}

/** 装备目标的「买了一件」：不弹窗，直接记 +1——买完就完成，那一下不该穿过一张表单。 */
async function bought(goal: Goal) {
    const before = summaryOf(goal.id);
    const result = addLog(goal.id, { date: today.value, delta: 1, note: '买了一件' });
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (!(await saved(flush))) return;
    const after = summaryOf(goal.id);
    /* 中间那几下不弹回执：卡片上的读数就在点的那一下变，再弹三条「已记一件」
     * 只会盖住页头。只有「这一下把它记完了」值得说一句（`announce` 只管这一件事，
     * 顺手把筛选切到「全部」，否则达成的那一下卡片就地从列表里消失）。 */
    announce(before, goal.id);
    if (after?.done) logsId.value = '';
}

/** 批量写回角色档案。一次一个 `update`，每个都会落盘——量级是个位数，不必合批。 */
async function applyGrowth(values: { id: string; value: number }[]) {
    const version = growthVersion;
    const goal = growth.value;
    if (!goal?.tracking) return;
    const before = summaryOf(goal.id);
    for (const item of values) {
        const character = roster.value.find((one) => one.id === item.id);
        if (!character) continue;
        updateCharacter(applyMetric(character, goal.tracking, item.value));
    }
    if (!(await saved(flushRoster))) return;
    if (version === growthVersion && growthId.value === goal.id) growthId.value = '';
    announce(before, goal.id);
    notify.success(`已更新 ${values.length} 个角色`);
}

/** 删一笔流水。窗开着，删完留在窗里——用户常常是连着删两笔。 */
function dropLog(logId: string) {
    if (!logs.value) return;
    removeLog(logs.value.id, logId);
}

function onProgress(goal: Goal) {
    if (goal.tracking) {
        growthVersion += 1;
        growthId.value = goal.id;
    } else logsId.value = goal.id;
}
</script>

<template>
    <PageShell
        title="目标"
        :desc="
            goals.length
                ? `${active.length} 个进行中 · ${doneEntries.length} 个已达成`
                : '还没有目标 · 点右上角定一个'
        "
    >
        <template #actions>
            <PressButton icon="add" text="新建目标" label="新建目标" seal @click="editing = {}" />
        </template>

        <LedgerSection title="概览">
            <div class="strip">
                <div>
                    <span class="cap">进行中</span>
                    <b>{{ active.length }}</b>
                </div>
                <div>
                    <span class="cap">最近的期限</span>
                    <b class="num-val">{{ nearest ? `${nearest.days} 天` : '—' }}</b>
                    <small v-if="nearest">{{ nearest.title }}</small>
                </div>
                <div>
                    <span class="cap">逾期</span>
                    <b class="warn">{{ overdue }}</b>
                </div>
                <div>
                    <span class="cap">已达成</span>
                    <b>{{ doneEntries.length }}</b>
                </div>
            </div>
        </LedgerSection>

        <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />

        <div class="filters">
            <SegmentedPills v-model="status" :options="statusOptions" label="目标状态" />
            <SelectField v-model="kind" :options="kindOptions" label="目标类型" />
            <SelectField v-model="who" :options="whoOptions" label="按角色筛选" />
            <input
                v-model="keyword"
                class="field search"
                type="search"
                placeholder="搜目标、角色或备注"
                aria-label="搜索目标"
            />
        </div>

        <div v-if="!goals.length" class="empty">
            <p class="empty-title">定一个小目标</p>
            <PressButton icon="add" text="新建第一个目标" label="新建目标" @click="editing = {}" />
        </div>
        <div v-else-if="!visible.length" class="empty">
            <p class="empty-title">
                {{ filtered ? '没有符合条件的目标' : '进行中的都做完了' }}
            </p>
            <p v-if="!filtered" class="empty-text">已完成 {{ doneEntries.length }} 个目标</p>
            <PressButton
                v-if="!filtered"
                text="看已达成"
                label="切到已达成"
                @click="status = 'done'"
            />
        </div>
        <div v-else class="grid">
            <GoalCard
                v-for="entry in visible"
                :key="entry.goal.id"
                :goal="entry.goal"
                :summary="entry.summary"
                :today="today"
                @edit="editing = { goal: entry.goal }"
                @remove="askRemove(entry.goal)"
                @record="onProgress(entry.goal)"
                @growth="growthId = entry.goal.id"
                @logs="logsId = entry.goal.id"
                @bought="bought(entry.goal)"
            />
        </div>
    </PageShell>

    <GoalEditor v-if="editing" :goal="editing.goal" @save="save" @close="editing = null" />
    <GoalGrowth v-if="growth" :goal="growth" @save="applyGrowth" @close="growthId = ''" />
    <GoalLogs
        v-if="logs"
        :goal="logs"
        :summary="goalSummary(logs, roster)"
        @add="record"
        @remove="dropLog"
        @close="logsId = ''"
    />
</template>

<style scoped>
.strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 4px;
}
.strip > div {
    min-width: 0;
    padding: 0 14px;
}
.strip > div:first-child {
    padding-left: 0;
}
.strip > div + div {
    border-left: var(--w-hair) solid var(--rule);
}
.cap {
    display: block;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.strip b {
    display: block;
    margin-top: 1px;
    font-size: calc(var(--fs-base) * 1.24);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
}
.strip b.warn {
    color: var(--cinnabar);
}
.strip small {
    display: block;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-mini);
    white-space: nowrap;
    text-overflow: ellipsis;
}
.filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 12px 0;
}
.search {
    flex: 1;
    min-width: 160px;
    max-width: 260px;
}
.grid {
    display: grid;
    /* 两列：卡上要摆成员行，400 以下「曲阜 22 / 25 还差 3」会挤成一坨。 */
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 16px;
    align-items: stretch;
}
.empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 34px 0 40px;
}
.empty-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-md);
    letter-spacing: 0.04em;
}
.empty-text {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.7;
}
</style>
