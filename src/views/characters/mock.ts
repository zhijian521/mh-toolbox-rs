/**
 * 角色页的演示数据。
 *
 * 这一份只为「把版式立起来」存在：接识别结果之前，页面上写什么全在这儿。
 * 换成真实数据时**只换数据源，不动模板**——`CharacterCard` 的入参就是下面这些类型。
 *
 * 不放进 `services/`：`ghost-*.ts` 那一套有解析、有兜底、有单测，是业务逻辑；
 * 这里没有一行逻辑，只有字面量，放在页面旁边才不会让人以为它算半个数据层。
 */

/** 卡内五个分区。顺序即页签顺序，也是默认停留的顺序（第一项）。 */
export const PANES = [
    { key: 'attrs', label: '属性' },
    { key: 'skills', label: '师门' },
    { key: 'assist', label: '辅助' },
    { key: 'training', label: '修炼' },
    { key: 'gear', label: '装备' },
] as const;

export type PaneKey = (typeof PANES)[number]['key'];

/** 属性的一行。`sub` 是灰色后缀：上限（`/3916`）或单位（`万`）。 */
export interface AttrRow {
    label: string;
    value: string;
    sub?: string;
    /** 这个角色的主项（物理系看伤害、辅助系看防御），用朱色标出来。 */
    strong?: boolean;
}

export interface AttrGroup {
    title: string;
    rows: AttrRow[];
}

/** 师门 / 辅助技能共用。`max` 是「满级」，`off` 是「未学」——两者都是给对方看的信号。 */
export interface SkillRow {
    name: string;
    level: number;
    tag: string;
    max?: boolean;
    off?: boolean;
}

/** 修炼。进度条按 `value / cap` 算宽度，`done` 由两者相等推出，不再单独存一个字段。 */
export interface TrainingRow {
    name: string;
    value: number;
    cap: number;
}

/** 装备详情：悬停时浮出来的那张纸上的全部内容。 */
export interface GearDetail {
    name: string;
    lv: string;
    kind: string;
    /** 基础属性（装备自带的白字）。 */
    base: [string, string][];
    /** 打造附加的绿字。 */
    gain: [string, string][];
    /** 特技 / 特效 / 套装，第三位是配色：`seal` 朱、`ochre` 赭。 */
    lines: [string, string, string?][];
    foot: string;
}

/** 格子。`detail` 缺席即空位——**空位要占格**，否则「少一件」与「没这一格」分不开。 */
export interface GearSlot {
    slot: string;
    caption?: string;
    detail?: GearDetail;
}

export interface CharacterMock {
    id: string;
    name: string;
    level: number;
    school: string;
    /** 角标下面那行小字：服务器、称谓、更新时间。 */
    subs: string[];
    /** 两列四组，外层是「哪一列」——列顺序由版式决定，不由数据顺序决定。 */
    attrColumns: [AttrGroup[], AttrGroup[]];
    attrFoot: string;
    skills: SkillRow[];
    skillFoot: string;
    assists: SkillRow[];
    assistFoot: string;
    trainings: TrainingRow[];
    trainingFoot: string;
    gear: GearSlot[];
    gearMeta: { special: string; suit: string };
}

