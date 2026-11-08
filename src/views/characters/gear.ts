/**
 * 装备：部位、版式坐标、部位图，以及「一件装备长什么样」。
 *
 * 2026-11-05 从 `character.ts` 拆出来（那份 718 行，装着一张卡的六个分区）。
 * 拆的界线是**域**不是「类型 / 常量」：这里的东西只服务装备这一页，属性与修炼那边
 * 一个字都用不上；而 `character.ts` 留下的是「一个角色由哪几块组成」。
 *
 * 对外仍然可以从 `character.ts` 拿（那边 re-export 了本文件），调用点不用改。
 * 新写的代码请直接 import 这里——re-export 是给老调用点的过渡，不是第二份入口。
 */

/* ======================================================================
 * 装备
 * ==================================================================== */

/**
 * 十二个部位，**顺序即存储顺序**（录入、归一化、JSON 都按它）。版式不看这个顺序，
 * 看下面的 `GEAR_LAYOUT`。
 *
 * 口径来自用户（2026-11-02）：「头 项链 武器 衣服 腰带 鞋子、以及灵饰的
 * 戒指 耳饰 配饰 手镯、还有玉魄的上古玉魄阴 上古玉魄阳。锦衣法宝不要。」
 * 注意第 9 位写作**配饰**——游戏内可能写作「佩饰」，以用户口径为准；
 * 真要改只动 `GEAR_SLOTS` 这一处。
 */
export const GEAR_SLOTS = [
    '头',
    '项链',
    '武器',
    '衣服',
    '腰带',
    '鞋子',
    '戒指',
    '耳饰',
    '配饰',
    '手镯',
    '玉魄·阴',
    '玉魄·阳',
] as const;

export type GearSlotName = (typeof GEAR_SLOTS)[number];

/**
 * 十二格在卡上的**位置**——照游戏「人物装备」面板（用户 2026-11-04 校正）。
 *
 * ```
 *   戒指  耳饰  配饰  手镯
 *   头   ┌────────┐  项链
 *   武器  │ 角色位 │  衣服
 *   腰带  └────────┘  鞋子
 *       玉魄阳 玉魄阴
 * ```
 *
 * **为什么单开一张表，不把顺序写进 `GEAR_SLOTS`**：那两份顺序回答的是不同的问题——
 * 一份是「存了哪十二格」（录入、归一化按它重建，改它等于改存档契约），
 * 一份是「每格画在哪」（纯版式，随时可调）。合成一张之后，想挪一格就得动数据契约。
 *
 * **位置是游戏给的，不是排版偏好**：玩家对面板的记忆就是「灵饰在上、身上六件左右分、
 * 玉魄在脚边」，换位置会让「头在哪」重新学一遍。所以这套坐标与 `ATTR_GROUPS` 一样
 * 属于「游戏里固定的表」（CONVENTIONS §2.4-29），写进代码而不是留给用户编辑。
 *
 * 中央 2 × 2（第 2–3 行、第 2–3 列）留空：那是人物位，暂时不画东西。
 */
export const GEAR_LAYOUT: Record<GearSlotName, { col: number; row: number }> = {
    戒指: { col: 1, row: 1 },
    耳饰: { col: 2, row: 1 },
    配饰: { col: 3, row: 1 },
    手镯: { col: 4, row: 1 },
    头: { col: 1, row: 2 },
    武器: { col: 1, row: 3 },
    腰带: { col: 1, row: 4 },
    项链: { col: 4, row: 2 },
    衣服: { col: 4, row: 3 },
    鞋子: { col: 4, row: 4 },
    '玉魄·阳': { col: 2, row: 4 },
    '玉魄·阴': { col: 3, row: 4 },
};

/**
 * 默认图（`public/game/icons/` 相对路径）：常规装备使用 60 级图，玉魄按阴阳固定。
 * 实际名称、性别和武器类别的匹配统一由 `gear-icons.ts` 处理。
 */
export const GEAR_SLOT_ICON: Record<GearSlotName, string | null> = {
    头: 'gear/gear-toukui-01.webp',
    项链: 'gear/gear-xianglian-01.webp',
    武器: 'weapon/weapon-jian-060.webp',
    衣服: 'gear/gear-kaijia-01.webp',
    腰带: 'gear/gear-yaodai-01.webp',
    鞋子: 'gear/gear-xiezi-01.webp',
    戒指: 'lingshi/ling-jiezhi-060.webp',
    耳饰: 'lingshi/ling-ershi-060.webp',
    配饰: 'lingshi/ling-peishi-060.webp',
    手镯: 'lingshi/ling-shouzhuo-060.webp',
    '玉魄·阴': 'yupo/yupo-yin.webp',
    '玉魄·阳': 'yupo/yupo-yang.webp',
};

