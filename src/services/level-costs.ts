/**
 * 养成计算器：人物、师门技能、人物修炼、召唤兽的分级代价表与算法。
 *
 * ---- 数据从哪来 ----
 *
 * 官网工具箱（https://xyq.163.com/tools/）背后的四个接口：
 * `get_role_need_exp_to_grade` / `get_school_skill_upgrade_need` /
 * `get_expt_need_res_by_lv_range` / `get_pet_upgrade_need_exp`。
 * 2026-11-18 逐级取回来，按级存进 `public/game/data/level-costs.json`（每项都是
 * 「这一级升到下一级」的单级代价，区间值由这里求和 —— 与官网整段查询逐位比对过）。
 *
 * 为什么不在运行期调那几个接口：它们要过 JSONP、走官网域名，断网、改版、跨域策略
 * 任一变化都会让这一页变成空白；而这批数是**游戏事实**，一个版本内不会变，搬进 JSON
 * 正好符合 `docs/GAME-ASSETS.md` 的「游戏改版换文件、不改代码」。
 *
 * ---- 三处口径必须照抄官网，不要自己「修正」 ----
 *
 * ① 召唤兽**月华露**用量走官网 bundle 的本地公式（`50·(i+1)²`，150–154 级 ×2、
 *    155–159 级 ×3、160 级以上 `150·(i+1)²`），而**需要经验**走存档表的求和。
 *    两者逐项同值（179 项全等，已核），但月华露只认公式；改成用经验反推就会与官网差几个。
 * ② 召唤兽修炼的累计经验表 = 人物修炼「攻击修炼」每级经验的前缀和，所以这里从修炼表
 *    推，不再抄一份数组 —— 两份迟早漂。
 * ③ 修炼的**帮贡**与**人物等级要求**不求和，取**目标等级那一级**的值
 *    （0→25 的帮贡是 3750 = 150×25，不是 25 项之和）。
 */

import { ref, shallowRef } from 'vue';

/** `public/game/data/` 下的目录。**换目录只改这一行**。 */
const DATA_DIR = `${import.meta.env.BASE_URL}game/data/`;

/** 修炼的一级：这一级升到下一级要付的五样东西。 */
export interface CultivationLevel {
    /** 修炼经验。 */
    exp: number;
    /** 梦幻币（原值，不是万）。 */
    cash: number;
    /** 需要帮贡。**取目标等级那一级**，不求和。 */
    bond: number;
    /** 需要资材。 */
    material: number;
    /** 人物等级要求。**取目标等级那一级**，不求和。 */
    minRoleLevel: number;
}

export interface CultivationType {
    /** 官网的 `expt_type`：1 攻击 2 防御 3 法术 4 抗法 5 猎术。 */
    id: number;
    name: string;
    /** 修炼等级上限（1–4 类 25，猎术 20）。 */
    cap: number;
    levels: CultivationLevel[];
}

export interface LevelCosts {
    /** 人物等级：`exp[i]` 是「i 级升 i+1 级」，长度 = cap。 */
    role: { cap: number; exp: number[] };
    /** 师门技能：同上，`exp[i]` / `cash[i]` 是「i 级升 i+1 级」。 */
    schoolSkill: { cap: number; exp: number[]; cash: number[] };
    cultivation: { types: CultivationType[] };
    /** 召唤兽等级：`exp[i]` 是「i+1 级升 i+2 级」（1→2 在第 0 项），长度 = cap - 1。 */
    petLevel: { cap: number; exp: number[] };
}

/* ---------- 校验 ----------
 * 只查形状与「这一列该有多长」，不查业务数量：官网改上限时该改 JSON、不该改代码。
 * 报错带文件名与序号，缺页时能直接定位到是哪一项。
 */
function parseNumberList(raw: unknown, where: string, length: number): number[] {
    if (!Array.isArray(raw) || raw.length !== length) {
        throw new TypeError(`${where} 应为 ${length} 项数值`);
    }
    return raw.map((value: unknown, index: number) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            throw new TypeError(`${where} 第 ${index + 1} 项应为非负整数`);
        }
        return value;
    });
}

function parseCultivationType(raw: unknown, index: number): CultivationType {
    const entry = raw as Partial<CultivationType>;
    const where = `level-costs.json：cultivation 第 ${index + 1} 类`;
    if (typeof entry?.id !== 'number' || !Number.isInteger(entry.id) || entry.id <= 0) {
        throw new TypeError(`${where} 缺 id`);
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`${where} 缺 name`);
    }
    if (typeof entry.cap !== 'number' || !Number.isInteger(entry.cap) || entry.cap <= 0) {
        throw new TypeError(`${where} 的 cap 应为正整数`);
    }
    if (!Array.isArray(entry.levels) || entry.levels.length !== entry.cap) {
        throw new TypeError(`${where} 的 levels 应有 ${entry.cap} 项`);
    }
    const levels = entry.levels.map((item: unknown, level: number) => {
        const one = item as Partial<CultivationLevel>;
        for (const field of ['exp', 'cash', 'bond', 'material', 'minRoleLevel'] as const) {
            const value = one?.[field];
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
                throw new TypeError(`${where} 第 ${level + 1} 级缺 ${field}`);
            }
        }
        return {
            exp: one.exp as number,
            cash: one.cash as number,
            bond: one.bond as number,
            material: one.material as number,
            minRoleLevel: one.minRoleLevel as number,
        };
    });
    return { id: entry.id, name: entry.name, cap: entry.cap, levels };
}

