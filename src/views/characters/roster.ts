/**
 * 角色名册：本地存储 + 增删改。
 *
 * 这是角色页第一份**真数据层**。此前 `mock.ts` 只是字面量，页面直接 `v-for` 上去；
 * 现在名册要能改、能删、能加，还必须活过重启——所以有一处持久化、一层逐字段兜底。
 *
 * ---- 为什么存在 `localStorage` 而不是 SQLite ----
 * `mh-store`（Rust 侧的 SQLite）还没起来，而「能录入自己的号」这件事不该等它。
 * 这一层因此被刻意压成**两个函数**：`loadRoster()` / `saveRoster()`。
 * 将来换存储只换这两个函数体，`useRoster()` 与所有页面代码一行不动。
 *
 * ---- 为什么每个字段都要兜底 ----
 * 存进去的是结构化对象，读回来的是**别人写的** JSON：可能是上一版的字段、
 * 可能是手工改过的、也可能是将来 OCR 导入的半成品。少一个 `stats` 数组，
 * 卡片就会在 `v-for` 上抛错，而整页白屏的报错只有一行 `Cannot read properties of
 * undefined`，看不出是哪个角色的哪一格。所以解析走 `normalizeCharacter`，
 * 缺什么补什么，坏掉的条目整条丢掉——**宁可少显示一条，不要整页打不开**。
 *
 * 与此配套的一条：`parseRoster` 只在「整体不可读」时返回 `null`（没存过 / 不是 JSON /
 * 不是数组），由调用方决定用种子还是空名册；单条坏掉不牵连整份名册。
 */
import { ref } from 'vue';
import {
    ATTR_GROUPS,
    GEAR_SLOTS,
    TRAINING_GROUPS,
    type AssistSkill,
    type AttrGroup,
    type AttrRow,
    type CharacterData,
    type GearDetail,
    type GearSlot,
    type GearStat,
    type GearTone,
    type Pet,
    type SkillRow,
    type TrainingGroup,
} from './character';
import { CHARACTERS } from './mock';

const STORAGE_KEY = 'mh-roster';

/* ======================================================================
 * 兜底：未知值 → 契约里的形状
 * ==================================================================== */

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** 只认有限的数字：`NaN` / `Infinity` 存进 JSON 会变成 `null`，读回来再算就是另一个故事。 */
const int = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;

/**
 * 可选的数字字段。与 `int` 的区别是**缺省值不是 0**——`cap` 缺席与 `cap: 0`
 * 在这里是两件事：前者是「不知道上限」所以不标满级，后者是「上限就是 0」。
 * 用 0 兜底会把「不知道」悄悄变成「不可能满」。
 */
const optionalInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;

const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 可选的字符串字段：空串一律还原成 `undefined`，否则 `v-if="row.extra"` 仍会画一个空 span。 */
const optionalText = (value: unknown): string | undefined =>
    typeof value === 'string' && value ? value : undefined;

const GEAR_TONES: GearTone[] = ['seal', 'ochre', 'moss'];
const asTone = (value: unknown): GearTone | undefined => GEAR_TONES.find((tone) => tone === value);

/* ======================================================================
 * 空白角色的骨架
 * ==================================================================== */

/** 属性五组的空骨架：组名、行、顺序、通栏标记全来自 `ATTR_GROUPS`，这里只负责「数值留空」。 */
function blankAttrGroups(): AttrGroup[] {
    return ATTR_GROUPS.map((group) => ({
        title: group.title,
        rows: group.labels.map((label) => ({ label, value: '' })),
        // `wide` 只在清单里标了的组上存在，`in` 是打开联合类型的窄化写法。
        ...('wide' in group ? { wide: true } : {}),
    }));
}

/** 修炼两组十项，结构整份来自 `TRAINING_GROUPS`（组名、项名、上限都是游戏固定的）。 */
function blankTrainings(): TrainingGroup[] {
    return TRAINING_GROUPS.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => ({ name: row.name, level: 0, cap: row.cap })),
    }));
}