/**
 * 装备「特效」的全集（18 项，2026-11-02 照游戏列表逐项抄下）。
 *
 * **特效与特技是两件事，别混**：
 * - **特效**是被动属性，穿上就生效——神佑、愤怒、简易、无级别限制都是它，
 *   一件装备可以有多个，没有等级也没有主动使用。
 * - **特技**是主动技能，要消耗愤怒值手动放——破血狂攻、慈航普度、起死回生。
 *
 * 混用会直接写出不存在的词：`mock.ts` 里一度把「变化之术」（那是剧情技能）
 * 和「回春之术」（不存在）当成特效填进去，而页面照常渲染、看不出错。
 * `gear.test.ts` 用这张表盯着这件事。
 *
 * 「无级别限制」常被简写成装备名前缀（「无级别·霜冷九州」），
 * 但它在数据里是**特效**，不是 `kind` 的一部分。
 */
export const GEAR_SPECIALS = [
    '神佑',
    '珍宝',
    '必中',
    '迷踪',
    '愤怒',
    '神农',
    '简易',
    '无级别限制',
    '永不磨损',
    '坚固',
    '狩猎',
    '绝杀',
    '专注',
    '伪装',
    '易修理',
    '暴怒',
    '精致',
    '再生',
] as const;

/**
 * 装备「特技」的全集（69 项，2026-11-02 照游戏六页列表逐项抄下）。
 *
 * 与 `GEAR_SPECIALS` 是一对反义词：
 * - **特技**（这张表）：主动技能，**消耗愤怒值**手动放。气疗术 30 点、
 *   起死回生、慈航普度、破血狂攻都在这儿。一回合只能放一个。
 * - **特效**（上面那张）：被动属性，穿上就生效，没有消耗也没有 CD。
 *
 * 名字叫「特技」不叫「技能」，是为了跟门派技能、剧情技能区分开——
 * 后者学一次就永久生效，前者要愤怒、要回合。
 *
 * 只收了名字：每个特技的**效果文本与愤怒消耗**（如气疗术「恢复（上限 3%+200）
 * 的气血，对单人使用 / 消耗 30 点愤怒」）没有逐项抄，那是 69 条说明文，
 * 等真要在页面上显示时再补。
 *
 * 分页注释照游戏底部的六个圆点保留——按页记，将来核对时能定位到第几页。
 */
export const GEAR_ACTIVES = [
    /* 第 1 页 */
    '气疗术',
    '心疗术',
    '命疗术',
    '凝气诀',
    '凝神诀',
    '气归术',
    '命归术',
    '四海升平',
    '回魂咒',
    '起死回生',
    '水清诀',
    '冰清诀',
    /* 第 2 页 */
    '玉清诀',
    '晶清诀',
    '诅咒之伤',
    '诅咒之亡',
    '笑里藏刀',
    '绝幻魔音',
    '野兽之力',
    '魔兽之印',
    '光辉之甲',
    '圣灵之甲',
    '流云诀',
    '啸风诀',
    /* 第 3 页 */
    '太极护法',
    '罗汉金钟',
    '修罗咒',
    '天衣无缝',
    '放下屠刀',
    '河东狮吼',
    '破甲术',
    '碎甲术',
    '凝滞术',
    '停陷术',
    '破血狂攻',
    '弱点击破',
    /* 第 4 页 */
    '吸血',
    '残月',
    '冥王暴杀',
    '乾坤斩',
    '破碎无双',
    '帝释无双',
    '伽罗无双',
    '虚空之刃',
    '亡灵之刃',
    '死亡之音',
    '身似菩提',
    '心如明镜',
    /* 第 5 页 */
    '慈航普度',
    '移形换影',
    '凝心诀',
    '聚精会神',
    '先发制人',
    '燃烧之光',
    '毁灭之光',
    '金刚不坏',
    '菩提心佑',
    '金刚怒目',
    '琴音三叠',
    '乾坤挪移',
    /* 第 6 页（只有 9 项） */
    '疾风荡魄',
    '玄鸟之灵',
    '神鸟之印',
    '伯牙绝弦',
    '焚琴煮鹤',
    '攻心术',
    '惊心术',
    '妙法之护',
    '神机之护',
] as const;

/** 配色的三个语义档：朱（特技）、赭（套装）、苔（打造附加）。 */
export type GearTone = 'seal' | 'ochre' | 'moss';

export type GearStatGroup = 'base' | 'extra' | 'gem' | 'melt';

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
