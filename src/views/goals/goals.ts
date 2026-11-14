import { isDayText } from '../../services/format';
/**
 * 目标页的**规则**：类型、可跟踪的指标、汇总口径、归一与排序。
 *
 * 与 `income.ts` / `accounts.ts` / `prices.ts` 同一种分工：这一层是纯函数、能单测；
 * `goals-store.ts` 只管读写；`.vue` 只管摆。**卡片上的每一个数都从 `goalSummary` 出**，
 * 页面不重算——两处各算一遍，迟早出现「卡片说 71%、成员行加起来是 5/7」那种对不上。
 *
 * ---- 两种算法 ----
 * 养成目标跟着角色档案走（每次打开现算），存钱与装备手记流水（累加）。
 * 用户 2026-11-05 定：**存钱先不接账号账本**——账本记的是钱包进出，目标问的是
 * 「攒够了没有」，口径没对齐之前硬接，会把充值也算成进度。
 *
 * ---- 状态是推出来的 ----
 * `current >= target` 即达成（装备买够件数就是完成），删掉最后一笔就回到进行中。
 * 不存 `status` / `doneAt`：多一个可写字段，就多一条能被写坏的状态。
 *
 * ---- 「全部角色」是快照 ----
 * 建目标那一刻把 `{id, name}` 抄进 `members`（用户 2026-11-05 定）。后加的人不该让一个
 * 已达成的目标退回 99%；名字一起抄，是因为人删掉之后那行还得读得出是谁。
 * 删掉的角色**不计入分母**——分母里留一个永远补不上的人，目标永远到不了 100%。
 */
import type { IconName } from '../../components/icons';
import { ATTR_GROUPS, TRAINING_GROUPS, type CharacterData } from '../characters/character';
import { lifeSkills, storySkills, schoolSkillCap } from '../../services/game-data';
import { schoolSkillNames } from '../characters/schools';

/* ======================================================================
 * 类型
 * ==================================================================== */

export type GoalKind = 'money' | 'gear' | 'growth' | 'manual';

export const GOAL_KINDS: { value: GoalKind; label: string; icon: IconName; unit: string }[] = [
    /* 顺序即新建弹窗里胶囊的顺序：养成在最前，因为它是唯一会自动跑的。 */
    { value: 'growth', label: '养成', icon: 'growth', unit: '级' },
    { value: 'money', label: '存钱', icon: 'coins', unit: '万' },
    { value: 'gear', label: '装备', icon: 'sword', unit: '件' },
    { value: 'manual', label: '手动', icon: 'edit', unit: '级' },
];

export function kindMeta(kind: GoalKind) {
    return GOAL_KINDS.find((one) => one.value === kind) ?? GOAL_KINDS[0];
}

/** 存档中的指标分类；界面的选择目录可进一步分组。 */
export type MetricCategory = 'skill' | 'assist' | 'training' | 'attr' | 'level';

export const METRIC_CATEGORIES: { value: MetricCategory; label: string; unit: string }[] = [
    { value: 'level', label: '角色等级', unit: '级' },
    { value: 'skill', label: '门派技能', unit: '级' },
    { value: 'assist', label: '辅助技能', unit: '级' },
    { value: 'training', label: '修炼', unit: '级' },
    { value: 'attr', label: '属性', unit: '点' },
];

export interface GoalTracking {
    category: MetricCategory;
    /** 项目名。门派/辅助技能是技能名，修炼是修炼项名，属性是属性行名。 */
    key: string;
}

/** 只细分选择目录，已有目标仍用同一份 category / key 存档。 */
export const METRIC_GROUPS = [
    { value: 'training', label: '人物修炼', category: 'training' },
    { value: 'pet-training', label: '召唤兽修炼', category: 'training' },
    { value: 'skill', label: '师门技能', category: 'skill' },
    { value: 'life', label: '生活技能', category: 'assist' },
    { value: 'story', label: '剧情技能', category: 'assist' },
    { value: 'attr', label: '角色属性', category: 'attr' },
    { value: 'level', label: '角色等级', category: 'level' },
    { value: 'potential', label: '乾元丹 / 潜能果', category: 'attr' },
] as const;
export type MetricGroup = (typeof METRIC_GROUPS)[number]['value'];

export function metricGroup(tracking: GoalTracking): MetricGroup {
    if (tracking.category === 'training')
        return TRAINING_GROUPS[1]?.rows.some((row) => row.name === tracking.key)
            ? 'pet-training'
            : 'training';
    if (tracking.category === 'assist')
        return storySkills().includes(tracking.key) ? 'story' : 'life';
    if (tracking.category === 'attr')
        return ['乾元丹', '潜能果'].includes(tracking.key) ? 'potential' : 'attr';
    return tracking.category;
}