function makeId(): string {
    // `randomUUID` 在 WebView2 与 Node 19+ 都有；老环境回落到时间戳 + 随机后缀。
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid
        ? `char-${uuid}`
        : `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 新角色的骨架：该有的格子都在（12 个装备位、10 项修炼），该空的都空着。 */
export function emptyCharacter(): CharacterData {
    return {
        id: makeId(),
        name: '',
        level: 0,
        school: '',
        server: '',
        guild: '',
        attrGroups: blankAttrGroups(),
        experience: { value: '', need: '' },
        skills: [],
        assists: [],
        trainings: blankTrainings(),
        gear: GEAR_SLOTS.map((slot) => ({ slot })),
        gearMeta: { special: '', suit: '' },
        pets: [],
    };
}

/* ======================================================================
 * 逐字段归一
 * ==================================================================== */

function normalizeSkill(raw: unknown): SkillRow | null {
    if (!isObject(raw)) return null;
    const name = text(raw.name);
    // 没有名字的行留着只会画出一条空白分隔线，不如丢掉。
    if (!name) return null;
    const level = int(raw.level);
    /* 上限是**正整数**：0 与负数都不可能是技能上限，它们只表示「这一格空着」。
     * 表单里那一格留空就是写 0（`NumberField` 只有一个数值），所以这里必须把 0 还原成
     * 「不知道」——否则卡上会画出 `0/0` 并盖一枚「满」的签，读起来是这个技能练满了。 */
    const cap = optionalInt(raw.cap);
    return {
        name,
        level,
        cap: cap && cap > 0 ? cap : undefined,
        off: raw.off === true ? true : undefined,
    };
}

function normalizeSkills(raw: unknown): SkillRow[] {
    return rows(raw)
        .map(normalizeSkill)
        .filter((row): row is SkillRow => row !== null);
}

/** 辅助技能：同一套字段再加一个 `kind`。缺省按「生活技能」——
 * 上一版没有这个字段，那些数据全是生活技能。
 *
 * **同类同名只留第一条**：同一个技能记两遍没有意义，卡片上会出两个一模一样的格子
 * （连图标都一样），而且卡内 `v-for` 拿 `kind + name` 当 key——重复 key 会让 Vue
 * 复用错元素，改一行另一行跟着变。名字现在是从名录里选的，重复很容易发生
 * （2026-11-03 实测：手改数据塞两条「强身术」确实渲染成两格）。
 */
function normalizeAssists(raw: unknown): AssistSkill[] {
    const seen = new Set<string>();
    return rows(raw).flatMap((item) => {
        const base = normalizeSkill(item);
        if (!base) return [];
        const kind = isObject(item) && item.kind === 'story' ? 'story' : 'life';
        const key = `${kind}-${base.name}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...base, kind }];
    });
}

function normalizeAttrGroup(raw: unknown): AttrGroup {
    const group = isObject(raw) ? raw : {};
    return {
        title: text(group.title),
        rows: rows(group.rows).flatMap((row) => {
            if (!isObject(row)) return [];
            const label = text(row.label);
            if (!label) return [];
            return [
                {
                    label,
                    value: text(row.value),
                    strong: row.strong === true ? true : undefined,
                },
            ];
        }),
    };
}

/**
 * 属性五组：**按固定清单重建**，只从存下来的数据里取数值。
 *
 * 一次拿到三件事：清单外的行丢掉（`愤怒`、`潜力`，以及手工加过的）、缺的行补空
 * （旧数据里没有的项）、顺序恒定（由 `ATTR_GROUPS` 定，不由数据里的顺序定）。
 * 三件事其实是同一件——用户要的是「这张表固定」，那么**结构就不该由数据决定**。
 *
 * 兼容上一版的**两列结构**（`[[组, 组], [组, 组]]`）：老数据在 `attrColumns` 里，
 * 展开成一维后按标签查。已经录过的号改版之后数值还在，只是行按新清单排。
 */
function normalizeAttrGroups(source: Record<string, unknown>): AttrGroup[] {
    const legacy = rows(source.attrColumns).flat();
    const flat = rows(source.attrGroups).length ? rows(source.attrGroups) : legacy;

    const saved = new Map<string, AttrRow>();
    for (const item of flat) {
        for (const row of normalizeAttrGroup(item).rows) {
            // 同名重复时取第一条：清单里每个标签只出现一次，重复说明这份数据被改过。
            if (!saved.has(row.label)) saved.set(row.label, row);
        }
    }

    return ATTR_GROUPS.map((group) => ({
        title: group.title,
        rows: group.labels.map((label) => saved.get(label) ?? { label, value: '' }),
        ...('wide' in group ? { wide: true } : {}),
    }));
}

function normalizeGearStat(raw: unknown): GearStat | null {
    if (!isObject(raw)) return null;
    const label = text(raw.label);
    if (!label) return null;
    return {
        label,
        value: text(raw.value),
        extra: optionalText(raw.extra),
        gain: raw.gain === true ? true : undefined,
    };
}

function normalizeGearStats(raw: unknown): GearStat[] {
    return rows(raw).flatMap((stat) => {
        const normalized = normalizeGearStat(stat);
        return normalized ? [normalized] : [];
    });
}

