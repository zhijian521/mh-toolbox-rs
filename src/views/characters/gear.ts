/** 装备字段契约与摘要算法。游戏名录、部位规则和图标映射见 public/game/data/character-rules.json。 */
import type { GearSlotName } from '../../services/game-rules';
export {
    GEAR_SLOTS,
    GEAR_LAYOUT,
    GEAR_SLOT_ICON,
    GEAR_SPECIALS,
    GEAR_TRAITS,
    GEAR_JADE_EFFECTS,
    GEAR_ACTIVES,
} from '../../services/game-rules';
export type { GearSlotName } from '../../services/game-rules';

/** 配色的三个语义档：朱（特技）、赭（套装）、苔（打造附加）。 */
export type GearTone = 'seal' | 'ochre' | 'moss';

export type GearStatGroup = 'base' | 'extra' | 'gem' | 'melt' | 'trait';

/** 装备的一条属性。 */
export interface GearStat {
    label: string;
    value: string;
    /** 手工录入的属性分类；截图未给分类时由部位与词条判断。 */
    group?: GearStatGroup;
    /**
     * 方括号里的那个数，如 `物理暴击等级 +8 [+16]` 的 `+16`。
     * 游戏里它是「精炼/灵尘能推到多少」，与前面的值差一档颜色。
     */
    extra?: string;
    /** 打造或镶嵌附加的绿字。 */
    gain?: boolean;
}

/**
 * 装备详情：鼠标停在一格上时浮出来的那张纸。
 *
 * 分六段而不是原来的四段，是因为对着四张真实悬浮图数下来，一件装备至少有
 * 「风味文本 / 条件 / 白字 / 状态 / 特殊 / 制造者」六层——原先只留
 * `base`（白字）与 `gain`（绿字）两段，真实数据里「耐久 191 · 修理失败 1 次」
 * 这种必须显示的状态没地方放。
 */
export interface GearDetail {
    name: string;
    /** 风味描述，游戏里那段斜体的来历。没有就不显示。 */
    flavor?: string;
    /** 类型行：`帽子` / `双剑 · 女` / `灵饰 · 戒指` / `上古玉魄 · 阳`。 */
    kind: string;
    /** 装备条件：`等级 80`、`男`、`五行 木`。合成一行显示。 */
    requires?: string[];
    /** 白字与绿字属性。 */
    stats: GearStat[];
    /** 耐久、修理失败、锻炼/精炼/灵尘等级、镶嵌宝石。 */
    cond?: GearStat[];
    /** 特技 / 特效 / 套装效果。 */
    lines?: { label: string; value: string; tone?: GearTone }[];
    /** 制造者之类。 */
    foot?: string;
    /** 自用备注，与截图识别出的装备属性分开保存。 */
    note?: string;
}

/** 一格。`detail` 缺席即空位——**空位要占格**，否则「少一件」与「没这一格」分不开。 */
export interface GearSlot {
    slot: GearSlotName;
    /** 格内显示的短名，通常是装备名；太长会省略号截断。 */
    caption?: string;
    detail?: GearDetail;
}

/** 只填属性或备注也算内容；预置的空输入行不算一件装备。 */
export function hasGearDetail(detail: GearDetail | undefined): boolean {
    if (!detail) return false;
    return Boolean(
        [detail.name, detail.kind, detail.flavor, detail.foot, detail.note].some((value) =>
            value?.trim(),
        ) ||
        detail.requires?.some((value) => value.trim()) ||
        [...detail.stats, ...(detail.cond ?? []), ...(detail.lines ?? [])].some(
            (row) => row.value.trim() || ('extra' in row && row.extra?.trim()),
        ),
    );
}

/* ======================================================================
 * 版心摘要（2026-11-06）
 *
 * 用户：「装备卡片中间展示的信息太少了，可以分几个区块展示，各个装备、灵饰、段数
 * 之类的重要信息——装备特技、镶嵌宝石段数、套装、灵饰的段数、钟灵石以及段数、
 * 玉魄的段数、奇袭道具、奇袭特技。」
 *
 * 这些信息**本来就在十二件装备各自的 `detail` 里**，只是散着：特技与套装在 `lines`，
 * 宝石与各种段数在 `cond`。所以这里一个字都不新存，全部从 `gear` 现算——
 * 录入那边填什么，版心就显示什么，不存在「摘要忘了同步」这回事。
 *
 * 两处**兜底**：特技与套装在 `gearMeta` 里另有一份手填的汇总（导入/OCR 那条路只
 * 给这两个字段）。detail 里读到时用 detail 的，读不到才退回 `gearMeta`。
 *
 * 分三组不是装饰：七行平铺是一条长表，分组之后读成「效果 / 段数 / 奇袭」三块，
 * 正好对应玩家看这套装备时的三个问题。
 * ==================================================================== */

/** 摘要的一行。`value` 为空串 = 整套装备里没有这一项，渲染成淡「—」。 */
export interface BriefRow {
    key: string;
    label: string;
    value: string;
}

/** 摘要的一组。`key` 只用来做 `v-for` 的键与样式钩子。 */
export interface BriefGroup {
    key: string;
    rows: BriefRow[];
}

