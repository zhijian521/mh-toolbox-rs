import type { DeepReadonly } from 'vue';
/** 装备字段契约与摘要算法。游戏名录、部位规则和图标映射见 public/game/data/character-rules.json。 */
import {
    GEAR_RULES,
    GEAR_SLOTS,
    GEAR_SUIT_ACTIVE_COUNT,
    type GearSlotName,
} from '../../services/game-rules';
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

/** 命魂之玉是阴阳玉魄共用的载体，属性只保存一份。 */
export interface GearMeta {
    special: string;
    suit: string;
    soul?: GearStat[];
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
    /**
     * 装备等级：只记一个数（用户 2026-11-11：「等级条件，修改为等级，我们只记录等级即可」）。
     * 旧档把它记在 `requires` 的「等级 80」里，归一化时抽到这一格（见 `normalizeGearDetail`）。
     */
    level?: number;
    /**
     * 余下的装备条件原文：`五行 木`、`装备角色 男`。**界面不再编辑**（只编等级），
     * 截图识别照旧写进来——浮片要读，换图也要靠它认女装（`gear-icons` 的 `女|发钗|发冠`）。
     */
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
    /** 仓库身份随物品保留，空位不保留旧物品编号。 */
    warehouseId?: string;
    slot: GearSlotName;
    /** 格内显示的短名，通常是装备名；太长会省略号截断。 */
    caption?: string;
    detail?: GearDetail;
}

/** 只填属性或备注也算内容；预置的空输入行不算一件装备。 */
export function hasGearDetail(detail: ReadonlyGearDetail | undefined): boolean {
    if (!detail) return false;
    return Boolean(
        [detail.name, detail.kind, detail.flavor, detail.foot, detail.note].some((value) =>
            value?.trim(),
        ) ||
        (detail.level ?? 0) > 0 ||
        detail.requires?.some((value) => value.trim()) ||
        [...detail.stats, ...(detail.cond ?? []), ...(detail.lines ?? [])].some(
            (row) => row.value.trim() || ('extra' in row && row.extra?.trim()),
        ),
    );
}

/** 中央总览保留特技、普通特效、装备套装与三组强化；灵饰套装、玉魄奇袭和命魂不参与。 */

/** 摘要里的一格：前半截是部位首字或名字，后半截是段数 / `*件数`（空串 = 只有名字）。 */
export interface BriefItem {
    name: string;
    value: string;
    /** 退灰：套装不足三件、段数为 0。 */
    dim?: boolean;
}

/** 摘要的一行。`items` 为空 = 整套装备里没有这一项，渲染成淡「—」。 */
export interface BriefRow {
    key: string;
    label: string;
    items: BriefItem[];
    /** 每一格包进一枚数值签（`NumTag`）：只有段数三行，它们是**读数**。 */
    tag?: boolean;
    /**
     * 排成几列（设了就进等宽栅格，不设就走一条流）。
     *
     * 它是**列数**不是「每行几件」：六件给 3 就是三列两行，四件给 4 是一行四列。
     * 列宽不由这里定（CSS 的 `--brief-tag-w` 定死），否则每行各均分一次，
     * 同一枚签在宝石行 47 宽、在灵饰行 28 宽。
     */
    perRow?: number;
}

/** 摘要的一组。`key` 只用来做 `v-for` 的键与样式钩子。 */
export interface BriefGroup {
    key: string;
    rows: BriefRow[];
}

/** 一行压成一句，供 `title` 与测试读：`头6 · 项5`。 */
export function briefText(row: BriefRow): string {
    return row.items.map((item) => item.name + item.value).join(' · ');
}

/** 串里第一个数：`5` / `5 段` / `固若金汤(1级)` 分别给出 5 / 5 / 1。读不到给空串。 */
function firstNumber(value: string): string {
    return /(\d+(?:\.\d+)?)/.exec(value)?.[1] ?? '';
}

/**
 * 部位首字：`头` `项链`→`项` `武器`→`武`；玉魄取破折号后面那一个字（阴 / 阳）。
 *
 * 只取一个字是版心逼出来的：一行要塞六件，两个字的部位名（项链 / 戒指 / 耳饰）
 * 写全就只放得下三件，剩下的换行到第二行反而更难数。
 */
export function slotMark(slot: string): string {
    const tail = slot.split('·').pop()?.trim() || slot;
    if (slot.includes('·')) return tail;
    /* 「腰带」取的是「带」不是「腰」：其余五件取的都是**那件东西**的字（头 / 项 / 武 /
     * 衣 / 鞋），腰是部位、带才是东西；版心那行读成「衣 带 鞋」也对得上这一列。 */
    return tail === '腰带' ? '带' : tail.slice(0, 1);
}

/** 十二个部位分成装备 / 灵饰 / 玉魄三档；表没装配好时按名字猜，摘要不会因此空白。 */
function slotCategory(slot: GearSlotName): 'equipment' | 'spirit' | 'jade' {
    const rule = GEAR_RULES[slot];
    if (rule) return rule.category;
    if (slot.startsWith('玉魄')) return 'jade';
    return ['戒指', '耳饰', '配饰', '手镯'].includes(slot) ? 'spirit' : 'equipment';
}

/**
 * 套装名：剥掉游戏面板尾部那截件数（`天罡 5 / 5`、`慈悲(3/5)`、`天罡*5`）。
 *
 * 件数由这一层数出来，不抄面板上的数：面板写的是「凑满几件出效果」，而摘要要
 * 回答的是「身上现在有几件」，两者只有凑巧相等的时候。
 */