function normalizeGearDetail(raw: unknown): GearDetail | undefined {
    if (!isObject(raw)) return undefined;
    const name = text(raw.name);
    const kind = text(raw.kind);
    /* 名称与类型都没填 = 这件还没录，不是「一件没有名字的装备」。
     * 造一个空壳会让浮片浮出一张白纸——比什么都不弹更让人以为坏了。 */
    if (!name && !kind) return undefined;

    const requires = rows(raw.requires).map(text).filter(Boolean);
    const lines = rows(raw.lines).flatMap((line) => {
        if (!isObject(line)) return [];
        const label = text(line.label);
        if (!label) return [];
        return [{ label, value: text(line.value), tone: asTone(line.tone) }];
    });

    return {
        name: name || kind,
        flavor: optionalText(raw.flavor),
        kind,
        requires: requires.length ? requires : undefined,
        stats: normalizeGearStats(raw.stats),
        cond: normalizeGearStats(raw.cond),
        lines: lines.length ? lines : undefined,
        foot: optionalText(raw.foot),
    };
}

/**
 * 十二格。**按部位对齐**而不是按数组下标：存进去的顺序可能被改过、也可能少一格，
 * 而网格的行列是由 `GEAR_SLOTS` 的次序定的。缺的补空位——空位要占格，
 * 否则「少一件」与「没这一格」就分不开了。
 */
function normalizeGear(raw: unknown): GearSlot[] {
    const bySlot = new Map<string, Record<string, unknown>>();
    for (const item of rows(raw)) {
        if (!isObject(item)) continue;
        const slot = text(item.slot);
        if (slot) bySlot.set(slot, item);
    }

    return GEAR_SLOTS.map((slot) => {
        const item = bySlot.get(slot);
        if (!item) return { slot };
        const detail = normalizeGearDetail(item.detail);
        const caption = text(item.caption) || detail?.name;
        return detail ? { slot, caption, detail } : { slot, caption };
    });
}

function normalizePet(raw: unknown): Pet | null {
    if (!isObject(raw)) return null;
    const name = text(raw.name);
    if (!name) return null;
    const quality = isObject(raw.quality) ? raw.quality : {};
    const spirit = optionalInt(raw.spirit);

    return {
        name,
        level: int(raw.level),
        joinLevel: int(raw.joinLevel),
        quality: {
            attack: int(quality.attack),
            defense: int(quality.defense),
            hp: int(quality.hp),
            mp: int(quality.mp),
            speed: int(quality.speed),
            dodge: int(quality.dodge),
        },
        life: int(raw.life),
        growth: text(raw.growth),
        element: text(raw.element),
        attrs: rows(raw.attrs).flatMap((attr) => {
            if (!isObject(attr)) return [];
            const label = text(attr.label);
            return label ? [{ label, value: text(attr.value) }] : [];
        }),
        skills: rows(raw.skills).map(text).filter(Boolean),
        innerPills: rows(raw.innerPills).map(text).filter(Boolean),
        spirit,
    };
}

/**
 * 修炼：**按固定清单重建**，只从存下来的数据里取等级（与属性表同一条哲学）。
 *
 * 老存档里可能有过改过的组名、加过的项、调过的上限（上一版编辑器三样都能改）。
 * 现在这些都归位：组名与项名照 `TRAINING_GROUPS`，上限照常量，清单外的项丢掉，
 * 缺的补空；**已练的等级按项名对回去**——改个组名不该把十个数抹掉。
 */
function normalizeTrainings(raw: unknown): TrainingGroup[] {
    const saved = new Map<string, number>();
    for (const group of rows(raw)) {
        if (!isObject(group)) continue;
        for (const row of rows(group.rows)) {
            if (!isObject(row)) continue;
            const name = text(row.name);
            // 同名取第一条：清单里每项只出现一次，重复说明这份数据被改过。
            if (name && !saved.has(name)) saved.set(name, int(row.level));
        }
    }

    return TRAINING_GROUPS.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => ({
            name: row.name,
            level: saved.get(row.name) ?? 0,
            cap: row.cap,
        })),
    }));
}

/**
 * 区服 / 帮派的取值：先读具名字段，读不到再回到上一版的 `subs` 数组按行取。
 *
 * 上一版表单是一个自由多行的「副题」，一行为一条：`['陕西区 · 大雁塔', '帮派 大唐芙蓉园',
 * '今天 14:48']`。老数据还在 `localStorage` 里，直接不看它会让人以为「改版把区服弄丢了」。
 * 第三行（更新时间）没有对应字段，也不要——它是手抄的，现在连入口都没有。
 */