/** 不换行空格。摘要的值只放得下两行，得把「5 / 5」「4 段」这种组合绑住，
 * 不然会断在数字与单位之间（实测「红玛瑙 4」换行后「段」单独掉到第二行）。 */
const NBSP = '\u00A0';

/**
 * 把十二件装备的明细汇总成七行摘要。
 *
 * 取数规则（每条都对着 mock 里那套真实截图转录的数据写过一遍）：
 *   · `lines` 里 `特技` / `套装`：直接取；
 *   · `cond` 里 `镶嵌宝石` + `锻炼等级`：拼成「太阳石 5 段」——宝石那一件几段，
 *     游戏面板上就是把这两个数并排读的；
 *   · `cond` 里 `精炼等级`：灵饰四件的段数；`灵尘等级`：玉魄两件的段数；
 *   · `cond` 里带「钟灵石」的那一条（品名与段数都是自由文本，原样取）；
 *   · `lines` 里 `奇袭道具` / `奇袭特技`。
 *
 * 值为「空」的项**跳过**（游戏里没配就是那个字），否则摘要上会出现四个「空」。
 */
export function gearBrief(gear: GearSlot[], meta: { special: string; suit: string }): BriefGroup[] {
    const specials: string[] = [];
    const suits: string[] = [];
    const gems: string[] = [];
    const refines: string[] = [];
    const bells: string[] = [];
    const souls: string[] = [];
    const props: string[] = [];
    const arts: string[] = [];

    for (const slot of gear) {
        const detail = slot.detail;
        if (!detail) continue;

        for (const line of detail.lines ?? []) {
            const value = line.value.trim();
            if (!value || value === '空') continue;
            if (line.label === '特技') specials.push(value);
            else if (line.label === '套装') suits.push(value);
            else if (line.label === '奇袭道具') props.push(value);
            else if (line.label === '奇袭特技') arts.push(value);
        }

        const cond = detail.cond ?? [];
        /* 按**关键词**认，不按全名：状态那一段是自由行（编辑器里用户自己写标签），
         * 同一行可能写成「镶嵌宝石」也可能写「宝石」。关键词之间不会互相误伤——
         * 「精炼」与「灵尘」是两种段数，字面上没有交集。 */
        const at = (keyword: string) =>
            cond.find((one) => one.label.includes(keyword))?.value.trim() ?? '';

        const gem = at('宝石');
        if (gem) {
            const level = at('锻炼');
            /* 「太阳石 5 段」里的空格换成不换行空格：值只放得下两行，
             * 让它断在「4」和「段」之间（实测就是这个位置）会孤零零掉一个字下来。
             * 绑住之后唯一的断点在两件装备之间的「 · 」。 */
            gems.push(level ? `${gem}${NBSP}${level}${NBSP}段` : gem);
        }

        const refine = at('精炼');
        if (refine) refines.push(refine);

        const bell = at('钟灵石');
        if (bell) bells.push(bell);

        const soul = at('灵尘');
        if (soul) souls.push(soul);
    }

    const ambush = [
        props.length ? `道具 ${props.join(' · ')}` : '',
        arts.length ? `特技 ${arts.join(' · ')}` : '',
    ]
        .filter(Boolean)
        .join(' · ');

    /* 特技与套装**去重**：同一套效果常写在两件上（mock 里戒指和衣服各记了一遍
     * 「慈悲 3 / 5」），原样拼会读成「凑了两套」。宝石不去重——四件各镶各的，
     * 同一种宝石分在两件上也是两笔。 */
    const unique = (list: string[]) => [...new Set(list)];

    /* 「5 / 5」「4 / 3 / 3 / 2」里的空格都换成不换行空格：这些是**一个数**被
     * 斜杠串起来，断在中间等于看错段数。 */
    const slash = (list: string[]) => list.join(`${NBSP}/${NBSP}`);
    const pair = (value: string) => value.replace(/\s*\/\s*/g, `${NBSP}/${NBSP}`);

    return [
        {
            key: 'effect',
            rows: [
                {
                    key: 'special',
                    label: '特技',
                    value: unique(specials).join(' · ') || meta.special,
                },
                {
                    key: 'suit',
                    label: '套装',
                    value: unique(suits).map(pair).join(' · ') || meta.suit,
                },
            ],
        },
        {
            key: 'level',
            rows: [
                { key: 'gem', label: '宝石', value: gems.join(' · ') },
                // 「精炼」「灵尘」是这种段数在游戏里的名字。只留数字的话，
                // 「灵饰 4 / 3 / 3 / 2」得先猜「4 是什么」才读得懂。
                {
                    key: 'refine',
                    label: '灵饰',
                    value: refines.length ? `精炼${NBSP}${slash(refines)}` : '',
                },
                { key: 'bell', label: '钟灵石', value: bells.join(' · ') },
                {
                    key: 'soul',
                    label: '玉魄',
                    value: souls.length ? `灵尘${NBSP}${slash(souls)}` : '',
                },
            ],
        },
        {
            key: 'ambush',
            rows: [{ key: 'ambush', label: '奇袭', value: ambush }],
        },
    ];
}
