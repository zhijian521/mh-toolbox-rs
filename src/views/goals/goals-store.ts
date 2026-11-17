/** 目标定义与流水的模块级状态；进度现算，加载与写队列共用 services。 */
import { readonly, ref } from 'vue';
import { readLocalData, writeLocalData, parseLocalList } from '../../services/local-data';
import { isDayText } from '../../services/format';
import { loadData } from '../../services/load-data';
import { goalLoad, goalSave } from '../../services/storage';
import { createPersist } from '../../services/persist';
import { makeId } from '../../services/shape';
import {
    goalTitle,
    METRIC_CATEGORIES,
    metricUnit,
    manualProgress,
    parseGoals,
    parseGoalItems,
    type Goal,
    type ReadonlyGoal,
    type GoalKind,
    type GoalMember,
    type GoalTracking,
    type GoalItem,
} from './goals';

/** 浏览器预览（探针 / `npm run dev`）那一版存在这里；桌面版走 SQLite，两者各自独立。 */
const STORAGE_KEY = 'mh-goals';

const goals = ref<Goal[]>([]);

/** 最近一次落盘失败的原因。写着「已记上」但其实是空的，比报错更糟。 */
const writeError = ref('');

/** 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。 */
const loadError = ref('');

/** 当前数据已成功加载；读取中或失败时保持不可写。 */
const loaded = ref(false);

const persist = createPersist({
    label: '目标',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, goals.value),
    writeRemote: () => goalSave(goals.value),
});

/** 启动阶段读取，完成前由写队列阻止保存；旧版转换统一在启动导入入口处理。 */
export async function loadGoals(): Promise<void> {
    await loadData({
        loaded,
        loadError,
        error: '读不出目标，已暂停写入以免覆盖原有数据',
        readLocal: () => readLocalData(STORAGE_KEY, (raw) => parseLocalList(raw, parseGoals)),
        readRemote: goalLoad,
        applyLocal: (stored) => {
            goals.value = stored ?? [];
        },
        applyRemote: (stored) => {
            goals.value = parseGoals(stored);
        },
    });
}

/* ---------- 改 ---------- */

export interface GoalInput {
    kind: GoalKind;
    /** 空串 = 用自动标题。 */
    title: string;
    /** 快照成员。新建时由页面按名册抄一份传进来。 */
    members: GoalMember[];
    target: number;
    unit: string;
    tracking: GoalTracking | null;
    items?: GoalItem[];
    deadline: string;
    note: string;
}

export type GoalWrite = { ok: true; goal: ReadonlyGoal } | { ok: false; error: string };

function check(input: GoalInput): { ok: true; unit: string } | { ok: false; error: string } {
    if (!input.members.length || input.members.some((member) => !member.id.trim()))
        return { ok: false, error: '选至少一个角色' };
    if (input.kind !== 'combo' && (!Number.isFinite(input.target) || input.target <= 0)) {
        return { ok: false, error: '目标值要大于 0' };
    }
    if (input.deadline && !isDayText(input.deadline)) {
        return { ok: false, error: '选择有效的截止日期' };
    }
    if (input.kind === 'combo') {
        if (!parseGoalItems(input.items, input.members))
            return { ok: false, error: '每个角色至少添加一项，目标为正整数，同一项目不能重复' };
        return { ok: true, unit: '项' };
    }
    if (input.kind === 'growth') {
        if (!input.tracking) return { ok: false, error: '选一个跟着走的项目' };
        if (
            !METRIC_CATEGORIES.some((row) => row.value === input.tracking?.category) ||
            !input.tracking.key.trim()
        )
            return { ok: false, error: '选择有效的养成项目' };
        /* 养成项目的值都是整数（级、点）。允许小数会让「到 25.5 级」成为一个永远
         * 达标不了的目标——游戏里没有半个等级。 */
        if (!Number.isSafeInteger(input.target)) return { ok: false, error: '养成目标要填整数' };
        return { ok: true, unit: metricUnit(input.tracking) };
    }
    /* 装备按件数：目标也是整数。存钱可以是 0.5 万。 */
    if (input.kind === 'gear' && !Number.isSafeInteger(input.target)) {
        return { ok: false, error: '件数要填整数' };
    }
    if (!input.unit.trim()) return { ok: false, error: '填一个单位' };
    return { ok: true, unit: input.kind === 'gear' ? '件' : input.unit.trim() };
}

function compose(
    input: GoalInput,
    unit: string,
    id: string,
    createdAt: number,
    logs: Goal['logs'],
): Goal {
    const base = {
        id,
        kind: input.kind,
        members: input.members
            .filter(
                (member, index, all) =>
                    member.id && all.findIndex((row) => row.id === member.id) === index,
            )
            .map((member) => ({ ...member })),
        target: input.kind === 'combo' ? 0 : input.target,
        unit,
        tracking: input.kind === 'growth' && input.tracking ? { ...input.tracking } : null,
        ...(input.kind === 'combo'
            ? { items: parseGoalItems(input.items, input.members)!, comboVersion: 1 as const }
            : {}),
        deadline: input.deadline,
        note: input.note.trim(),
        logs,
        createdAt,
    };
    return { ...base, title: goalTitle({ ...base, title: input.title }) };
}