export function groupKeys(group: MetricGroup, characters: CharacterData[]): string[] {
    if (group === 'level') return ['角色等级'];
    if (group === 'training' || group === 'pet-training')
        return TRAINING_GROUPS[group === 'training' ? 0 : 1]?.rows.map((row) => row.name) ?? [];
    if (group === 'potential') return ['乾元丹', '潜能果'];
    if (group === 'attr')
        return metricKeys('attr', characters).filter((key) => !['乾元丹', '潜能果'].includes(key));
    if (group === 'skill') return metricKeys('skill', characters);
    const names = group === 'life' ? lifeSkills() : storySkills();
    return [
        ...new Set([
            ...names,
            ...characters.flatMap((character) =>
                character.assists.filter((row) => row.kind === group).map((row) => row.name),
            ),
        ]),
    ];
}

export function metricUnit(tracking: GoalTracking): string {
    if (tracking.category === 'attr')
        return ['乾元丹', '潜能果'].includes(tracking.key) ? '个' : '点';
    return '级';
}

export function metricApplicable(character: CharacterData, tracking: GoalTracking): boolean {
    if (tracking.category !== 'skill') return true;
    const names = schoolSkillNames(character.school);
    return names
        ? names.includes(tracking.key)
        : character.skills.some((row) => row.name === tracking.key);
}

/** 快照成员。`name` 是建目标那一刻的抄本，角色删掉之后仍要能显示。 */
export interface GoalMember {
    id: string;
    name: string;
}

export interface GoalLog {
    id: string;
    /** `YYYY-MM-DD`。 */
    date: string;
    /** 增量，可为负。 */
    delta: number;
    note: string;
    createdAt: number;
}

export interface Goal {
    id: string;
    kind: GoalKind;
    /** 空串 = 用自动标题（`goalTitle`）。存下来的是**解析后**的完整标题。 */
    title: string;
    members: GoalMember[];
    /** 养成：每个角色的目标值；手动：累计目标。 */
    target: number;
    unit: string;
    tracking: GoalTracking | null;
    deadline: string;
    note: string;
    logs: GoalLog[];
    createdAt: number;
}

/* ======================================================================
 * 指标取值
 * ==================================================================== */

/** 属性值是文本（`3,906`、`1,240`），认不出来时返回 null，不拿猜出来的数去算进度。 */
function toNumber(text: string): number | null {
    const cleaned = text.replace(/[,，\s]/g, '');
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
}

/**
 * 某个角色在某个项目上的当前值。
 *
 * 返回 `null` 表示**未记录**（这一项不在这个号的档案里），与「记了一个 0」是两件事：
 * 前者在卡片上显示「待补录」、仍计入分母；后者是实实在在的 0，算「还差 N」。
 */
export function metricValue(character: CharacterData, tracking: GoalTracking): number | null {
    const { category, key } = tracking;
    if (category === 'level') return character.level;
    if (category === 'skill') {
        const row = character.skills.find((one) => one.name === key);
        /* `off` 是「未学」——它在游戏里就是 0 级，不是「没填」。 */
        return row ? (row.off ? 0 : row.level) : null;
    }
    if (category === 'assist') {
        const row = character.assists.find((one) => one.name === key);
        return row ? (row.off ? 0 : row.level) : null;
    }
    if (category === 'training') {
        for (const group of character.trainings) {
            const row = group.rows.find((one) => one.name === key);
            if (row) return row.level;
        }
        return null;
    }
    for (const group of character.attrGroups) {
        const row = group.rows.find((one) => one.label === key);
        if (row) return toNumber(row.value);
    }
    return null;
}

/**
 * 某一分类下可选的项目名。
 *
 * 师门合并所选门派与已录技能；辅助合并完整名录与已录技能，未学项目也能建目标。
 */
export function metricKeys(category: MetricCategory, characters: CharacterData[]): string[] {
    if (category === 'level') return ['角色等级'];
    if (category === 'training')
        return TRAINING_GROUPS.flatMap((group) => group.rows.map((r) => r.name));
    if (category === 'attr') return ATTR_GROUPS.flatMap((group) => [...group.labels]);
    const names: string[] = [];
    for (const character of characters) {
        const list = category === 'skill' ? character.skills : character.assists;
        for (const row of list) if (!names.includes(row.name)) names.push(row.name);
        if (category === 'skill')
            for (const name of schoolSkillNames(character.school) ?? [])
                if (!names.includes(name)) names.push(name);
    }
    return category === 'assist'
        ? [...new Set([...lifeSkills(), ...storySkills(), ...names])]
        : names;
}

