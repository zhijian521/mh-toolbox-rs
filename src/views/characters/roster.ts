/**
 * 角色名册：SQLite / localStorage 双路径 + 增删改。
 *
 * 这是角色页第一份**真数据层**。此前 `mock.ts` 只是字面量，页面直接 `v-for` 上去；
 * 现在名册要能改、能删、能加，还必须活过重启——所以有一处持久化、一层逐字段兜底。
 *
 * ---- 存储：桌面版 SQLite / 浏览器 localStorage ----
 * `mh-store`（Rust 侧的 SQLite）已经起来了，桌面版由它持有；探针和 `npm run dev`
 * 没有 Tauri 宿主，仍退回 `localStorage`。两条路径的数据各自独立。
 *
 * 换存储这件事刻意压在**两个函数**里：读档 `loadRoster()`、落盘 `persist()`。
 * `useRoster()` 与所有页面代码一行不动——2026-11-03 从 localStorage 换到 SQLite
 * 时，改的确实只有这两个函数体。
 * 读档现在必须在 `mount` 之前 `await`（见 `main.ts`），所以 `roster` 初值是空数组。
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
import { hasDesktop } from '../../services/desktop';
import { charactersLoad, charactersSave } from '../../services/storage';
import { schoolNames } from '../../services/game-data';
import { createPersist } from '../../services/persist';
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
import {
    ATTR_GROUPS,
    GEAR_SLOTS,
    TRAINING_GROUPS,
    type AssistSkill,
    type AttrGroup,
    type AttrRow,
    type CharacterData,
    type GearSlot,
    type Pet,
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
export function defaultSchool(): string {
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
export function characterName(list: readonly CharacterData[], id: string): string {
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
function normalizeGear(raw: unknown): GearSlot[] {
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
    const id = text(character.id) || makeId('char');
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
        writeError.value = '这一笔没存下来，检查一下浏览器存储空间';
    }
}

/** 首次启动的种子：`mock.ts` 里那两个角色。宁可给一份能改的样例，也不要一张空页。
 *
 * **动态 `import()`**（2026-11-05）：`mock.ts` 是 34KB 的演示数据，而桌面版这一句永远
 * 走不到——零兼容之后不种演示角色（理由见 `loadRoster` 的注释），只有纯 web 开发那条
 * 路径会用。静态 import 会把它打进首包，等真要用时再取更划算。 */
async function seed(): Promise<CharacterData[]> {
    const { CHARACTERS } = await import('./mock');
    return CHARACTERS.map((character) => normalizeCharacter(character));
}

/* ======================================================================
 * 单例：页面与编辑器共用同一份
 * ==================================================================== */

/* 与 `use-font-scale.ts` / `use-dev-mode.ts` 同一条理由：状态放模块作用域，
 * 页面里 `v-for` 读它、编辑器保存时写它，各 new 一个就变成两份互不相干的名册。
 * **初值是空的**：真数据由 `loadRoster()` 在 mount 之前填（见 `main.ts`）。 */
const roster = ref<CharacterData[]>([]);

/**
 * 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。
 *
 * 与 `prices-store.ts` 的 `loadError` 同一件事：`charactersLoad()` 返回 `null` 是
 * 「没有 Tauri 宿主」**或**「调用失败」，两者在类型上分不开，但后果差得远。
 * 早先把它和「库里没有」并成一个分支（`stored === null || stored.length === 0`），
 * 于是一行坏 JSON 就能让整份名册被种子覆盖并**立刻写回库**，原数据无法恢复。
 * 现在读失败只挂这条错误位，界面照旧显示空名册但**拒绝任何写入**。
 */
const loadError = ref('');

/**
 * 读过一轮没有。`persist` 靠它挡住「还没读库就整份覆盖」——dev 里改一个文件，
 * 模块被重算、单例回到空数组，而 `loadRoster()` 只在启动时跑过，那种状态下任何一次
 * `add()` 都是 `characters_save([新角色])`。2026-11-04 实测因此丢了 4 个角色。
 */