export function addGoal(input: GoalInput): GoalWrite {
    if (!persist.canWrite()) return { ok: false, error: '目标读取失败，先修好再来建' };
    const checked = check(input);
    if (!checked.ok) return checked;
    const goal = compose(input, checked.unit, makeId('goal'), Date.now(), []);
    goals.value = [...goals.value, goal];
    persist();
    return { ok: true, goal: readonly(goal) };
}

/**
 * 改一条。**保留流水与创建时间**：改的是「许了什么」，不是「走过什么」。
 *
 * 换掉 `createdAt` 会让「都没期限」的目标在列表里重新排队；清掉流水则是把已经
 * 攒下的进度一起抹了——用户只想去改个标题。
 */
export function updateGoal(id: string, input: GoalInput): GoalWrite {
    if (!persist.canWrite()) return { ok: false, error: '目标读取失败，先修好再来改' };
    const before = goals.value.find((one) => one.id === id);
    if (!before) return { ok: false, error: '这个目标已经不在了' };
    if (input.kind !== before.kind || (before.logs.length && input.unit !== before.unit))
        return { ok: false, error: '已有目标不能更换类型，有记录后不能更换单位' };
    const checked = check(input);
    if (!checked.ok) return checked;
    const goal = compose(input, checked.unit, id, before.createdAt, before.logs);
    goals.value = goals.value.map((one) => (one.id === id ? goal : one));
    persist();
    return { ok: true, goal: readonly(goal) };
}

export function removeGoal(id: string): void {
    if (!persist.canWrite()) return;
    const before = goals.value.length;
    goals.value = goals.value.filter((one) => one.id !== id);
    if (goals.value.length !== before) persist();
}

/* ---------- 流水（手动目标） ---------- */

export interface LogInput {
    date: string;
    delta: number;
    note: string;
}

export type LogWrite = { ok: true; goal: ReadonlyGoal } | { ok: false; error: string };

/**
 * 记一笔。**记增量，不记累计**——累计由 `goalSummary` 加出来。
 *
 * 编辑一笔历史走「删了重记」：一条流水只有三个字段，改一个要另开一套「按 id 定位 →
 * 保留 createdAt → 重算」的路径，而那条路径正是最容易出现「改完累计没跟上」的地方。
 */
export function addLog(id: string, input: LogInput): LogWrite {
    if (!persist.canWrite()) return { ok: false, error: '目标读取失败，先修好再来记' };
    const goal = goals.value.find((one) => one.id === id);
    if (!goal) return { ok: false, error: '这个目标已经不在了' };
    if (goal.tracking || goal.kind === 'combo')
        return { ok: false, error: '养成目标跟着角色档案走，去「更新养成」里改' };
    if (!isDayText(input.date)) return { ok: false, error: '选一个有效日期' };
    if (!Number.isFinite(input.delta) || input.delta === 0) {
        return { ok: false, error: '填一个不为 0 的变化量' };
    }
    if (goal.kind === 'gear' && !Number.isSafeInteger(input.delta))
        return { ok: false, error: '件数要填整数' };

    /* 累计最低到 0：再减下去只是在记「欠了多少」，而目标问的是「攒了多少」。
     * 夹的是这一笔的增量，不是累计值——夹累计值会让「删了最后一笔」算不回去。 */
    const current = manualProgress(goal.logs);
    const delta = Math.max(-current, input.delta);
    if (delta === 0) return { ok: false, error: '已经到 0 了，减不动' };

    const log = {
        id: makeId('gl'),
        date: input.date,
        delta,
        note: input.note.trim(),
        createdAt: Date.now(),
    };
    const next: Goal = { ...goal, logs: [...goal.logs, log] };
    goals.value = goals.value.map((one) => (one.id === id ? next : one));
    persist();
    return { ok: true, goal: readonly(next) };
}

export function removeLog(id: string, logId: string): void {
    if (!persist.canWrite()) return;
    const goal = goals.value.find((one) => one.id === id);
    if (!goal) return;
    const next: Goal = { ...goal, logs: goal.logs.filter((log) => log.id !== logId) };
    goals.value = goals.value.map((one) => (one.id === id ? next : one));
    persist();
}

/* ---------- 给页面 ---------- */

export function useGoals() {
    return {
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        goals: readonly(goals),
        loadError,
        writeError,
        addGoal,
        updateGoal,
        removeGoal,
        addLog,
        removeLog,
    };
}

/** 某个角色被哪些目标引用（快照里有他）。删角色前要拿这个数去提示。 */
export function goalsOfCharacter(id: string): readonly ReadonlyGoal[] {
    return readonly(goals.value.filter((goal) => goal.members.some((member) => member.id === id)));
}

/** 单位候选。装备固定「件」，养成跟项目走，只有存钱要用户挑（元 / 万）。 */
export const MONEY_UNITS = ['万', '元'];
