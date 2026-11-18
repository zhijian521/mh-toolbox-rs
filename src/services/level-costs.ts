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
 *
 * ---- 辅助技能与乾元丹（2026-11-18 补） ----
 *
 * 辅助技能来自同一套工具箱：`get_life_skill_upgrade_need` 逐级抓回 21 项，
 * 去重成 5 条曲线（多数技能逐级代价完全相同），技能表只存 `{id, name, curve, cap}`。
 * 帮贡**不入表**：官方「需要帮贡」恒等于 `5 × 目标等级`、「消耗帮贡」恒等于
 * `1+2+…+等级`，两列都能由等级直接算，抄进 JSON 只会多一处能漂的地方。
 * **烹饪技巧上限是 140**：官方 bundle 的 `limitobj` 写 160，但接口从 141 级起报
 * 「修炼等级填写错误」，按接口与官网资料片页为准。
 *
 * 乾元丹的 9 档代价是官方 bundle 里写死的表（`qianyuandandata`），`exp[0]` 是
 * 「升到第 1 颗」。第 8、9 颗的经验比第 7 颗低 —— 那是原始数据，照抄，不要「修正」。
 *
 * ---- 另外五块（2026-11-18 第二轮补） ----
 *
 * 商会免税、宝石合成、转门派、潜能果兑换、召唤兽练级场景与上面九块同源，也全部抄进
 * 同一份 JSON：官网那几块要么调接口、要么在 bundle 里写死表，运行期都离不开它。
 *
 * 三处**不是**「按级求和」的表，别照同一个模子理解：
 * ① 潜能果 `exp[i]` 是「第 i 颗要多少**万**经验」，**下标就是颗数**、第 0 项是 0；
 *    乾元丹那列相反，`exp[0]` 已经是第 1 颗。两列下标差一位，是官网原文如此。
 * ② 转门派的 `levelExp` 与 `role.exp` **不是同一份表**：前者是「当前等级的总经验」
 *    口径（`120·lv³ + levelExp·0.2 + 总经验·0.02`），取值比 `role.exp[lv-1]` 晚一档，
 *    116 项里 61 项差几十到几百。照抄，不要拿 `role.exp` 替换。
 * ③ 召唤兽场景的经验是「五人组队领双」的单场值，**与等级无关**，只有能不能吃满
 *    这一件事跟等级有关 —— 所以这里只筛场景，不做任何折算。
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

/** 一条辅助技能曲线里的单级代价：升到「第 i+1 级」要付的经验与梦幻币。 */
export interface LifeSkillCurve {
    exp: number[];
    cash: number[];
}

/** 一项辅助技能：只记住它挂在哪条曲线上，逐级代价不重复存。 */
export interface LifeSkill {
    /** 官网的 `skill_id`。 */
    id: number;
    name: string;
    /** `lifeSkill.curves` 的下标。 */
    curve: number;
    /** 这一项的等级上限（烹饪 140、感应系 20、灵石 120……与曲线长度不一定相等）。 */
    cap: number;
}

/** 一条召唤兽练级场景：等级区间内打满经验时，五人组队领双的单场经验。 */
export interface PetScene {
    name: string;
    /** 能吃满的等级下限。 */
    min: number;
    /** 能吃满的等级上限（含）。 */
    max: number;
    exp: number;
}

/**
 * 宝石合成的两档规则：目标 `lv` 级要 `divisor^(lv-1)` 颗 1 级。
 *
 * 官方只有两档 —— 普通宝石进位 2、上限 20；星辉石进位 3、上限 11。
 */
export interface GemType {
    /** 官方 bundle 的 `baoshiselect` 值。 */
    id: string;
    name: string;
    divisor: number;
    cap: number;
}

