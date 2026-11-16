/** 角色名册的归一与模块级状态；保存统一记录成长历史，浏览器与桌面数据独立。 */
import { readonly, ref, watch } from 'vue';
import { readLocalData, writeLocalData, parseLocalList } from '../../services/local-data';
import { loadData } from '../../services/load-data';
import { charactersLoad, charactersSave } from '../../services/storage';
import { gameDataError, gameDataReady, schoolNames } from '../../services/game-data';
import { createPersist } from '../../services/persist';
import { normalizeGrowthHistory, withGrowthHistory, type GrowthEntry } from './growth-history';
/* 形状兜底全在 `services/shape.ts`（与物价页共用一份）。两个本地别名值得看清：
 *   `text`  ← `rawText`：名册这边**不 trim**，卡面上的字是用户写什么就显示什么；
 *   `int`   ← `stamp`  ：`Math.round` + 非有限数变 0，等级与时间戳共用同一条规则。 */
import {
    isObject,
    makeId,
    optionalInt,
    rawText as text,
    rows,
    stamp as int,
} from '../../services/shape';
import { GEAR_SLOTS, type GearSlot } from './gear';
import type { Pet } from './pets';
import {
    ATTR_GROUPS,
    TRAINING_GROUPS,
    type AssistSkill,
    type AttrGroup,
    type AttrRow,
    type CharacterData,
    type ReadonlyCharacter,
    type SkillRow,
    type TrainingGroup,
} from './character';
import { normalizeGearDetail, normalizePet } from './details';
import { schoolSkills } from './schools';

const STORAGE_KEY = 'mh-roster';

/* ======================================================================
 * 兜底：未知值 → 契约里的形状
 *
 * `isObject` / `text`（原样文本）/ `int` / `rows` / `makeId` 2026-11-03 提到
 * `services/shape.ts`——它们与 `prices.ts` 里那份逐字同义。这里只留**名册自己的**
 * 字段语义：可空缺省值、门派枚举。`text` 不 trim 这件事，见文件顶部的 import 注释。
 * ==================================================================== */

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

/** 修炼两组十项，结构来自 `TRAINING_GROUPS`，角色记录只填等级。 */
function blankTrainings(): TrainingGroup[] {
    return TRAINING_GROUPS.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => ({ name: row.name, level: 0 })),
    }));
}

/* 新 id 用 `services/shape.ts` 的 `makeId('char')`——原先这里有个不带参数的 `makeId`，
 * 与物价的 `makePriceId` 是同一套 randomUUID 回落算法，只有前缀不同。 */

/**
 * 新角色的默认门派：**表里的第一家**。
 *
 * 为什么要有默认值而不是「未选」：门派决定那七项技能，而「未选」这个名字本身
 * 也是用户 2026-11-03 明确要删掉的选项（下拉里不再出现）。留一个空门派，用户
 * 新建完进去看到的是「先选择门派」和一张空表——多一步，还容易被当成没加载上。
 * 默认值不是替他做决定：门派在弹窗第一屏，改一下就是七项重算（`schoolSkills`）。
 *
 * 表没加载上时返回空串（`loadGameData` 失败那条路），此时行为退回旧样：
 * 卡上没有门派、编辑页提示先选择门派。
 */
function defaultSchool(): string {
    return schoolNames()[0] ?? '';
}

/**
 * 角色 id → 名字。给账本那几行用（记录表、最近一笔、收益历史）。
 *
 * 2026-11-05 前**三处各写一份**、逐字相同：空 id 给「未指定」（那笔账本来就不挂角色，
 * 与「挂了但人没了」是两件事，不能都写「未知」），查不到给「已删角色」——后者必须
 * 明说，否则用户会以为那笔账记给了别人。
 *
 * 放这里而不是 `services/format.ts`：它要读名册，而名册是角色这一支的数据，
 * 呈现层不该知道「角色」是什么。
 */