/** 把某个角色的某个项目改成 `value`，返回**新的**角色对象（不改原对象）。 */
export function applyMetric(
    character: CharacterData,
    tracking: GoalTracking,
    value: number,
): CharacterData {
    const { category, key } = tracking;
    if (!Number.isSafeInteger(value) || value < 0 || !metricApplicable(character, tracking))
        return character;
    if (category === 'level') return { ...character, level: value };
    if (category === 'skill') {
        return {
            ...character,
            skills: character.skills.some((row) => row.name === key)
                ? character.skills.map((row) =>
                      row.name === key ? { ...row, level: value, off: false } : row,
                  )
                : [...character.skills, { name: key, level: value, cap: schoolSkillCap() }],
        };
    }
    if (category === 'assist') {
        return {
            ...character,
            assists: character.assists.some((row) => row.name === key)
                ? character.assists.map((row) =>
                      row.name === key ? { ...row, level: value, off: false } : row,
                  )
                : [
                      ...character.assists,
                      {
                          name: key,
                          level: value,
                          kind: storySkills().includes(key) ? 'story' : 'life',
                      },
                  ],
        };
    }
    if (category === 'training') {
        const definition = TRAINING_GROUPS.find((group) =>
            group.rows.some((row) => row.name === key),
        );
        if (!definition) return character;
        const found = character.trainings.some((group) =>
            group.rows.some((row) => row.name === key),
        );
        if (!found) {
            const groups = character.trainings.some((group) => group.title === definition.title)
                ? character.trainings.map((group) =>
                      group.title === definition.title
                          ? { ...group, rows: [...group.rows, { name: key, level: value }] }
                          : group,
                  )
                : [
                      ...character.trainings,
                      { title: definition.title, rows: [{ name: key, level: value }] },
                  ];
            return { ...character, trainings: groups };
        }
        return {
            ...character,
            trainings: character.trainings.map((group) => ({
                ...group,
                rows: group.rows.map((row) => (row.name === key ? { ...row, level: value } : row)),
            })),
        };
    }
    const definition = ATTR_GROUPS.find((group) => group.labels.includes(key));
    if (!definition) return character;
    if (!character.attrGroups.some((group) => group.rows.some((row) => row.label === key))) {
        const groups = character.attrGroups.some((group) => group.title === definition.title)
            ? character.attrGroups.map((group) =>
                  group.title === definition.title
                      ? { ...group, rows: [...group.rows, { label: key, value: String(value) }] }
                      : group,
              )
            : [
                  ...character.attrGroups,
                  { title: definition.title, rows: [{ label: key, value: String(value) }] },
              ];
        return { ...character, attrGroups: groups };
    }
    return {
        ...character,
        attrGroups: character.attrGroups.map((group) => ({
            ...group,
            rows: group.rows.map((row) =>
                row.label === key ? { ...row, value: String(value) } : row,
            ),
        })),
    };
}

/* ======================================================================
 * 汇总
 * ==================================================================== */

export interface GoalRow {
    id: string;
    name: string;
    /** 名册里还找得到这个人没有。删掉之后行留着、灰着、不计入分母。 */
    exists: boolean;
    applicable: boolean;
    value: number | null;
    done: boolean;
    remaining: number | null;
}

export interface GoalSummary {
    /** 手动：累计值；养成：各成员封顶后的和（只算在册成员）。 */
    current: number;
    /** 分母。养成 = 每个角色的目标 × 在册成员数；手动 = 目标值。 */
    total: number;
    pct: number;
    done: boolean;
    /** 养成：达标人数。 */
    achieved: number;
    /** 在册成员数（分母里的那个数）。 */
    totalMembers: number;
    /** 未记录的成员数。 */
    unknown: number;
    rows: GoalRow[];
    /** 手动目标的达成日期：累计首次到线的那笔流水的日期。养成目标没有。 */
    doneDate: string;
}

/** 消除两位小数连续加减时的浮点尾差，不把 0.3 − 0.1 判成尚未达到 0.2。 */
function addProgress(current: number, delta: number): number {
    return Number((current + delta).toFixed(8));
}

export function manualProgress(logs: GoalLog[]): number {
    return Math.max(
        0,
        logs.reduce((current, log) => addProgress(current, log.delta), 0),
    );
}