export interface LevelCosts {
    /** 人物等级：`exp[i]` 是「i 级升 i+1 级」，长度 = cap。 */
    role: { cap: number; exp: number[] };
    /** 师门技能：同上，`exp[i]` / `cash[i]` 是「i 级升 i+1 级」。 */
    schoolSkill: { cap: number; exp: number[]; cash: number[] };
    cultivation: { types: CultivationType[] };
    /** 召唤兽等级：`exp[i]` 是「i+1 级升 i+2 级」（1→2 在第 0 项），长度 = cap - 1。 */
    petLevel: { cap: number; exp: number[] };
    /** 辅助技能：曲线去重后共用，技能只挂曲线下标。 */
    lifeSkill: { curves: LifeSkillCurve[]; skills: LifeSkill[] };
    /** 乾元丹：`exp[i]` / `cash[i]` 是「升到第 i+1 颗」的单颗代价，长度 = cap。 */
    qianYuanDan: { cap: number; exp: number[]; cash: number[] };
    /** 潜能果：`exp[i]` 是「第 i 颗要多少万经验」，**下标就是颗数**，第 0 项是 0。 */
    qianNengGuo: { cap: number; exp: number[] };
    /** 转门派：60 到 175 级每级的升级经验，按 `levelExp[等级 - min]` 取。 */
    menpai: { min: number; max: number; levelExp: number[] };
    /** 召唤兽练级场景：按等级筛「满经验场景」，经验与等级无关。 */
    petScene: { items: PetScene[] };
    /** 宝石合成：只有两档除数与上限。 */
    gem: { types: GemType[] };
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
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${where} 第 ${index + 1} 项应为非负整数`);
        }
        return value;
    });
}

function parseCultivationType(raw: unknown, index: number): CultivationType {
    const entry = raw as Partial<CultivationType>;
    const where = `level-costs.json：cultivation 第 ${index + 1} 类`;
    if (typeof entry?.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id <= 0) {
        throw new TypeError(`${where} 缺 id`);
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`${where} 缺 name`);
    }
    if (typeof entry.cap !== 'number' || !Number.isSafeInteger(entry.cap) || entry.cap <= 0) {
        throw new TypeError(`${where} 的 cap 应为正整数`);
    }
    if (!Array.isArray(entry.levels) || entry.levels.length !== entry.cap) {
        throw new TypeError(`${where} 的 levels 应有 ${entry.cap} 项`);
    }
    const levels = entry.levels.map((item: unknown, level: number) => {
        const one = item as Partial<CultivationLevel>;
        for (const field of ['exp', 'cash', 'bond', 'material', 'minRoleLevel'] as const) {
            const value = one?.[field];
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
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

function parseLifeSkillCurve(raw: unknown, index: number): LifeSkillCurve {
    const where = `level-costs.json：lifeSkill.curves 第 ${index + 1} 条`;
    const entry = raw as Partial<LifeSkillCurve>;
    if (!Array.isArray(entry?.exp) || !entry.exp.length) throw new TypeError(`${where} 缺 exp`);
    const length = entry.exp.length;
    return {
        exp: parseNumberList(entry.exp, `${where}.exp`, length),
        cash: parseNumberList(entry.cash, `${where}.cash`, length),
    };
}

function parseLifeSkill(raw: unknown, index: number, curveCount: number): LifeSkill {
    const entry = raw as Partial<LifeSkill>;
    const where = `level-costs.json：lifeSkill.skills 第 ${index + 1} 项`;
    if (typeof entry?.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id <= 0) {
        throw new TypeError(`${where} 缺 id`);
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`${where} 缺 name`);
    }
    /* 曲线下标越界在这里就拦下：等到算的时候才发现，读数只会静默变成 0。 */
    if (
        typeof entry.curve !== 'number' ||
        !Number.isSafeInteger(entry.curve) ||
        entry.curve < 0 ||
        entry.curve >= curveCount
    ) {
        throw new TypeError(`${where} 的 curve 应在 0 到 ${curveCount - 1} 之间`);
    }
    if (typeof entry.cap !== 'number' || !Number.isSafeInteger(entry.cap) || entry.cap <= 0) {
        throw new TypeError(`${where} 的 cap 应为正整数`);
    }
    return { id: entry.id, name: entry.name, curve: entry.curve, cap: entry.cap };
}

/** 解析整份表。坏文件当场抛错，而不是让读数静默变成 0。 */
export function parseLevelCosts(raw: unknown): LevelCosts {
    const file = raw as {
        role?: { cap?: unknown; exp?: unknown };
        schoolSkill?: { cap?: unknown; exp?: unknown; cash?: unknown };
        cultivation?: { types?: unknown };
        petLevel?: { cap?: unknown; exp?: unknown };
        lifeSkill?: { curves?: unknown; skills?: unknown };
        qianYuanDan?: { cap?: unknown; exp?: unknown; cash?: unknown };
        qianNengGuo?: { cap?: unknown; exp?: unknown };
        menpai?: { min?: unknown; max?: unknown; levelExp?: unknown };
        petScene?: { items?: unknown };
        gem?: { types?: unknown };
    };
    const readCap = (value: unknown, where: string): number => {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
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
    const cultivationTypes = types.map(parseCultivationType);
    if (
        new Set(cultivationTypes.map((one) => one.id)).size !== cultivationTypes.length ||
        !cultivationTypes.some((one) => one.id === 1)
    ) {
        throw new TypeError('level-costs.json：cultivation 类型重复或缺少攻击修炼');
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
        cultivation: { types: cultivationTypes },
        petLevel: {
            cap: petCap,
            exp: parseNumberList(file?.petLevel?.exp, 'level-costs.json：petLevel.exp', petCap - 1),
        },
        lifeSkill: parseLifeSkillTable(file?.lifeSkill),
        qianYuanDan: parseQianYuanDan(file?.qianYuanDan),
        qianNengGuo: parseQianNengGuo(file?.qianNengGuo),
        menpai: parseMenpai(file?.menpai),
        petScene: parsePetSceneTable(file?.petScene),
        gem: parseGemTable(file?.gem),
    };
}

/** 辅助技能：先读曲线（后面每项的 curve 下标要拿它验），再读技能。 */
function parseLifeSkillTable(raw: unknown): { curves: LifeSkillCurve[]; skills: LifeSkill[] } {
    const file = raw as { curves?: unknown; skills?: unknown } | undefined;
    if (!Array.isArray(file?.curves) || !file.curves.length) {
        throw new TypeError('level-costs.json：lifeSkill.curves 应为非空数组');
    }
    const curves = file.curves.map(parseLifeSkillCurve);
    if (!Array.isArray(file.skills) || !file.skills.length) {
        throw new TypeError('level-costs.json：lifeSkill.skills 应为非空数组');
    }
    const skills = file.skills.map((one: unknown, index: number) =>
        parseLifeSkill(one, index, curves.length),
    );
    const ids = new Set<number>();
    const names = new Set<string>();
    for (const skill of skills) {
        if (ids.has(skill.id) || names.has(skill.name)) {
            throw new TypeError('level-costs.json：lifeSkill 技能重复');
        }
        if (skill.cap > curves[skill.curve].exp.length) {
            throw new TypeError('level-costs.json：lifeSkill 上限超出曲线长度');
        }
        ids.add(skill.id);
        names.add(skill.name);
    }
    return { curves, skills };
}

/** 潜能果：200 档，`exp` 有 `cap + 1` 项（第 0 项是「第 0 颗」，恒为 0）。 */
function parseQianNengGuo(raw: unknown): { cap: number; exp: number[] } {
    const file = raw as { cap?: unknown; exp?: unknown } | undefined;
    const cap = file?.cap;
    if (typeof cap !== 'number' || !Number.isSafeInteger(cap) || cap <= 0) {
        throw new TypeError('level-costs.json：qianNengGuo.cap 应为正整数');
    }
    return {
        cap,
        exp: parseNumberList(file?.exp, 'level-costs.json：qianNengGuo.exp', cap + 1),
    };
}

/** 转门派：60 到 175 每级一项，长度 = max - min + 1。 */
function parseMenpai(raw: unknown): { min: number; max: number; levelExp: number[] } {
    const file = raw as { min?: unknown; max?: unknown; levelExp?: unknown } | undefined;
    const min = file?.min;
    const max = file?.max;
    for (const [name, value] of [
        ['min', min],
        ['max', max],
    ] as const) {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`level-costs.json：menpai.${name} 应为正整数`);
        }
    }
    if ((min as number) >= (max as number)) {
        throw new TypeError('level-costs.json：menpai.min 应小于 menpai.max');
    }
    const count = (max as number) - (min as number) + 1;
    return {
        min: min as number,
        max: max as number,
        levelExp: parseNumberList(file?.levelExp, 'level-costs.json：menpai.levelExp', count),
    };
}

/** 召唤兽练级场景：段内上下限要有序，否则「按等级筛」会悄悄漏掉一段。 */
function parsePetScene(raw: unknown, index: number): PetScene {
    const entry = raw as Partial<PetScene>;
    const where = `level-costs.json：petScene.items 第 ${index + 1} 条`;
    if (typeof entry?.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`${where} 缺 name`);
    }
    for (const field of ['min', 'max', 'exp'] as const) {
        const value = entry?.[field];
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${where} 的 ${field} 应为非负整数`);
        }
    }
    if ((entry.min as number) > (entry.max as number)) {
        throw new TypeError(`${where} 的 min 不应大于 max`);
    }
    return {
        name: entry.name,
        min: entry.min as number,
        max: entry.max as number,
        exp: entry.exp as number,
    };
}