const loaded = ref(false);

/**
 * 最近一次落盘失败的原因。空串 = 上一次写成功了（或还没写过）。
 *
 * 与 `prices-store.ts` 的 `writeError` 同一条：`charactersSave` 把失败打在控制台，
 * 而用户看不到控制台。写着「已保存」其实是空的，比报错更糟——所以这个值要能到界面上。
 */
const writeError = ref('');

/** 浏览器路径：读 `localStorage`，没存过就给一份能改的种子。 */
async function loadFromLocal(): Promise<CharacterData[]> {
    const parsed = parseRoster(readRaw());
    if (parsed) return parsed;
    const initial = await seed();
    writeRaw(serializeRoster(initial));
    return initial;
}

/**
 * 读档。**只能调一次，且在 mount 之前**。
 *
 * 桌面路径只有两步：读库 → 规范化。另外两件事都**故意不做**：
 * - **不搬 `localStorage` 那一版**。老版本数据一概不接（见 `lib.rs` 的 `DATA_DIR_NAME`），
 *   于是也不需要「搬过没有」的三态判断。
 * - **不种演示角色**。以前靠 `legacyImported` 标记区分「首次启动」与「用户把角色删光了」，
 *   标记随兼容一起删了；为三个假角色再加一条 meta 标记 + 两条命令不划算，而
 *   「删光之后重启又被塞回来一批」是明确不该发生的事。空名册是合法状态，界面有空态。
 *
 * 浏览器路径（纯 web 开发）照旧种种子——那里没有库、也没有「删光」之外的状态。
 */
export async function loadRoster(): Promise<void> {
    if (!hasDesktop()) {
        roster.value = await loadFromLocal();
        loaded.value = true;
        return;
    }

    const stored = await charactersLoad();
    /* 读失败（`null`）**不能**当「库里没有」：`charactersLoad` 的契约是
     * 「`null` = 没有宿主或调用失败」。一行坏 JSON（`store.rs` 的 `characters_load`
     * 遇到非法行整份返回 `Err`）就会走到这里，而那时如果写回，用户攒下来的名册就被
     * 顶掉了，且不可恢复。所以这条分支只挂错误位、把名册留空，绝不调用 `charactersSave`。 */
    if (stored === null) {
        loadError.value = '读不出角色名册，已暂停写入以免覆盖原有数据';
        roster.value = [];
        return;
    }
    loadError.value = '';

    loaded.value = true;
    roster.value = stored.map(normalizeCharacter);
}

/**
 * 落盘。
 *
 * 「读失败拒绝写（最后一道闸）、浏览器写本地、桌面版异步写库、连续写排队」这一整套在
 * `services/persist.ts` 的 `createPersist`——三份数据层共用一份。这里只说这份数据
 * 怎么落：整份 `CharacterData[]` 交给 `characters_save`，浏览器里序列化进 `mh-roster`。
 */
const persist = createPersist({
    label: '名册',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writeRaw(serializeRoster(roster.value)),
    writeRemote: () => charactersSave(roster.value),
});

export function useRoster() {
    /** 新增。返回新角色的 id，调用方拿它决定要不要接着打开编辑器。 */
    function add(character: CharacterData) {
        if (!persist.canWrite()) return character.id;
        roster.value = [...roster.value, character];
        persist();
        return character.id;
    }

    /** 修改：按 id 整条替换。编辑器改的是一份草稿副本，走到这里才算落账。 */
    function update(character: CharacterData) {
        if (!persist.canWrite()) return;
        roster.value = roster.value.map((item) => (item.id === character.id ? character : item));
        persist();
    }

    function remove(id: string) {
        if (!persist.canWrite()) return;
        roster.value = roster.value.filter((item) => item.id !== id);
        persist();
    }

    return {
        roster,
        loadError,
        writeError,
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        add,
        update,
        remove,
    };
}