export const CHARACTERS: CharacterMock[] = [
    {
        id: 'jiang-xian',
        name: '江仙',
        level: 129,
        school: '狮驼岭',
        subs: ['清风阁', '三界行者', '3 天前更新'],
        attrColumns: [
            [
                {
                    title: '基础',
                    rows: [
                        { label: '气血', value: '3881', sub: '/3916' },
                        { label: '法力', value: '1430', sub: '/1440' },
                        { label: '活力', value: '2400', sub: '/2400' },
                        { label: '体力', value: '1200', sub: '/1200' },
                        { label: '修炼点', value: '0', sub: '/100' },
                        { label: '经验', value: '1,243.8', sub: '万' },
                    ],
                },
                {
                    title: '资质',
                    rows: [
                        { label: '体质', value: '186' },
                        { label: '魔力', value: '142' },
                        { label: '力量', value: '268', strong: true },
                        { label: '耐力', value: '174' },
                        { label: '敏捷', value: '196' },
                        { label: '潜力', value: '12' },
                    ],
                },
            ],
            [
                {
                    title: '修为',
                    rows: [
                        { label: '命中', value: '512' },
                        { label: '伤害', value: '826', strong: true },
                        { label: '防御', value: '418' },
                        { label: '速度', value: '294' },
                        { label: '灵力', value: '366' },
                    ],
                },
                {
                    title: '资产',
                    rows: [
                        { label: '人气', value: '386' },
                        { label: '帮贡', value: '1,240' },
                        { label: '金币', value: '428.6', sub: '万' },
                        { label: '存银', value: '182.0', sub: '万' },
                    ],
                },
            ],
        ],
        attrFoot: '括号内为上限',
        skills: [
            { name: '变身术', level: 100, tag: '已学' },
            { name: '鹰击', level: 160, tag: '满', max: true },
            { name: '象形', level: 160, tag: '满', max: true },
            { name: '狮搏', level: 160, tag: '满', max: true },
            { name: '阴阳二气诀', level: 160, tag: '满', max: true },
            { name: '生死搏', level: 160, tag: '满', max: true },
            { name: '魔息术', level: 150, tag: '已学' },
        ],
        skillFoot: '5 项满 160，2 项在补',
        assists: [
            { name: '强身术', level: 120, tag: '已学' },
            { name: '冥想', level: 120, tag: '已学' },
            { name: '丹元济会', level: 80, tag: '已学' },
            { name: '炼气化神', level: 0, tag: '未学', off: true },
            { name: '炼药', level: 100, tag: '已学' },
            { name: '烹饪技巧', level: 100, tag: '已学' },
            { name: '打造技巧', level: 120, tag: '已学' },
        ],
        assistFoot: '未学的也留一行，免得「少一条」被当成读漏',
        trainings: [
            { name: '攻击修炼', value: 20, cap: 20 },
            { name: '防御修炼', value: 20, cap: 20 },
            { name: '法术修炼', value: 18, cap: 20 },
            { name: '抗法修炼', value: 18, cap: 20 },
            { name: '猎术修炼', value: 11, cap: 20 },
            { name: '育兽修炼', value: 0, cap: 20 },
        ],
        trainingFoot: '2 项已满，4 项在练',
        gear: [
            {
                slot: '头盔',
                caption: '无级别·霜冷九州',
                detail: {
                    name: '霜冷九州',
                    lv: '150 级',
                    kind: '无级别限制 · 女 · 帽子',
                    base: [
                        ['防御', '96'],
                        ['气血', '220'],
                    ],
                    gain: [
                        ['体质', '+22'],
                        ['耐力', '+18'],
                    ],
                    lines: [
                        ['特效', '变化之术', 'seal'],
                        ['套装', '天罡 5 / 5', 'ochre'],
                    ],
                    foot: '耐久 480 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '项链',
                caption: '无级别·九曜星华',
                detail: {
                    name: '九曜星华',
                    lv: '150 级',
                    kind: '无级别限制 · 女 · 项链',
                    base: [
                        ['灵力', '48'],
                        ['法术伤害', '36'],
                    ],
                    gain: [['魔力', '+24']],
                    lines: [['特效', '简易']],
                    foot: '耐久 500 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '武器',
                caption: '150·霜冷九州',
                detail: {
                    name: '霜冷九州',
                    lv: '150 级',
                    kind: '双剑 · 女',
                    base: [
                        ['命中', '218'],
                        ['伤害', '386'],
                    ],
                    gain: [
                        ['力量', '+28'],
                        ['敏捷', '+12'],
                    ],
                    lines: [
                        ['特技', '破血狂攻', 'seal'],
                        ['套装', '天罡 5 / 5', 'ochre'],
                    ],
                    foot: '耐久 500 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '衣服',
                caption: '150·龙鳞战甲',
                detail: {
                    name: '龙鳞战甲',
                    lv: '150 级',
                    kind: '女衣',
                    base: [
                        ['防御', '286'],
                        ['气血', '420'],
                    ],
                    gain: [
                        ['耐力', '+20'],
                        ['体质', '+16'],
                    ],
                    lines: [['套装', '天罡 5 / 5', 'ochre']],
                    foot: '耐久 460 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '腰带',
                caption: '140·混元一气',
                detail: {
                    name: '混元一气',
                    lv: '140 级',
                    kind: '腰带',
                    base: [
                        ['防御', '62'],
                        ['速度', '32'],
                    ],
                    gain: [['体质', '+14']],
                    lines: [['特效', '愤怒']],
                    foot: '耐久 420 / 450 · 打造 清风阁',
                },
            },
            {
                slot: '鞋子',
                caption: '150·踏云履',
                detail: {
                    name: '踏云履',
                    lv: '150 级',
                    kind: '鞋子',
                    base: [
                        ['防御', '78'],
                        ['速度', '46'],
                    ],
                    gain: [['敏捷', '+18']],
                    lines: [],
                    foot: '耐久 500 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '戒指',
                caption: '140·天罡戒',
                detail: {
                    name: '天罡戒',
                    lv: '140 级',
                    kind: '戒指',
                    base: [
                        ['命中', '64'],
                        ['灵力', '24'],
                    ],
                    gain: [['力量', '+10']],
                    lines: [['套装', '天罡 5 / 5', 'ochre']],
                    foot: '耐久 450 / 450 · 打造 清风阁',
                },
            },
            { slot: '戒指二' },
            {
                slot: '手镯',
                caption: '140·地煞镯',
                detail: {
                    name: '地煞镯',
                    lv: '140 级',
                    kind: '手镯',
                    base: [
                        ['防御', '54'],
                        ['气血', '180'],
                    ],
                    gain: [['耐力', '+12']],
                    lines: [],
                    foot: '耐久 440 / 450 · 打造 清风阁',
                },
            },
            { slot: '手镯二' },
            {
                slot: '佩饰',
                caption: '150·玲珑佩',
                detail: {
                    name: '玲珑佩',
                    lv: '150 级',
                    kind: '佩饰',
                    base: [
                        ['灵力', '36'],
                        ['法术防御', '42'],
                    ],
                    gain: [['敏捷', '+9']],
                    lines: [],
                    foot: '耐久 470 / 500 · 打造 临江仙',
                },
            },
            {
                slot: '法宝',
                caption: '定海珠',
                detail: {
                    name: '定海珠',
                    lv: '150 级',
                    kind: '主动法宝 · 3 级',
                    base: [
                        ['气血', '300'],
                        ['防御', '40'],
                    ],
                    gain: [],
                    lines: [['特效', '神佑复生', 'seal']],
                    foot: '灵气 500 / 500 · 不可交易',
                },
            },
        ],
        gearMeta: { special: '破血·野兽', suit: '天罡 5/5' },
    },
    {
        id: 'yun-zhong-he',
        name: '云中鹤',
        level: 109,
        school: '化生寺',
        subs: ['清风阁', '今天 09:12'],
        attrColumns: [
            [
                {
                    title: '基础',
                    rows: [
                        { label: '气血', value: '5210', sub: '/5600' },
                        { label: '法力', value: '1180', sub: '/1200' },
                        { label: '活力', value: '1600', sub: '/1600' },
                        { label: '体力', value: '980', sub: '/1200' },
                        { label: '修炼点', value: '36', sub: '/100' },
                        { label: '经验', value: '786.4', sub: '万' },
                    ],
                },
                {
                    title: '资质',
                    rows: [
                        { label: '体质', value: '210', strong: true },
                        { label: '魔力', value: '96' },
                        { label: '力量', value: '88' },
                        { label: '耐力', value: '246' },
                        { label: '敏捷', value: '132' },
                        { label: '潜力', value: '0' },
                    ],
                },
            ],
            [
                {
                    title: '修为',
                    rows: [
                        { label: '命中', value: '468' },
                        { label: '伤害', value: '512' },
                        { label: '防御', value: '604', strong: true },
                        { label: '速度', value: '262' },
                        { label: '灵力', value: '402' },
                    ],
                },
                {
                    title: '资产',
                    rows: [
                        { label: '人气', value: '512' },
                        { label: '帮贡', value: '980' },
                        { label: '金币', value: '76.2', sub: '万' },
                        { label: '存银', value: '40.5', sub: '万' },
                    ],
                },
            ],
        ],
        attrFoot: '括号内为上限',
        skills: [
            { name: '推气过宫', level: 130, tag: '已学' },
            { name: '香飘飘', level: 130, tag: '已学' },
            { name: '大慈大悲', level: 130, tag: '已学' },
            { name: '渡世步', level: 130, tag: '已学' },
            { name: '舍身取义', level: 130, tag: '已学' },
            { name: '韦陀护法', level: 130, tag: '已学' },
            { name: '佛法无边', level: 120, tag: '已学' },
        ],
        skillFoot: '6 项 130，1 项在补',
        assists: [
            { name: '强身术', level: 140, tag: '已学' },
            { name: '冥想', level: 140, tag: '已学' },
            { name: '丹元济会', level: 120, tag: '已学' },
            { name: '炼气化神', level: 60, tag: '已学' },
            { name: '炼药', level: 0, tag: '未学', off: true },
            { name: '烹饪技巧', level: 80, tag: '已学' },
            { name: '裁缝技巧', level: 100, tag: '已学' },
        ],
        assistFoot: '未学的也留一行，免得「少一条」被当成读漏',
        trainings: [
            { name: '攻击修炼', value: 14, cap: 14 },
            { name: '防御修炼', value: 14, cap: 14 },
            { name: '法术修炼', value: 10, cap: 14 },
            { name: '抗法修炼', value: 14, cap: 14 },
            { name: '猎术修炼', value: 0, cap: 14 },
            { name: '育兽修炼', value: 5, cap: 14 },
        ],
        trainingFoot: '3 项已满，3 项在练',
        gear: [
            {
                slot: '头盔',
                caption: '130·慈航普度',
                detail: {
                    name: '慈航普度',
                    lv: '130 级',
                    kind: '帽子',
                    base: [
                        ['防御', '78'],
                        ['气血', '164'],
                    ],
                    gain: [['耐力', '+16']],
                    lines: [['套装', '慈悲 3 / 5', 'ochre']],
                    foot: '耐久 380 / 400 · 打造 云中鹤',
                },
            },
            {
                slot: '项链',
                caption: '130·琉璃光',
                detail: {
                    name: '琉璃光',
                    lv: '130 级',
                    kind: '项链',
                    base: [
                        ['灵力', '42'],
                        ['法术伤害', '28'],
                    ],
                    gain: [['魔力', '+18']],
                    lines: [],
                    foot: '耐久 400 / 400 · 打造 云中鹤',
                },
            },
            {
                slot: '武器',
                caption: '130·禅杖',
                detail: {
                    name: '禅杖',
                    lv: '130 级',
                    kind: '法杖 · 男',
                    base: [
                        ['命中', '176'],
                        ['伤害', '268'],
                    ],
                    gain: [['魔力', '+22']],
                    lines: [['特技', '慈航普度', 'seal']],
                    foot: '耐久 400 / 400 · 打造 云中鹤',
                },
            },
            {
                slot: '衣服',
                caption: '130·袈裟',
                detail: {
                    name: '袈裟',
                    lv: '130 级',
                    kind: '男衣',
                    base: [
                        ['防御', '238'],
                        ['气血', '360'],
                    ],
                    gain: [['体质', '+18']],
                    lines: [['套装', '慈悲 3 / 5', 'ochre']],
                    foot: '耐久 360 / 400 · 打造 云中鹤',
                },
            },
            {
                slot: '腰带',
                caption: '120·缠丝带',
                detail: {
                    name: '缠丝带',
                    lv: '120 级',
                    kind: '腰带',
                    base: [
                        ['防御', '52'],
                        ['速度', '28'],
                    ],
                    gain: [],
                    lines: [],
                    foot: '耐久 300 / 350 · 打造 云中鹤',
                },
            },
            { slot: '鞋子' },
            {
                slot: '戒指',
                caption: '120·舍利戒',
                detail: {
                    name: '舍利戒',
                    lv: '120 级',
                    kind: '戒指',
                    base: [
                        ['命中', '52'],
                        ['灵力', '20'],
                    ],
                    gain: [],
                    lines: [],
                    foot: '耐久 320 / 350 · 打造 云中鹤',
                },
            },
            {
                slot: '戒指二',
                caption: '120·菩提戒',
                detail: {
                    name: '菩提戒',
                    lv: '120 级',
                    kind: '戒指',
                    base: [
                        ['命中', '48'],
                        ['灵力', '18'],
                    ],
                    gain: [],
                    lines: [],
                    foot: '耐久 320 / 350 · 打造 云中鹤',
                },
            },
            {
                slot: '手镯',
                caption: '120·念珠',
                detail: {
                    name: '念珠',
                    lv: '120 级',
                    kind: '手镯',
                    base: [
                        ['防御', '46'],
                        ['气血', '150'],
                    ],
                    gain: [],
                    lines: [],
                    foot: '耐久 300 / 350 · 打造 云中鹤',
                },
            },
            { slot: '手镯二' },
            {
                slot: '佩饰',
                caption: '130·璎珞',
                detail: {
                    name: '璎珞',
                    lv: '130 级',
                    kind: '佩饰',
                    base: [
                        ['灵力', '30'],
                        ['法术防御', '34'],
                    ],
                    gain: [],
                    lines: [],
                    foot: '耐久 360 / 400 · 打造 云中鹤',
                },
            },
            {
                slot: '法宝',
                caption: '玉净瓶',
                detail: {
                    name: '玉净瓶',
                    lv: '130 级',
                    kind: '主动法宝 · 2 级',
                    base: [
                        ['气血', '240'],
                        ['防御', '30'],
                    ],
                    gain: [],
                    lines: [['特效', '佛光普照', 'seal']],
                    foot: '灵气 400 / 400 · 不可交易',
                },
            },
        ],
        gearMeta: { special: '慈航普度', suit: '慈悲 3/5' },
    },
];