/** 宝石合成：两档，除数至少 2（除数 1 等于「不合」）。 */
function parseGemType(raw: unknown, index: number): GemType {
    const entry = raw as Partial<GemType>;
    const where = `level-costs.json：gem.types 第 ${index + 1} 档`;
    if (typeof entry?.id !== 'string' || !entry.id.trim()) {
        throw new TypeError(`${where} 缺 id`);
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`${where} 缺 name`);
    }
    if (
        typeof entry.divisor !== 'number' ||
        !Number.isSafeInteger(entry.divisor) ||
        entry.divisor < 2
    ) {
        throw new TypeError(`${where} 的 divisor 应为不小于 2 的整数`);
    }
    if (typeof entry.cap !== 'number' || !Number.isSafeInteger(entry.cap) || entry.cap < 2) {
        throw new TypeError(`${where} 的 cap 应为不小于 2 的整数`);
    }
    return { id: entry.id, name: entry.name, divisor: entry.divisor, cap: entry.cap };
}

function parsePetSceneTable(raw: unknown): { items: PetScene[] } {
    const file = raw as { items?: unknown } | undefined;
    if (!Array.isArray(file?.items) || !file.items.length) {
        throw new TypeError('level-costs.json：petScene.items 应为非空数组');
    }
    return { items: file.items.map(parsePetScene) };
}