/**
 * 一份汇总，页面上的所有数都从它出。
 *
 * **超额封顶**：`current += min(target, value)`。一个号练到 40 不能替另一个号的 10 抵账——
 * 那是把「不同的人」加成一个数，而目标问的是「每个人到没到」。
 *
 * **未达成最多 99%**：只有全员达标才给 100。差一个人也是 99，条形与数字说同一句话。
 */
export function goalSummary(goal: Goal, roster: CharacterData[]): GoalSummary {
    const byId = new Map(roster.map((one) => [one.id, one]));
    const rows: GoalRow[] = goal.members.map((member) => {
        const character = byId.get(member.id);
        if (!character || !goal.tracking) {
            return {
                id: member.id,
                name: member.name,
                exists: !!character,
                applicable: false,
                value: null,
                done: false,
                remaining: null,
            };
        }
        const value = metricValue(character, goal.tracking);
        return {
            id: member.id,
            name: character.name || member.name,
            exists: true,
            applicable: metricApplicable(character, goal.tracking),
            value,
            done: value !== null && value >= goal.target,
            remaining: value === null ? null : Math.max(0, goal.target - value),
        };
    });

    if (!goal.tracking) {
        const current = manualProgress(goal.logs);
        const total = goal.target;
        const done = total > 0 && current >= total;
        return {
            current,
            total,
            pct: total > 0 ? Math.min(done ? 100 : 99, Math.round((current / total) * 100)) : 0,
            done,
            achieved: 0,
            totalMembers: rows.filter((row) => row.exists).length,
            unknown: 0,
            rows,
            doneDate: done ? firstDateReaching(goal.logs, total) : '',
        };
    }

    /* 分母只数在册成员：删掉的人留在卡片上是为了「知道少的是谁」，不是为了让他一直欠着。 */
    const live = rows.filter((row) => row.exists && row.applicable);
    const achieved = live.filter((row) => row.done).length;
    const unknown = live.filter((row) => row.value === null).length;
    const current = live.reduce((sum, row) => sum + Math.min(goal.target, row.value ?? 0), 0);
    const total = goal.target * live.length;
    const done = live.length > 0 && achieved === live.length;
    return {
        current,
        total,
        pct: total > 0 ? Math.min(done ? 100 : 99, Math.round((current / total) * 100)) : 0,
        done,
        achieved,
        totalMembers: live.length,
        unknown,
        rows,
        doneDate: '',
    };
}

/** 按日期累加，找出第一次达到目标的那天。同一笔也算。 */
function firstDateReaching(logs: GoalLog[], target: number): string {
    const ordered = [...logs].sort((a, b) =>
        a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
    );
    let sum = 0;
    for (const log of ordered) {
        sum = addProgress(sum, log.delta);
        if (sum >= target) return log.date;
    }
    return '';
}

/* ======================================================================
 * 展示
 * ==================================================================== */

/** 范围文案。快照几个就写几个——「全部角色」四个字在加过人之后就是假的。 */
export function scopeText(goal: Goal): string {
    if (goal.members.length === 1) return goal.members[0].name || '一个角色';
    return `${goal.members.length} 个角色`;
}

export function sourceText(goal: Goal): string {
    return goal.tracking ? '跟随档案' : '手动累计';
}

/** 自动标题：谁 + 什么 + 到多少。与卡片抬头同一个来源，两处不会各写一遍。 */
export function autoTitle(goal: Omit<Goal, 'title'>): string {
    const scope =
        goal.members.length === 1
            ? goal.members[0].name || '一个角色'
            : `${goal.members.length} 个角色`;
    if (goal.tracking) return `${scope} · ${goal.tracking.key} 到 ${goal.target}${goal.unit}`;
    if (goal.kind === 'gear') return `${scope} · 买满 ${goal.target} 件装备`;
    if (goal.kind === 'manual') return `${scope} · 累计 ${goal.target} ${goal.unit}`;
    return `${scope} · 攒到 ${goal.target} ${goal.unit}`;
}

/** 标题为空时用自动标题。存下来的是解析后的完整标题，卡片不必再判一次。 */
export function goalTitle(goal: Omit<Goal, 'title'> & { title?: string }): string {
    return (goal.title ?? '').trim() || autoTitle(goal);
}