/** 解析整份表。坏文件当场抛错，而不是让读数静默变成 0。 */
export function parseLevelCosts(raw: unknown): LevelCosts {
    const file = raw as {
        role?: { cap?: unknown; exp?: unknown };
        schoolSkill?: { cap?: unknown; exp?: unknown; cash?: unknown };
        cultivation?: { types?: unknown };
        petLevel?: { cap?: unknown; exp?: unknown };
    };
    const readCap = (value: unknown, where: string): number => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
            throw new TypeError(`level-costs.json：${where}.cap 应为正整数`);
        }
        return value;
    };

    const roleCap = readCap(file?.role?.cap, 'role');
    const skillCap = readCap(file?.schoolSkill?.cap, 'schoolSkill');
    const petCap = readCap(file?.petLevel?.cap, 'petLevel');
    if (petCap < 2) throw new TypeError('level-costs.json：petLevel.cap 至少为 2');

    const types = file?.cultivation?.types;
    if (!Array.isArray(types) || !types.length) {
        throw new TypeError('level-costs.json：cultivation.types 应为非空数组');
    }

    return {
        role: {
            cap: roleCap,
            exp: parseNumberList(file?.role?.exp, 'level-costs.json：role.exp', roleCap),
        },
        schoolSkill: {
            cap: skillCap,
            exp: parseNumberList(
                file?.schoolSkill?.exp,
                'level-costs.json：schoolSkill.exp',
                skillCap,
            ),
            cash: parseNumberList(
                file?.schoolSkill?.cash,
                'level-costs.json：schoolSkill.cash',
                skillCap,
            ),
        },
        cultivation: { types: types.map(parseCultivationType) },
        petLevel: {
            cap: petCap,
            exp: parseNumberList(file?.petLevel?.exp, 'level-costs.json：petLevel.exp', petCap - 1),
        },
    };
}

/* ---------- 加载 ---------- */

/** 校验通过的表。`null` 表示「还没到齐」或「读失败了」。 */
export const levelCosts = shallowRef<LevelCosts | null>(null);
export const levelCostsLoading = ref(false);
export const levelCostsError = ref('');
let pending: Promise<LevelCosts | null> | null = null;

/**
 * 取一次，之后同步复用。失败时返回 `null` 并**清掉 pending**——dev server 抖一下
 * 不该把「没有数据」钉死一整页；下次进这一页（或点重试）会再来一次。
 */
export function loadLevelCosts(): Promise<LevelCosts | null> {
    if (levelCosts.value) return Promise.resolve(levelCosts.value);
    if (!pending) {
        levelCostsLoading.value = true;
        levelCostsError.value = '';
        pending = fetch(`${DATA_DIR}level-costs.json`)
            .then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json() as Promise<unknown>;
            })
            .then(parseLevelCosts)
            .then((costs) => {
                levelCosts.value = costs;
                return costs;
            })
            .catch((error: unknown) => {
                console.error('养成数据表加载失败', error);
                levelCostsError.value = '养成数据加载失败，请重试';
                pending = null;
                return null;
            })
            .finally(() => {
                levelCostsLoading.value = false;
            });
    }
    return pending;
}

/* ---------- 算法 ----------
 * 全是纯函数、只吃 `LevelCosts`，所以能拿官网返回值当断言钉死
 * （见 level-costs.test.ts）。区间一律「从 from 级升到 to 级」的**半开区间** [from, to)。
 */

/** 把 `values[from] … values[to - 1]` 加起来。越界项按 0 记，调用方先校验区间。 */
export function sumLevels(values: readonly number[], from: number, to: number): number {
    let sum = 0;
    for (let level = from; level < to; level += 1) sum += values[level] ?? 0;
    return sum;
}

/** 人物从 `from` 级升到 `to` 级要多少经验。 */
export function roleExpBetween(costs: LevelCosts, from: number, to: number): number {
    return sumLevels(costs.role.exp, from, to);
}

/**
 * 经验换算等级：当前 `current` 级、手上 `exp` 点经验，能升到几级、还剩多少。
 *
 * 逐级扣减到不够升下一级为止。满级时剩下的经验全留着 —— 官网在那个位置也不报错，
 * 而是「不再涨、余量照显」。
 */
export function expToGrade(
    costs: LevelCosts,
    current: number,
    exp: number,
): { grade: number; left: number } {
    let grade = Math.max(0, Math.floor(current));
    let left = Math.max(0, Math.floor(exp));
    while (grade < costs.role.cap) {
        const need = costs.role.exp[grade] ?? 0;
        if (left < need) break;
        left -= need;
        grade += 1;
    }
    return { grade, left };
}

