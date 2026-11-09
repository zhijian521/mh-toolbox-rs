/**
 * 角色数据的字段契约。
 *
 * 这一份是**输入表单**与**截图 OCR** 共同的目标：前者往里填，后者往里猜，两条路
 * 最后都落到同一个结构上。所以它按「游戏里真有什么」定，不按「版式好不好看」定——
 * 2026-11-02 对着 13 张游戏截图逐项重定过一次。原先那份是照印象编的，差得不少：
 * 装备部位 11 个（实际 12 个，且把灵饰与玉魄混成了一类）、修炼 6 项（实际两组共 10 项）、
 * 属性分组的名字也是自造的。
 *
 * **三条取数规则**（用户 2026-11-02 明确）：
 *
 * 1. **只记上限，不记当前值**。游戏里气血写作 `3906/3916/3916`（当前 / 当前上限 /
 *    基础上限），我们取最大的那个 3916；魔法 `560/1440` 取 1440。当前值每回合都在变，
 *    记下来立刻过期，而「上限」才是这个号值多少钱的地方。
 * 2. **不做「师门法术」**。游戏里点开某个门派技能才会列出对应法术，属于二级内容；
 *    一页七条技能是给人扫的，展开成十四行反而读不出「哪几项满了」。
 * 3. **不做「锦衣」「法宝」**。前者是时装，换了不影响战力；后者有独立的灵气与主被动
 *    逻辑，跟装备不是一种东西。这两类连格子都不留——留着空格会让人以为「还没填」。
 */
/* 字段契约按领域拆分，游戏名录与数值规则统一从 public/game/data 装配。 */
import type { GearSlot } from './gear';
import type { Pet } from './pets';
import { TRAINING_GROUPS } from '../../services/game-rules';
export { ATTR_GROUPS, TRAINING_GROUPS } from '../../services/game-rules';

/** 卡内六个分区。顺序即页签顺序，也是键盘左右键的方向。 */
export const PANES = [
    { key: 'attrs', label: '属性' },
    { key: 'skills', label: '师门' },
    { key: 'assist', label: '辅助' },
    { key: 'training', label: '修炼' },
    { key: 'gear', label: '装备' },
    { key: 'pets', label: '召唤兽' },
] as const;

export type PaneKey = (typeof PANES)[number]['key'];

/* ======================================================================
 * 属性
 * ==================================================================== */

/**
 * 属性的一行。`label` 与它的位置都由 `ATTR_GROUPS` 定，这里只存**数值**。
 *
 * 原先还有一个 `sub`（数值后面的灰色小字），随着「属性表固定、只填数字」一起删了：
 * 没有任何入口能产生它，留着就是一个永远为空的字段。
 */
export interface AttrRow {
    label: string;
    value: string;
}

export interface AttrGroup {
    title: string;
    rows: AttrRow[];
    /**
     * 这一组**通栏占一行**（跨两列），内部再切成两格并排。
     *
     * 排版事实，由 `ATTR_GROUPS` 给、不由用户数据给：只有两项的分组并排才像一笔小计，
     * 单独占左半格会让右边空出半行，读成「另一项漏填了」。
     */
    wide?: boolean;
}

/**
 * 经验：单独一行，带一条进度条。
 *
 * 为什么从「资源」组里拎出来：它是唯一**有分母**的数——气血上限、伤害、帮贡都是一个
 * 静态的数，而经验的意义在于「离下一级还有多远」。混在六行资源里，它只是第六个数字；
 * 单独摆成一条，才读得出「这个号还要练多久」。
 *
 * 两个字段都是**原样文本**（`3,777.2万` / `4,200万`），不是数字：
 * 游戏里它带千分位与「万 / 亿」两种量纲，转数字要在录入时就决定单位，
 * 而用户可能这个号记「万」、那个号记「亿」。百分比在渲染时现算（`expPercent`）。
 */
export interface ExpRow {
    /** 当前经验。 */
    value: string;
    /** 升到下一级所需。留空表示不知道，那时不画进度。 */
    need: string;
}

/**
 * 把「3,777.2万」这类文本换算成以「万」为单位的数。认不出来（空、乱写）返回 `null`
 * ——宁可不算，也不要拿一个猜出来的数去画进度条。
 *
 * 单位只有「万」与「亿」两种：游戏里经验就这么写。没写单位按「万」算，
 * 与属性页历来只记「万」一致（`3,777.2` + `万` 后缀）。
 */
