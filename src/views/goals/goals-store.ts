/**
 * 目标的**持有者**：模块级单例 + 写入即落盘。
 *
 * 与 `roster.ts` / `accounts-store.ts` 同一套写法：规则在 `goals.ts`（纯函数、可单测），
 * 这里只做四件事——读、改、写、把「改不成」的原因交回去。「怎么安全地写下去」那一整套
 * 在 `services/persist.ts`，四个数据层共用一份。
 *
 * ---- 为什么整份读写 ----
 * 目标的量级是「一年十几个」，一次改动整份写回的代价可以忽略，换来的是「不会出现
 * 界面有、库里没有」。分条写要处理「插入失败但界面已经加了」的补偿，而那套补偿本身
 * 就是新的 bug 来源。
 */
import { ref } from 'vue';
import { hasDesktop } from '../../services/desktop';
import { goalLoad, goalSave } from '../../services/storage';
import { createPersist } from '../../services/persist';
import { makeId } from '../../services/shape';
import {
    goalTitle,
    parseGoals,
    type Goal,
    type GoalKind,
    type GoalMember,
    type GoalTracking,
} from './goals';

/** 浏览器预览（探针 / `npm run dev`）那一版存在这里；桌面版走 SQLite，两者各自独立。 */
const STORAGE_KEY = 'mh-goals';

const goals = ref<Goal[]>([]);

/** 最近一次落盘失败的原因。写着「已记上」但其实是空的，比报错更糟。 */
const writeError = ref('');

/** 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。 */
const loadError = ref('');

/** 读过一轮没有。`persist` 靠它挡住「还没读库就整份覆盖」（见 `services/persist.ts`）。 */
const loaded = ref(false);

const persist = createPersist({
    label: '目标',
    loadError,
    loaded,
    writeError,
    writeLocal: () => {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(goals.value));
        } catch (error) {
            console.error('目标写不进 localStorage', error);
            writeError.value = '这个目标没存下来，检查一下浏览器存储空间';
        }
    },
    writeRemote: () => goalSave(goals.value),
});

/**
 * 读档。**只能调一次，且在 mount 之前**（与其余四个 store 同一个位置，见 `main.ts`）。
 *
 * 目标页是第 115 批才有的功能，没有更早的存档要搬——不做 legacy 迁移。
 */
export async function loadGoals(): Promise<void> {
    if (!hasDesktop()) {
        if (typeof localStorage === 'undefined') return;
        /* 「没存过」是空表，是结论而不是失败——照样算读过。 */
        loaded.value = true;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            goals.value = parseGoals(JSON.parse(raw));
        } catch {
            console.error('浏览器里的目标读不懂，保留空表');
        }
        return;
    }

    const stored = await goalLoad();
    /* 读失败**不是空表**。先拿原始结果再分支，就是为了让 `null` 这个信号走到错误位；
     * 写成 `stored ?? []` 就把它抹掉了，后果是「用户随手改一个目标，其余全被清空」。 */
    if (stored === null) {
        loadError.value = '读不出目标，已暂停写入以免覆盖原有数据';
        goals.value = [];
        return;
    }
    loadError.value = '';
    loaded.value = true;
    goals.value = parseGoals(stored);
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
    deadline: string;
    note: string;
}

export type GoalWrite = { ok: true; goal: Goal } | { ok: false; error: string };

function check(input: GoalInput): { ok: true; unit: string } | { ok: false; error: string } {
    if (!input.members.length) return { ok: false, error: '选至少一个角色' };
    if (!Number.isFinite(input.target) || input.target <= 0) {
        return { ok: false, error: '目标值要大于 0' };
    }
    if (input.kind === 'growth') {
        if (!input.tracking) return { ok: false, error: '选一个跟着走的项目' };
        /* 养成项目的值都是整数（级、点）。允许小数会让「到 25.5 级」成为一个永远
         * 达标不了的目标——游戏里没有半个等级。 */
        if (!Number.isSafeInteger(input.target)) return { ok: false, error: '养成目标要填整数' };
        return { ok: true, unit: input.unit };
    }
    /* 装备按件数：目标也是整数。存钱可以是 0.5 万。 */
    if (input.kind === 'gear' && !Number.isSafeInteger(input.target)) {
        return { ok: false, error: '件数要填整数' };
    }
    if (!input.unit.trim()) return { ok: false, error: '填一个单位' };
    return { ok: true, unit: input.unit.trim() };
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
        members: input.members,
        target: input.target,
        unit,
        tracking: input.kind === 'growth' ? input.tracking : null,
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
    return { ok: true, goal };
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
    const checked = check(input);
    if (!checked.ok) return checked;
    const goal = compose(input, checked.unit, id, before.createdAt, before.logs);
    goals.value = goals.value.map((one) => (one.id === id ? goal : one));
    persist();
    return { ok: true, goal };
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

export type LogWrite = { ok: true; goal: Goal } | { ok: false; error: string };

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
    if (goal.tracking) return { ok: false, error: '养成目标跟着角色档案走，去「更新养成」里改' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: '选一个有效日期' };
    if (!Number.isFinite(input.delta) || input.delta === 0) {
        return { ok: false, error: '填一个不为 0 的变化量' };
    }

    /* 累计最低到 0：再减下去只是在记「欠了多少」，而目标问的是「攒了多少」。
     * 夹的是这一笔的增量，不是累计值——夹累计值会让「删了最后一笔」算不回去。 */
    const current = Math.max(
        0,
        goal.logs.reduce((sum, log) => sum + log.delta, 0),
    );
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
    return { ok: true, goal: next };
}

export function removeLog(id: string, logId: string): void {
    if (!persist.canWrite()) return;
    const goal = goals.value.find((one) => one.id === id);
    if (!goal) return;
    const next: Goal = { ...goal, logs: goal.logs.filter((log) => log.id !== logId) };
    goals.value = goals.value.map((one) => (one.id === id ? next : one));
    persist();
}

/** 新建时按「全部角色 / 单个角色」抄一份成员快照。名字一起抄（理由见 `goals.ts` 文件头）。 */
export function snapshotMembers(
    roster: { id: string; name: string }[],
    characterId: string,
): GoalMember[] {
    const picked = characterId ? roster.filter((one) => one.id === characterId) : roster;
    return picked.map((one) => ({ id: one.id, name: one.name || '未命名' }));
}

/* ---------- 给页面 ---------- */

export function useGoals() {
    return {
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        goals,
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
export function goalsOfCharacter(id: string): Goal[] {
    return goals.value.filter((goal) => goal.members.some((member) => member.id === id));
}

/** 单位候选。装备固定「件」，养成跟项目走，只有存钱要用户挑（元 / 万）。 */
export const MONEY_UNITS = ['万', '元'];