export function signedText(delta: number, unit: string): string {
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    return `${sign}${Math.abs(delta).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

/**
 * 排序：进行中在前；同组内有期限的在前、近的在前；都没期限的按建的时间。
 *
 * 没有手动排序。旧仓那套拖拽 + 方向键换来的是「顺序会被记住」，代价是一条看不见的
 * `sortOrder` 与一整块拖拽代码；而目标页的自然读法是「快到期/还差的先看」。
 */
export function orderGoals(entries: { goal: Goal; summary: GoalSummary }[]): {
    goal: Goal;
    summary: GoalSummary;
}[] {
    return [...entries].sort((a, b) => {
        if (a.summary.done !== b.summary.done) return a.summary.done ? 1 : -1;
        const left = a.goal.deadline;
        const right = b.goal.deadline;
        if (!!left !== !!right) return left ? -1 : 1;
        if (left && right && left !== right) return left < right ? -1 : 1;
        return a.goal.createdAt - b.goal.createdAt;
    });
}

/** 距期限还有几天。空期限返回 null；负数表示已逾期。 */
export function daysLeft(deadline: string, now: string): number | null {
    if (!deadline) return null;
    const [y, m, d] = deadline.split('-').map(Number);
    const [ny, nm, nd] = now.split('-').map(Number);
    const then = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    const today = Date.UTC(ny, (nm ?? 1) - 1, nd ?? 1);
    return Math.round((then - today) / 86_400_000);
}

export function deadlineText(deadline: string, now: string, done: boolean): string {
    if (done) return '';
    const days = daysLeft(deadline, now);
    if (days === null) return '';
    if (days < 0) return `已逾期 ${-days} 天`;
    if (days === 0) return '今天到期';
    return `剩 ${days} 天`;
}

/* ======================================================================
 * 归一
 * ==================================================================== */

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function parseLog(raw: unknown): GoalLog | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;
    if (typeof one.id !== 'string' || !one.id) return null;
    if (typeof one.date !== 'string' || !isDayText(one.date)) return null;
    if (!isFiniteNumber(one.delta) || one.delta === 0) return null;
    return {
        id: one.id,
        date: one.date,
        delta: one.delta,
        note: typeof one.note === 'string' ? one.note : '',
        createdAt: isFiniteNumber(one.createdAt) ? one.createdAt : 0,
    };
}

function parseTracking(raw: unknown): GoalTracking | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;
    if (typeof one.category !== 'string') return null;
    if (!METRIC_CATEGORIES.some((item) => item.value === one.category)) return null;
    if (typeof one.key !== 'string' || !one.key.trim()) return null;
    return { category: one.category as MetricCategory, key: one.key.trim() };
}

/** 一条目标。读不懂就整条丢掉——比「读成半条」好，半条会算出一个错的进度。 */
export function parseGoal(raw: unknown): Goal | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;
    if (typeof one.id !== 'string' || !one.id) return null;
    const kind = GOAL_KINDS.find((item) => item.value === one.kind)?.value;
    if (!kind) return null;
    if (!isFiniteNumber(one.target) || one.target <= 0) return null;

    const parsedMembers: GoalMember[] = Array.isArray(one.members)
        ? one.members
              .map((member) => {
                  if (!member || typeof member !== 'object') return null;
                  const item = member as Record<string, unknown>;
                  if (typeof item.id !== 'string' || !item.id) return null;
                  return { id: item.id, name: typeof item.name === 'string' ? item.name : '' };
              })
              .filter((member): member is GoalMember => member !== null)
        : [];
    const members = parsedMembers.filter(
        (member, index) => parsedMembers.findIndex((row) => row.id === member.id) === index,
    );
    if (!members.length) return null;

    const tracking = kind === 'growth' ? parseTracking(one.tracking) : null;
    /* 养成读档案；未建档的养成使用独立的手动类型，不混算。 */
    if (kind === 'growth' && !tracking) return null;

    const logs = Array.isArray(one.logs)
        ? one.logs.map(parseLog).filter((log): log is GoalLog => log !== null)
        : [];

    const base = {
        id: one.id,
        kind,
        title: typeof one.title === 'string' ? one.title.trim() : '',
        members,
        target: one.target,
        unit: tracking
            ? metricUnit(tracking)
            : typeof one.unit === 'string' && one.unit.trim()
              ? one.unit.trim()
              : kindMeta(kind).unit,
        tracking,
        deadline: typeof one.deadline === 'string' && isDayText(one.deadline) ? one.deadline : '',
        note: typeof one.note === 'string' ? one.note : '',
        logs,
        createdAt: isFiniteNumber(one.createdAt) ? one.createdAt : 0,
    };
    return { ...base, title: goalTitle(base) };
}

export function parseGoals(raw: unknown): Goal[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(parseGoal).filter((goal): goal is Goal => goal !== null);
}