function parseGemTable(raw: unknown): { types: GemType[] } {
    const file = raw as { types?: unknown } | undefined;
    if (!Array.isArray(file?.types) || !file.types.length) {
        throw new TypeError('level-costs.json：gem.types 应为非空数组');
    }
    return { types: file.types.map(parseGemType) };
}

/** 乾元丹：9 档单颗代价，经验与梦幻币两列等长。 */
function parseQianYuanDan(raw: unknown): { cap: number; exp: number[]; cash: number[] } {
    const file = raw as { cap?: unknown; exp?: unknown; cash?: unknown } | undefined;
    const cap = file?.cap;
    if (typeof cap !== 'number' || !Number.isSafeInteger(cap) || cap <= 0) {
        throw new TypeError('level-costs.json：qianYuanDan.cap 应为正整数');
    }
    return {
        cap,
        exp: parseNumberList(file?.exp, 'level-costs.json：qianYuanDan.exp', cap),
        cash: parseNumberList(file?.cash, 'level-costs.json：qianYuanDan.cash', cap),
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
    if (!type || !target || to <= 0 || !validRange(from, to, type.cap)) return null;
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

/* ---------- 辅助技能 ---------- */

/** 一项辅助技能的上限。名字对不上时返回 `null`，由页面拦下。 */
export function lifeSkillOf(costs: LevelCosts, skillId: number): LifeSkill | null {
    return costs.lifeSkill.skills.find((one) => one.id === skillId) ?? null;
}

export interface LifeSkillCost {
    exp: number;
    cash: number;
    /** 目标等级那一级的「需要帮贡」（`5 × 目标等级`）。 */
    reqBond: number;
    /** 升这么多级一共消耗多少帮贡（`1 + 2 + … + 目标等级` 的差）。 */
    usedBond: number;
}

/**
 * 辅助技能：某一项从 `from` 级点到 `to` 级。
 *
 * 经验与梦幻币按级求和；帮贡两列都由等级直接推出（见文件头），不读表。
 * `to` 超出这一项的上限时返回 `null`。
 */
export function lifeSkillCost(
    costs: LevelCosts,
    skillId: number,
    from: number,
    to: number,
): LifeSkillCost | null {
    const skill = lifeSkillOf(costs, skillId);
    const curve = skill ? costs.lifeSkill.curves[skill.curve] : undefined;
    if (!skill || !curve || to <= 0 || !validRange(from, to, skill.cap)) return null;
    /* 帮贡是「第 N 级要 N 点」，累计就是三角数。闭式比逐项加快，也免了再存一列。 */
    const triangle = (level: number) => (level * (level + 1)) / 2;
    return {
        exp: sumLevels(curve.exp, from, to),
        cash: sumLevels(curve.cash, from, to),
        reqBond: to * 5,
        usedBond: triangle(to) - triangle(from),
    };
}

/* ---------- 乾元丹 ---------- */

/**
 * 乾元丹：从第 `from` 颗升到第 `to` 颗（`from` 为 0 表示一颗都没有）。
 *
 * 与官网同一口径：`to` 超过 9 颗或 `to < from` 时返回 `null`。
 * 这是**单颗代价的求和**，不是累计值表 —— 所以第 8、9 颗的经验递减也如实反映。
 */
export function qianYuanDanCost(
    costs: LevelCosts,
    from: number,
    to: number,
): { exp: number; cash: number } | null {
    const table = costs.qianYuanDan;
    if (!validRange(from, to, table.cap)) return null;
    return {
        exp: sumLevels(table.exp, from, to),
        cash: sumLevels(table.cash, from, to),
    };
}

/**
 * 人物常规：升级技能要求与金钱上限。
 *
 * 技能要求 `⌊lv - lv/5 - 10⌋`，19 级及以下为「无」，不是师门技能可学上限；金钱上限
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

/* ---------- 商会免税 × 店铺间数 ---------- */

/**
 * 商会免税：商业指数与店铺间数 → 免税需求卖出的营业额（单位「两」）。
 *
 * 官网写死 `指数 × 1000 × 间数`，没有别的系数，也不随店铺类型变。
 */
export function guildShopQuota(index: number, shops: number): number {
    return Math.max(0, Math.floor(index)) * 1000 * Math.max(0, Math.floor(shops));
}

/* ---------- 宝石合成 ---------- */

export interface GemCost {
    /** 合成到目标等级一共要多少颗 1 级。 */
    total: number;
    /** 目标等级减一级要多少颗 1 级（合成一次的原料）。 */
    lower: number;
    /** 再下一级要多少颗（判断「上一手从哪来」用）。 */
    lower2: number;
    /** 按单颗 1 级价格折算的总花费。 */
    money: number;
}

/**
 * 宝石合成：目标等级与「1 级单价」→ 要几颗、花多少。
 *
 * 目标 `lv` 级要 `divisor^(lv-1)` 颗 1 级，`lv-2`、`lv-3` 同理；除法之外**不取整**，
 * 等价数量按整数级计算；不含合成失败损耗及手续费。
 * 目标等级超出这一档的上限时返回 `null`。
 */
export function gemCost(
    costs: LevelCosts,
    typeId: string,
    level: number,
    unitPrice: number,
): GemCost | null {
    const type = costs.gem.types.find((one) => one.id === typeId);
    const target = Math.floor(level);
    if (
        !type ||
        !Number.isSafeInteger(level) ||
        target < 1 ||
        target > type.cap ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isSafeInteger(Math.round(unitPrice * 100))
    )
        return null;
    const total = type.divisor ** (target - 1);
    const money = total * unitPrice;
    if (!Number.isSafeInteger(Math.round(money * 100))) return null;
    return {
        total,
        lower: target >= 2 ? type.divisor ** (target - 2) : 0,
        lower2: target >= 3 ? type.divisor ** (target - 3) : 0,
        money,
    };
}

/* ---------- 转门派 ---------- */

/** 转门派消耗经验的上限：官网写死 10 亿，超过就按 10 亿算。 */
export const MENPAI_MAX_EXP = 1_000_000_000;

/** 已飞升转门派的等级下限：官网 `menpai_fly` 卡死 129 级。 */
export const MENPAI_FLY_MIN_LEVEL = 129;

/** 转门派公式里 `120·lv³` 那一项的三次方系数。 */
const MENPAI_CUBE = 120;

export interface MenpaiCost {
    /** 需要消耗的经验（已按 10 亿封顶）。 */
    exp: number;
    /** 是否触到 10 亿上限。 */
    capped: boolean;
    /** 需要的潜能果数量（只有已飞升才算，未飞升为 `null`）。 */
    fruit: number | null;
    /** 手上潜能果不够时，这一项为「至少还要吃几颗」；够了为 0。 */
    fruitShort: number;
}

/**
 * 转门派：等级 + 人物总经验 → 要消耗多少经验（已飞升再看潜能果）。
 *
 * 公式照抄官网：`120·lv³ + 该级升级经验·0.2 + 总经验·0.02`，取整后封顶 10 亿。
 * 已飞升那条多两步：先用**已有的潜能果从高往低**抵扣，不够再从 0 往上补 ——
 * 官网就是这两段循环，所以「已有 200 颗」与「一颗没有」在同一个消耗下答案不同。
 *
 * `fruitOwned` 传 `null` 表示未飞升，不参与潜能果计算。
 */
export function menpaiCost(
    costs: LevelCosts,
    level: number,
    totalExp: number,
    fruitOwned: number | null = null,
): MenpaiCost | null {
    const lv = level;
    if (
        !Number.isSafeInteger(lv) ||
        !Number.isSafeInteger(totalExp) ||
        totalExp < 0 ||
        (fruitOwned !== null &&
            (!Number.isSafeInteger(fruitOwned) ||
                fruitOwned < 0 ||
                fruitOwned > costs.qianNengGuo.cap))
    )
        return null;
    const upgrade = costs.menpai.levelExp[lv - costs.menpai.min];
    if (lv < costs.menpai.min || lv > costs.menpai.max || upgrade === undefined) return null;
    /* 已飞升那条官网额外卡 `level >= 129`，未飞升没有这一条。 */
    if (fruitOwned !== null && lv < MENPAI_FLY_MIN_LEVEL) return null;
    const raw = Math.trunc(
        MENPAI_CUBE * lv * lv * lv + upgrade * 0.2 + Math.max(0, totalExp) * 0.02,
    );
    const exp = Math.min(raw, MENPAI_MAX_EXP);
    if (fruitOwned === null) {
        return { exp, capped: raw > MENPAI_MAX_EXP, fruit: null, fruitShort: 0 };
    }
    const owned = Math.max(0, Math.min(Math.floor(fruitOwned), costs.qianNengGuo.cap));
    const fruit = fruitForExp(costs, owned, exp);
    return { exp, capped: raw > MENPAI_MAX_EXP, fruit, fruitShort: Math.max(0, fruit - owned) };
}

/**
 * 要吃几颗潜能果才够 `exp` 点经验。
 *
 * 官网那两段循环的顺序有意义：**先按已有颗数从高往低抵扣**（吃得越多、单颗越贵，
 * 所以从最高那颗开始扣最省），不够再从头补。这里原样实现，不换成「累计表 + 二分」——
 * 换掉之后「已有 3 颗」与「已有 200 颗」在边界上的答案会与官网不一样。
 */
export function fruitForExp(costs: LevelCosts, owned: number, exp: number): number {
    const need = Math.max(0, Math.floor(exp));
    if (!need) return 0;
    /* `exp[i]` 是「第 i 颗」的代价（单位万），第 0 项是占位 0，所以按下标直接取。 */
    const perFruit = costs.qianNengGuo.exp.map((wan) => wan * 10_000);
    let count = 0;
    let consumed = 0;
    while (consumed < need && owned > count) {
        consumed += perFruit[owned - count] ?? 0;
        count += 1;
    }
    if (consumed < need) {
        count = 0;
        consumed = 0;
        while (consumed < need && count < costs.qianNengGuo.cap) {
            consumed += perFruit[count + 1] ?? 0;
            count += 1;
        }
    }
    return count;
}

/* ---------- 潜能果兑换经验 ---------- */

/**
 * 潜能果：已有 `from` 颗、目标 `to` 颗 → 还要多少经验（原值）。
 *
 * 官网按 `addSum(from + 1, to)` 求和，也就是**只算新增的那几颗**（第 `from+1` 到
 * 第 `to` 颗）。`from > to`、或任一端超出 200 颗时返回 `null`。
 */
export function qianNengGuoCost(
    costs: LevelCosts,
    from: number,
    to: number,
): { exp: number; fruits: number } | null {
    const cap = costs.qianNengGuo.cap;
    const start = from;
    const end = to;
    if (!validRange(start, end, cap)) return null;
    return {
        exp: sumLevels(costs.qianNengGuo.exp, start + 1, end + 1) * 10_000,
        fruits: end - start,
    };
}

/* ---------- 召唤兽练级场景 ---------- */

/**
 * 召唤兽要几级时，哪些场景能吃满经验。
 *
 * 只筛区间（`min ≤ 等级 ≤ max`），**不折算经验**：官网那一列是「五人组队领双」的
 * 单场值，与召唤兽等级无关，等级只决定能不能吃满。等级超出 0–175 时返回空数组。
 */
export function petScenesAt(costs: LevelCosts, level: number): PetScene[] {
    const lv = Math.floor(level);
    if (!Number.isFinite(lv) || lv < 0) return [];
    return costs.petScene.items.filter((one) => lv >= one.min && lv <= one.max);
}

/** 在入口拦下小数与非有限数，避免求和悄悄漏级或产生负资源。 */
function validRange(from: number, to: number, cap: number): boolean {
    return (
        Number.isSafeInteger(from) &&
        Number.isSafeInteger(to) &&
        from >= 0 &&
        to >= from &&
        to <= cap
    );
}