export function characterName(
    list: readonly Pick<CharacterData, 'id' | 'name'>[],
    id: string,
): string {
    if (!id) return '未指定';
    return list.find((one) => one.id === id)?.name ?? '已删角色';
}

/** 新角色的骨架：该有的格子都在（12 个装备位、10 项修炼、七项门派技能），该空的都空着。 */
export function emptyCharacter(): CharacterData {
    const school = defaultSchool();
    return {
        id: makeId('char'),
        name: '',
        level: 0,
        school,
        server: '',
        guild: '',
        attrGroups: blankAttrGroups(),
        experience: { value: '', need: '' },
        skills: schoolSkills(school),
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
    // 缺失上限不补成 0，避免把「未记录」误当作一个实际数值。
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
        ...(group.wide === true ? { wide: true } : {}),
        rows: rows(group.rows).flatMap((row) => {
            if (!isObject(row)) return [];
            const label = text(row.label);
            if (!label) return [];
            return [{ label, value: text(row.value) }];
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
    if (!ATTR_GROUPS.length) return flat.map(normalizeAttrGroup);

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

/**
 * 十二格。**按部位对齐**而不是按数组下标：存进去的顺序可能被改过、也可能少一格，
 * 而网格的行列是由 `GEAR_SLOTS` 的次序定的。缺的补空位——空位要占格，
 * 否则「少一件」与「没这一格」就分不开了。
 */
export function normalizeGear(raw: unknown): GearSlot[] {
    const bySlot = new Map<string, Record<string, unknown>>();
    for (const item of rows(raw)) {
        if (!isObject(item)) continue;
        const slot = text(item.slot);
        if (slot) bySlot.set(slot, item);
    }

    const slots = GEAR_SLOTS.length ? GEAR_SLOTS : ([...bySlot.keys()] as GearSlot['slot'][]);
    return slots.map((slot) => {
        const item = bySlot.get(slot);
        if (!item) return { slot };
        const detail = normalizeGearDetail(item.detail);
        const caption = text(item.caption) || detail?.name;
        return detail ? { slot, caption, detail } : { slot, caption };
    });
}

/**
 * 修炼：结构按清单重建，只按项名对回等级。清单外的项丢弃，缺的补 0；
 * 旧存档里的 `cap` 不再进入角色记录。
 */
function normalizeTrainings(raw: unknown): TrainingGroup[] {
    if (!TRAINING_GROUPS.length) {
        return rows(raw)
            .filter(isObject)
            .map((group) => ({
                title: text(group.title),
                rows: rows(group.rows)
                    .filter(isObject)
                    .map((row) => ({
                        name: text(row.name),
                        level: int(row.level),
                    }))
                    .filter((row) => row.name),
            }));
    }
    const saved = new Map<string, number>();
    for (const group of rows(raw)) {
        if (!isObject(group)) continue;
        for (const row of rows(group.rows)) {
            if (!isObject(row)) continue;
            const name = text(row.name);
            // 同名取第一条：清单里每项只出现一次，重复说明这份数据被改过。
            if (name && !saved.has(name)) {
                saved.set(name, int(row.level));
            }
        }
    }

    return TRAINING_GROUPS.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => ({ name: row.name, level: saved.get(row.name) ?? 0 })),
    }));
}

/**
 * 区服 / 帮派的取值：先读具名字段，读不到再回到上一版的 `subs` 数组按行取。
 *
 * 上一版表单是一个自由多行的「副题」，一行为一条：`['陕西区 · 大雁塔', '帮派 大唐芙蓉园',
 * '今天 14:48']`。老数据还在 `localStorage` 里，直接不看它会让人以为「改版把区服弄丢了」。
 * 第三行是手抄的时间，不用它推断自动保存的 updatedAt。
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
    const id = text(character.id) || makeId('char');
    const updatedAt = int(character.updatedAt);
    const gearMeta = isObject(character.gearMeta) ? character.gearMeta : {};

    return {
        id,
        ...(Array.isArray(character.growthHistory)
            ? { growthHistory: normalizeGrowthHistory(character.growthHistory) }
            : {}),
        ...(updatedAt > 0 && updatedAt <= 8.64e15 ? { updatedAt } : {}),
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

/** 仅浏览器首次预览按需加载演示角色；桌面空库保持空名册。 */
async function seed(): Promise<CharacterData[]> {
    const { CHARACTERS } = await import('./mock');
    return CHARACTERS.map((character) => normalizeCharacter(character));
}