function suitName(value: string): string {
    return value
        .replace(/[（(]\s*\d+\s*\/\s*\d+\s*[)）]\s*$/, '')
        .replace(/\s*\d+\s*\/\s*\d+\s*$/, '')
        .replace(/\s*\*\s*\d+\s*$/, '')
        .trim();
}

/** 未达到资源表中的激活件数时退灰，提示套装尚未激活。 */
export function gearBrief(
    gear: readonly ReadonlyGearSlot[],
    meta: { special: string; suit: string },
): BriefGroup[] {
    const bySlot = new Map<GearSlotName, ReadonlyGearSlot>();
    for (const one of gear) bySlot.set(one.slot, one);
    /* 顺序**不由传入数组决定**：名册每次读档都重建十二格，但截图预览、测试里传进来的
     * 可能只有几件。按 `GEAR_SLOTS`（游戏面板的顺序）走，缺的那几件才算得出 0。 */
    const order: GearSlotName[] = GEAR_SLOTS.length ? [...GEAR_SLOTS] : [...bySlot.keys()];

    const at = (slot: GearSlotName, keyword: string) =>
        (bySlot.get(slot)?.detail?.cond ?? [])
            .find((row) => row.label.includes(keyword))
            ?.value.trim() ?? '';
    const effect = (slot: GearSlotName, labels: string[]) =>
        (bySlot.get(slot)?.detail?.lines ?? [])
            .find((row) => labels.includes(row.label))
            ?.value.trim() ?? '';

    /* 特技 / 特效：读得到就列名去重（同一件特效常写在两件上，比如两件都带「专注」）。
     * 特技读不到才退回手填的汇总；特效没有兜底来源（`gearMeta` 里没这一项）。 */
    const named = (labels: string[]): string[] => {
        const names: string[] = [];
        for (const slot of order) {
            if (labels.includes('特技') && slotCategory(slot) !== 'equipment') continue;
            for (const row of bySlot.get(slot)?.detail?.lines ?? []) {
                if (!labels.includes(row.label)) continue;
                const value = row.value.trim();
                // 逐行排除旧档的钟灵石套装，不能漏掉同一件灵饰后面的普通特效。
                if (slotCategory(slot) === 'spirit' && /[（(]\s*\d+\s*级\s*[)）]\s*$/.test(value))
                    continue;
                if (value && value !== '空' && !names.includes(value)) names.push(value);
            }
        }
        return names;
    };
    const specials = named(['特技']);
    if (!specials.length && meta.special.trim()) specials.push(meta.special.trim());
    const traits = named(['特效']);

    /* 套装：按名字数件数，顺序跟着装备走（先出现的那件决定顺序）。 */
    const suits = new Map<string, number>();
    for (const slot of order) {
        if (slotCategory(slot) !== 'equipment') continue;
        const value = effect(slot, ['套装', '套装效果']);
        if (!value || value === '空') continue;
        const name = suitName(value);
        if (!name) continue;
        suits.set(name, (suits.get(name) ?? 0) + 1);
    }
    if (!suits.size && meta.suit.trim()) {
        /* 兜底那条路没有分件信息，只能读手填那句里的件数（`天罡 5/5`）。读不到就
         * 只写名字、不画星号，也不判激活——不知道件数时装作知道是更坏的错。 */
        const claim = firstNumber(meta.suit);
        const count = Number(claim);
        if (claim && count >= 1) suits.set(suitName(meta.suit) || meta.suit.trim(), count);
        else suits.set(suitName(meta.suit) || meta.suit.trim(), 0);
    }

    /** 强化数的一行：按部位固定顺序，一件一格，没练的写 0。 */
    const levelRow = (
        key: string,
        label: string,
        category: 'equipment' | 'spirit' | 'jade',
        keyword: string,
        perRow?: number,
    ): BriefRow => ({
        key,
        label,
        tag: true,
        perRow,
        items: order
            .filter((slot) => slotCategory(slot) === category)
            .map((slot) => {
                const level = firstNumber(at(slot, keyword));
                return {
                    name: slotMark(slot),
                    value: level || '0',
                    dim: !level || Number(level) === 0,
                };
            }),
    });

    return [
        {
            key: 'effect',
            rows: [
                {
                    key: 'special',
                    label: '特技',
                    items: specials.map((name): BriefItem => ({ name, value: '' })),
                },
                {
                    key: 'trait',
                    label: '特效',
                    items: traits.map((name): BriefItem => ({ name, value: '' })),
                },
                {
                    key: 'suit',
                    label: '套装',
                    items: [...suits].map(([name, count]): BriefItem => ({
                        name,
                        value: count ? `*${count}` : '',
                        dim: count > 0 && count < GEAR_SUIT_ACTIVE_COUNT,
                    })),
                },
            ],
        },
        {
            key: 'level',
            rows: [
                /* 三行都给 `perRow`，列数按「值列放得下几枚签」定：签宽 32 + 列距 4，
                 * 值列 151 里最多摆四列（140）。所以宝石六格排三列两行，灵饰四格一行，
                 * 玉魄两格一行。**列宽是三行共用的同一个数**，不是各行均分——
                 * 均分会让宝石一枚 47、灵饰一枚 28（2026-11-10 实测），
                 * 同一种读数各长各的。 */
                levelRow('gem', '宝石', 'equipment', '锻炼', 3),
                levelRow('refine', '灵饰', 'spirit', '精炼', 4),
                levelRow('soul', '玉魄', 'jade', '灵尘', 2),
            ],
        },
    ];
}

export type ReadonlyGearDetail = DeepReadonly<GearDetail>;
export type ReadonlyGearMeta = DeepReadonly<GearMeta>;
export type ReadonlyGearSlot = DeepReadonly<GearSlot>;