function parseWan(text: string): number | null {
    const compact = text.replace(/[,\s]/g, '');
    const matched = /^(\d+(?:\.\d+)?)(万|亿)?$/.exec(compact);
    if (!matched) return null;
    const amount = Number(matched[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = matched[2] === '亿' ? 10000 : 1;
    return amount * unit;
}

/**
 * 经验文本 → 以「万」为单位的数（`3968.6万` → 3968.6，`1.5亿` → 15000，
 * 不写单位按万算）。认不出返回 `null`。
 *
 * 单独导出而不只在 `expPercent` 里用，是因为**快速修改那一格也要它**：那一格只收数字，
 * 得先把「万 / 亿」折成同一个单位再摆进输入框。换算写两份的话，迟早一处认「亿」、
 * 一处不认——而那种偏差在界面上看着完全正常。
 */
export function expWanValue(text: string): number | null {
    return parseWan(text);
}

/**
 * 经验百分比（0–100）。任一值认不出、或所需为 0，返回 `null`——调用方据此把进度条
 * 画成空的，而不是画到 0%（「0%」与「不知道」在视觉上差别很大）。
 */
export function expPercent(value: string, need: string): number | null {
    const current = parseWan(value);
    const required = parseWan(need);
    if (current === null || required === null || required <= 0) return null;
    return Math.min(100, Math.max(0, (current / required) * 100));
}

/* ======================================================================
 * 师门 / 辅助
 * ==================================================================== */

/**
 * 技能一行。
 *
 * 只有 `level` 是必填。`cap` 缺席就不标满级——宁可少一个提示，也不猜一个错的。
 *
 * **师门技能的上限是 180**（用户 2026-11-02 明确）。此前一直没填 `cap`，
 * 是因为截图里同一等级有朱有白、看不出规则；现在按 180 记，`level >= 180` 才标「满」。
 */
export interface SkillRow {
    name: string;
    level: number;
    /** 满级值。给了才标朱色；不给就不标。 */
    cap?: number;
    /** 未学：灰一档，但**仍占一行**，否则「少一条」会被当成读漏。 */
    off?: boolean;
}

/** 练满了没有。`cap` 缺席 = 不知道上限，永远算不出「满」——猜一个数比不标更糟。 */
export function isMaxed(row: Pick<SkillRow, 'level' | 'cap'>): boolean {
    return row.cap !== undefined && row.level >= row.cap;
}

/**
 * 辅助技能分两类，**必须分开记**（用户 2026-11-02 要求合在一起显示，但语义不同）：
 *
 * - **生活技能**按等级练，可以到 100 以上（截图里强身术 100、打造 56），上限按等级段走。
 * - **剧情技能**按「技能点」学：调息的说明写着「每级消耗 3 点技能点，最高 5 级」，
 *   总数受人物等级限制，一个号通常只学两三样。
 *
 * 两者合在一页展示，是因为游戏里就是「辅助技能」一个入口、一屏格子；但数据上要分，
 * 否则「100 级」和「5 级」混在一列里会被当成同一种刻度。
 */
export type AssistKind = 'life' | 'story';

export interface AssistSkill extends SkillRow {
    kind: AssistKind;
}

/* ======================================================================
 * 修炼
 * ==================================================================== */

/**
 * 修炼按游戏原样分两组，**不是一组六项**：
 * `任务修炼`（攻/防/法/抗法/猎术，上限 20）与
 * `宠物修炼`（攻/防/法/抗法控制力 + 育兽术，其中育兽术上限 35）。
 *
 * 分成两组不是排版偏好——育兽术的上限跟另外四个都不一样，混成一组就必须给
 * 每一行单独存 `cap`，那又退回到「一行一个对象」。组是游戏自己划的，照抄最省事。
 */
export interface TrainingRow {
    name: string;
    level: number;
    /**
     * 这一项练到多少算满。
     *
     * **跟号走，不跟清单走**（2026-11-04）：游戏里的基线是 20（育兽术 35），
     * 但帮派与「修炼上限提升」会把它推高，同一个「攻击修炼」在 A 号是 20、在 B 号是 25。
     * 所以它是每行自己的数，可以在编辑页改；`TRAINING_GROUPS` 里的 cap 只是**默认值**。
     */
    cap: number;
}

export interface TrainingGroup {
    title: string;
    rows: TrainingRow[];
}

/**
 * 这一项的默认上限（20，育兽术 35）。编辑页拿它当上限格的占位字：
 * 那一格留空时，屏幕上那个淡字就是「存下去会变成的数」。
 *
 * 返回 `undefined` 表示项名不在清单里——那时不编一个默认值出来。
 */
export function trainingDefaultCap(name: string): number | undefined {
    return TRAINING_GROUPS.flatMap((group) => group.rows).find((row) => row.name === name)?.cap;
}
/* ======================================================================
 * 一个角色
 * ==================================================================== */

export interface CharacterData {
    id: string;
    name: string;
    level: number;
    school: string;
    /**
     * 区服与帮派：名字下面那行小字的两个**具名字段**。
     *
     * 上一版是一个自由的多行「副题」（`subs: string[]`，一行一条：区服 / 帮派 / 更新时间）。
     * 用户 2026-11-03 要求表单只收「区服 + 帮派」，于是把位置固化成两个字段——
     * 数组的玩法是「想记几条记几条」，而这两格是**游戏里就有的两项**，位置固定（§2.4-29
     * 的判据：数据是不是游戏给的）。更新时间没有入口了，随之删掉。
     */
    server: string;
    guild: string;
    /**
     * 属性五组，**顺序即网格顺序**（两行两列，行优先）：
     * 上排 `资源 / 名望`，下排 `战斗 / 加点`，最后是通栏的 `潜能`（用户 2026-11-02 定）。
     *
     * 不是「两列、每列两组」：名望只有 3 行、资源 4 行、战斗 6 行、加点 5 行，两列
     * 天然不等高，按列排时下排两组会被上一组的短拖着错位——左列「战斗」比右列
     * 「加点」高出一截。按行排，上下两排各自顶对齐，各组的位置只由顺序决定，
     * 返回去看的是同一张表。
     */
    attrGroups: AttrGroup[];
    /** 经验单独一行（带进度条），不占 `attrGroups` 的位置。 */
    experience: ExpRow;
    skills: SkillRow[];
    /** 辅助技能：生活 + 剧情，两类合在一页格子里。 */
    assists: AssistSkill[];
    /** 两组，结构固定（`TRAINING_GROUPS`）：任务修炼、宠物修炼。上限每行自带，界面只改等级。 */
    trainings: TrainingGroup[];
    gear: GearSlot[];
    gearMeta: { special: string; suit: string };
    pets: Pet[];
}

/* 老调用点（`roster.ts`、卡片、编辑器、测试）一律从本文件拿，这里补齐两份。
 * 新代码请直接 import `./gear` / `./pets`——re-export 是过渡，不是第二个入口。 */
export * from './gear';
export * from './pets';