/* ======================================================================
 * 单例：页面与编辑器共用同一份
 * ==================================================================== */

/* 页面共享同一份名册；启动读取结束前不允许写入。 */
const roster = ref<CharacterData[]>([]);

/** 最近一次读取错误；非空时写队列拒绝覆盖。 */
const loadError = ref('');

/** 仅成功应用读取结果后开放写入。 */
const loaded = ref(false);

/**
 * 最近一次落盘失败的原因。空串 = 上一次写成功了（或还没写过）。
 *
 * 与 `prices-store.ts` 的 `writeError` 同一条：`charactersSave` 把失败打在控制台，
 * 而用户看不到控制台。写着「已保存」其实是空的，比报错更糟——所以这个值要能到界面上。
 */
const writeError = ref('');

/** 启动阶段读取，完成前由写队列阻止保存；旧版转换统一在启动导入入口处理。 */
export async function loadRoster(): Promise<void> {
    await loadData({
        loaded,
        loadError,
        error: '读不出角色名册，已暂停写入以免覆盖原有数据',
        readLocal: () =>
            readLocalData(STORAGE_KEY, (raw) =>
                parseLocalList(raw, (rows) =>
                    (rows as unknown[]).filter(isObject).map(normalizeCharacter),
                ),
            ),
        readRemote: charactersLoad,
        applyLocal: async (stored) => {
            roster.value = stored ?? (await seed());
        },
        applyRemote: (stored) => {
            roster.value = stored.map(normalizeCharacter);
        },
    });
}

/** 修改后排队保存当前全量；读取失败拒写，导出与关窗等待 flush。 */
const persist = createPersist({
    label: '名册',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, roster.value),
    writeRemote: () => charactersSave(roster.value),
});

// 首次加载失败后重试成功，只补全内存模板，不自动写盘或重新读取覆盖当前状态。
watch(
    gameDataReady,
    (ready) => {
        if (ready) roster.value = roster.value.map(normalizeCharacter);
    },
    { flush: 'sync' },
);

function canWriteRoster(): boolean {
    if (!persist.canWrite()) return false;
    if (gameDataReady.value) return true;
    writeError.value = gameDataError.value || '角色规则尚未加载，请重试后保存';
    return false;
}

export function useRoster() {
    /** 新增。返回新角色的 id，调用方拿它决定要不要接着打开编辑器。 */
    function add(character: ReadonlyCharacter) {
        if (!canWriteRoster()) return character.id;
        roster.value = [
            ...roster.value,
            { ...normalizeCharacter(character), updatedAt: Date.now() },
        ];
        persist();
        return character.id;
    }

    /** 修改：按 id 整条替换。编辑器改的是一份草稿副本，走到这里才算落账。 */
    function update(
        character: ReadonlyCharacter,
        source: GrowthEntry['source'] = 'edit',
        note = '',
    ) {
        if (!canWriteRoster()) return;
        const updatedAt = Date.now();
        const next = normalizeCharacter(character);
        roster.value = roster.value.map((item) =>
            item.id === character.id
                ? { ...withGrowthHistory(item, next, source, note, updatedAt), updatedAt }
                : item,
        );
        persist();
    }

    function remove(id: string) {
        if (!canWriteRoster()) return;
        roster.value = roster.value.filter((item) => item.id !== id);
        persist();
    }

    return {
        roster: readonly(roster),
        loadError,
        writeError,
        pending: persist.pending,
        flush: persist.flush,
        retry: () => {
            return canWriteRoster() ? persist() : Promise.resolve(false);
        },
        add,
        update,
        remove,
    };
}