function legacyLines(character: Record<string, unknown>, key: string, index: number): string {
    const own = text(character[key]);
    if (own) return own;
    return rows(character.subs).map(text).filter(Boolean)[index] ?? '';
}

/**
 * 一条来路不明的记录 → 合法的 `CharacterData`。**永不抛错**，字段缺什么补什么。
 *
 * `id` 是唯一不能丢的：页签的 `id` / `aria-controls`、`v-for` 的 key、编辑器的定位都靠它。
 * 丢了就补一个新的——重复的 id 会让两张卡的页签互相串（点第一张的「修炼」，
 * 第二张也跟着亮），那比「id 变了」难查得多。
 */
export function normalizeCharacter(raw: unknown): CharacterData {
    const character = isObject(raw) ? raw : {};
    const id = text(character.id) || makeId();
    const gearMeta = isObject(character.gearMeta) ? character.gearMeta : {};

    return {
        id,
        name: text(character.name),
        level: int(character.level),
        school: text(character.school),
        server: legacyLines(character, 'server', 0),
        guild: legacyLines(character, 'guild', 1).replace(/^帮派\s*[·:：]?\s*/, ''),
        attrGroups: normalizeAttrGroups(character),
        experience: {
            value: text(isObject(character.experience) ? character.experience.value : ''),
            need: text(isObject(character.experience) ? character.experience.need : ''),
        },
        skills: normalizeSkills(character.skills),
        assists: normalizeAssists(character.assists),
        trainings: normalizeTrainings(character.trainings),
        gear: normalizeGear(character.gear),
        gearMeta: { special: text(gearMeta.special), suit: text(gearMeta.suit) },
        pets: rows(character.pets)
            .map(normalizePet)
            .filter((pet): pet is Pet => pet !== null),
    };
}

/* ======================================================================
 * 序列化与存储
 * ==================================================================== */

/**
 * 读一份名册。返回 `null` 表示「没有可用数据」——没存过、不是 JSON、或不是数组。
 * 这三种都交给调用方决定是给种子还是给空名册，不在这一层替它选。
 */
export function parseRoster(raw: string | null): CharacterData[] | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        /* 非对象（`null`、字符串、数字）是**结构垃圾**，直接丢——留着会变成一条
         * 名字全空的卡片。对象哪怕字段全空也留着：那是录到一半的记录，
         * 「名字必填」由编辑器保证，不该在读取时替用户判死。 */
        return parsed.filter(isObject).map(normalizeCharacter);
    } catch {
        return null;
    }
}

export function serializeRoster(list: CharacterData[]): string {
    return JSON.stringify(list);
}

/**
 * `localStorage` 可能不存在（测试跑在 node 里）或被策略禁用，两种情况都按「读不到」处理：
 * 名册是这一页的**全部内容**，为了一个存储异常把整页打成白屏不值得。
 */
function readRaw(): string | null {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
        return null;
    }
}

function writeRaw(raw: string) {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, raw);
    } catch {
        // 写不进去（配额满、隐私模式）时界面照常工作，只是这次改动活不过重启。
    }
}

/** 首次启动的种子：`mock.ts` 里那两个角色。宁可给一份能改的样例，也不要一张空页。 */
function seed(): CharacterData[] {
    return CHARACTERS.map((character) => normalizeCharacter(character));
}

/* ======================================================================
 * 单例：页面与编辑器共用同一份
 * ==================================================================== */

/* 与 `use-font-scale.ts` / `use-dev-mode.ts` 同一条理由：状态放模块作用域，
 * 页面里 `v-for` 读它、编辑器保存时写它，各 new 一个就变成两份互不相干的名册。 */
const roster = ref<CharacterData[]>(loadRoster());

function loadRoster(): CharacterData[] {
    const parsed = parseRoster(readRaw());
    if (parsed) return parsed;
    const initial = seed();
    writeRaw(serializeRoster(initial));
    return initial;
}

function persist() {
    writeRaw(serializeRoster(roster.value));
}

export function useRoster() {
    /** 新增。返回新角色的 id，调用方拿它决定要不要接着打开编辑器。 */
    function add(character: CharacterData) {
        roster.value = [...roster.value, character];
        persist();
        return character.id;
    }

    /** 修改：按 id 整条替换。编辑器改的是一份草稿副本，走到这里才算落账。 */
    function update(character: CharacterData) {
        roster.value = roster.value.map((item) => (item.id === character.id ? character : item));
        persist();
    }

    function remove(id: string) {
        roster.value = roster.value.filter((item) => item.id !== id);
        persist();
    }

    return { roster, add, update, remove };
}