/** 师门技能从 `from` 级升到 `to` 级：经验与梦幻币（原值）。 */
export function schoolSkillCost(
    costs: LevelCosts,
    from: number,
    to: number,
): { exp: number; cash: number } {
    return {
        exp: sumLevels(costs.schoolSkill.exp, from, to),
        cash: sumLevels(costs.schoolSkill.cash, from, to),
    };
}

export interface CultivationCost {
    exp: number;
    cash: number;
    material: number;
    /** 目标等级那一级的帮贡（不求和）。 */
    bond: number;
    /** 目标等级那一级的人物等级要求（不求和）。 */
    minRoleLevel: number;
}

/**
 * 人物修炼：某一类从 `from` 级点到 `to` 级。
 *
 * 经验 / 梦幻币 / 资材按级求和；帮贡与人物等级要求取**目标等级那一级**。
 * `to` 超出这一类的上限（猎术 20、其余 25）时返回 `null`，由调用方拦下。
 */
export function cultivationCost(
    costs: LevelCosts,
    typeId: number,
    from: number,
    to: number,
): CultivationCost | null {
    const type = costs.cultivation.types.find((one) => one.id === typeId);
    const target = type?.levels[to - 1];
    if (!type || !target || to <= 0) return null;
    let exp = 0;
    let cash = 0;
    let material = 0;
    for (let level = from; level < to; level += 1) {
        const one = type.levels[level];
        if (!one) continue;
        exp += one.exp;
        cash += one.cash;
        material += one.material;
    }
    return {
        exp,
        cash,
        material,
        bond: target.bond,
        minRoleLevel: target.minRoleLevel,
    };
}

/** 召唤兽修炼的累计经验表（下标 = 修炼等级 0…25），由攻击修炼每级经验前缀和推出。 */
export function petCultivationCumulative(costs: LevelCosts): number[] {
    const type = costs.cultivation.types.find((one) => one.id === 1);
    const cumulative = [0];
    for (const level of type?.levels ?? []) {
        cumulative.push(cumulative[cumulative.length - 1] + level.exp);
    }
    return cumulative;
}

/**
 * 召唤兽修炼：从 `from` 级到 `to` 级要多少修炼经验、人物要几级、跑多少轮 100 环。
 *
 * 「100 环数量」是官网按每轮 760 点修炼经验向上取整估的，这里照抄同一个除数 ——
 * 换成游戏里真实的单轮产出得先有那份数据，现在没有。
 */
export function petCultivationCost(
    costs: LevelCosts,
    from: number,
    to: number,
): { exp: number; minRoleLevel: number; rounds100: number } {
    const cumulative = petCultivationCumulative(costs);
    const exp = (cumulative[to] ?? 0) - (cumulative[from] ?? 0);
    return {
        exp,
        minRoleLevel: Math.max(to * 5 + 20, 65),
        rounds100: Math.ceil(exp / 760),
    };
}

/**
 * 官网 bundle 里算月华露用的单级经验公式。
 *
 * 与存下来的经验表逐项同值（179 项已核），但它**独立存在**：月华露按这个式子除
 * `1000·(i+1)` 再向上取整，用表里的经验反推会差几个。
 */
function petMoonDewExp(level: number): number {
    const base = (level + 1) * (level + 1);
    if (level < 150) return Math.trunc(50 * base);
    if (level < 155) return Math.trunc(50 * base * 2);
    if (level < 160) return Math.trunc(50 * base * 3);
    return Math.trunc(150 * base);
}

/**
 * 召唤兽升级：从 `from` 级升到 `to` 级。
 *
 * `exp` 走存档的经验表（第 `from - 1` 项起），`moonDew` 走官网公式 —— 两者同源，
 * 只在这一处混用，理由见文件头 ①。
 */
export function petLevelCost(
    costs: LevelCosts,
    from: number,
    to: number,
): { exp: number; moonDew: number } {
    const exp = sumLevels(costs.petLevel.exp, from - 1, to - 1);
    let moonDew = 0;
    for (let level = from; level < to; level += 1) {
        moonDew += petMoonDewExp(level) / (1000 * level + 1000);
    }
    return { exp, moonDew: Math.ceil(moonDew) };
}

/**
 * 人物常规：技能上限与金钱上限。
 *
 * 技能上限 `lv - ⌊lv/5⌋ - 10`，19 级及以下为「无」（官网那一格写的就是「无」，
 * 不是 0，所以这里用 `null` 而不是 0 表示「没有上限」）；金钱上限
 * `lv² × 2000 + 10000`，封顶 3000 万（官网写死的那条线）。
 */
export function roleConvention(level: number): {
    skillCap: number | null;
    moneyCap: number;
} {
    const cap = Math.floor(level - level / 5 - 10);
    return {
        skillCap: level > 19 && cap > 0 ? cap : null,
        moneyCap: Math.min(level * level * 2000 + 10000, 30_000_000),
    };
}
