/**
 * 角色页的演示数据。
 *
 * **字段是真的，值只对了一半**：结构、分组、部位、修炼项全部照 2026-11-02 拍的
 * 13 张游戏截图定；但只有 `归ω岚` 一个角色的数据是逐项从截图上读下来的，
 * `云中鹤` 用同一套字段编的——为了验证版式在「数据多少不一」时不塌（五开五个号，
 * 每个号的技能条数、装备件数都不一样）。
 *
 * 两处**明确是占位**，等补：
 * 1. 辅助技能的**名字**已按图标对上五个（见 `assists` 上方注释），
 *    剩三个是推断。游戏里那一页只有图标 + 等级，看不出名字；
 *    等级 `100/56/50/40/32/2/1/1` 是截图上的真值。
 * 2. 召唤兽的**技能名**。截图里技能图标能看清形状、看不清字。
 *
 * 换成真实数据时**只换数据源，不动模板**——`CharacterCard` 的入参就是
 * `character.ts` 里的 `CharacterData`。
 *
 * 不放进 `services/`：`ghost-*.ts` 那一套有解析、有兜底、有单测，是业务逻辑；
 * 这里没有一行逻辑，只有字面量，放在页面旁边才不会让人以为它算半个数据层。
 */
import type { CharacterData } from './character';

export const CHARACTERS: CharacterData[] = [
    {
        id: 'gui-lan',
        name: '归ω岚',
        level: 130,
        school: '五庄观',
        server: '陕西区 · 大雁塔',
        guild: '大唐芙蓉园',
        /* 五组，**顺序即网格顺序**（前四组两行两列、行优先，末组「潜能」通栏）：
         * 资源 / 名望、战斗 / 加点、潜能。
         * 组名与行由 `ATTR_GROUPS` 定死（用户 2026-11-02），这里只填数值
         * （归一化时会按清单重建，`wide` 也跟着清单走，不用在这里写）。
         * 经验不在这里——它单独一行带进度条（见 `experience`）。 */
        attrGroups: [
            {
                title: '资源',
                rows: [
                    { label: '气血', value: '3916' },
                    { label: '魔法', value: '1440' },
                    { label: '活力', value: '860' },
                    { label: '体力', value: '900' },
                ],
            },
            {
                title: '名望',
                rows: [
                    { label: '人气', value: '755' },
                    { label: '帮贡', value: '266' },
                    { label: '门贡', value: '323' },
                ],
            },
            {
                title: '战斗',
                rows: [
                    { label: '命中', value: '1915' },
                    { label: '伤害', value: '1591' },
                    { label: '防御', value: '826' },
                    { label: '速度', value: '455' },
                    { label: '法伤', value: '845' },
                    { label: '法防', value: '758' },
                ],
            },
            {
                title: '加点',
                rows: [
                    { label: '体质', value: '229' },
                    { label: '魔力', value: '145' },
                    { label: '力量', value: '721' },
                    { label: '耐力', value: '153' },
                    { label: '敏捷', value: '332' },
                ],
            },
            {
                title: '潜能',
                rows: [
                    { label: '乾元丹', value: '8' },
                    { label: '潜能果', value: '42' },
                ],
            },
        ],
        /* `need` 是占位：截图里只拍到了当前经验，没拍升级所需。
         * 填一个相近的数，是为了让进度条有个看得见的样子；真实值由用户录。 */
        experience: { value: '3,777.2万', need: '4,200万' },
        /* 五庄观七项。截图里「周易学」是朱色，但同一张图上「修仙术」也是 120 却是白色，
         * 所以朱色**不是**满级标记（否则两项都该红）。上限规则还没确认，`cap` 一律不填。 */
        skills: [
            { name: '周易学', level: 120, cap: 180 },
            { name: '潇湘仙雨', level: 115, cap: 180 },
            { name: '乾坤袖', level: 60, cap: 180 },
            { name: '修仙术', level: 120, cap: 180 },
            { name: '混元道果', level: 90, cap: 180 },
            { name: '明性修身', level: 90, cap: 180 },
            { name: '七星遁', level: 60, cap: 180 },
        ],
        /* 等级来自「辅助技能」面板的八个格子，名字来自「生活技能」目录的两页截图。
         *
         * 名字与图标的对应是**按图案认的**，认对五个：
         *   强身术（人托举石锁）· 打造技巧（锤子砸砧）· 灵石技巧（菱形宝石）·
         *   烹饪技巧（锅与蒸汽）· 养生之道（X 形编织纹）
         * 三个是推断，等用户确认：50 的 V 形→冥想、2 的举重人形→健身术、
         * 1 的粉底倾倒容器→熔炼技巧（**粉底**在游戏里可能另有含义，比如「条件不足」）。
         *
         * 排序按等级降序，不按游戏网格：一列读下来先看到主修的几项。 */
        assists: [
            { name: '强身术', level: 100, kind: 'life' },
            { name: '打造技巧', level: 56, kind: 'life' },
            { name: '冥想', level: 50, kind: 'life' },
            { name: '养生之道', level: 40, kind: 'life' },
            { name: '烹饪技巧', level: 32, kind: 'life' },
            { name: '健身术', level: 2, kind: 'life' },
            { name: '灵石技巧', level: 1, kind: 'life' },
            { name: '熔炼技巧', level: 1, kind: 'life' },
            /* 剧情技能：按「技能点」学、最高 5 级（游戏说明：调息每级耗 3 点）。
             * 这两条是**占位**——用户还没给这个号的剧情技能截图，填进来是为了让
             * 「生活 + 剧情」合到一页之后格子有东西可看。 */
            { name: '调息', level: 5, cap: 5, kind: 'story' },
            { name: '打坐', level: 4, cap: 5, kind: 'story' },
            { name: '变化之术', level: 3, cap: 5, kind: 'story' },
        ],
        /* 两组共 10 项，育兽术上限 35（其余 20）。 */
        trainings: [
            {
                title: '任务修炼',
                rows: [
                    { name: '攻击修炼', level: 11, cap: 20 },
                    { name: '防御修炼', level: 5, cap: 20 },
                    { name: '法术修炼', level: 5, cap: 20 },
                    { name: '抗法修炼', level: 5, cap: 20 },
                    { name: '猎术修炼', level: 5, cap: 20 },
                ],
            },
            {
                title: '宠物修炼',
                rows: [
                    { name: '攻击控制力', level: 0, cap: 20 },
                    { name: '防御控制力', level: 0, cap: 20 },
                    { name: '法术控制力', level: 0, cap: 20 },
                    { name: '抗法控制力', level: 0, cap: 20 },
                    { name: '育兽术', level: 0, cap: 35 },
                ],
            },
        ],
        /* 12 格铺满：前 6 件人物装备、接着 4 件灵饰、最后 2 件玉魄。 */
        gear: [
            {
                slot: '头',
                caption: '黑魔冠',
                detail: {
                    name: '黑魔冠',
                    flavor: '魔王妖王常戴的冠帽，有相当的防御力。',
                    kind: '帽子',
                    requires: ['等级 80', '男'],
                    stats: [
                        { label: '防御', value: '+45' },
                        { label: '魔法', value: '+80' },
                        { label: '伤害', value: '+40', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '941' },
                        { label: '锻炼等级', value: '5' },
                        { label: '镶嵌宝石', value: '太阳石' },
                    ],
                    lines: [{ label: '特技', value: '起死回生', tone: 'seal' }],
                },
            },
            {
                slot: '项链',
                caption: '碧玉瓒',
                detail: {
                    name: '碧玉瓒',
                    kind: '项链',
                    requires: ['等级 120', '女'],
                    stats: [
                        { label: '灵力', value: '+186' },
                        { label: '法力上限', value: '+240' },
                    ],
                    cond: [
                        { label: '耐久度', value: '620' },
                        { label: '锻炼等级', value: '3' },
                    ],
                },
            },
            {
                slot: '武器',
                caption: '飞龙在天',
                detail: {
                    name: '飞龙在天',
                    flavor: '曾为文殊菩萨降妖密宝，如今幻化为一杆金龙宝枪。此枪掷出可化为飞龙，从万丈高空俯冲而下，撕碎敌人。',
                    kind: '长枪 · 女',
                    requires: ['等级 130', '五行 木'],
                    stats: [
                        { label: '伤害', value: '+466' },
                        { label: '命中', value: '+660' },
                        { label: '体质', value: '+37', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '191' },
                        { label: '修理失败', value: '1 次' },
                        { label: '锻炼等级', value: '4' },
                        { label: '镶嵌宝石', value: '红玛瑙' },
                    ],
                    foot: '制造者：神兵的制作师强化打造',
                },
            },
            {
                slot: '衣服',
                caption: '流云素纱',
                detail: {
                    name: '流云素纱',
                    kind: '女衣',
                    requires: ['等级 130', '女'],
                    stats: [
                        { label: '防御', value: '+312' },
                        { label: '气血上限', value: '+480' },
                        { label: '耐力', value: '+24', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '540' },
                        { label: '锻炼等级', value: '4' },
                    ],
                    lines: [{ label: '套装', value: '天罡 5 / 5', tone: 'ochre' }],
                },
            },
            {
                slot: '腰带',
                caption: '乾坤带',
                detail: {
                    name: '乾坤带',
                    kind: '腰带',
                    requires: ['等级 120'],
                    stats: [
                        { label: '防御', value: '+58' },
                        { label: '速度', value: '+34' },
                        { label: '体质', value: '+16', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '480' },
                        { label: '锻炼等级', value: '3' },
                    ],
                    lines: [{ label: '特效', value: '愤怒', tone: 'seal' }],
                },
            },
            {
                slot: '鞋子',
                caption: '踏云履',
                detail: {
                    name: '踏云履',
                    kind: '鞋子',
                    requires: ['等级 120'],
                    stats: [
                        { label: '防御', value: '+74' },
                        { label: '速度', value: '+42' },
                        { label: '敏捷', value: '+18', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '500' },
                        { label: '锻炼等级', value: '3' },
                    ],
                },
            },
            /* ---------- 灵饰 4 件：多「精炼等级」，戒指的套装效果照截图原样 ---------- */
            {
                slot: '戒指',
                caption: '芙蓉戒',
                detail: {
                    name: '芙蓉戒',
                    flavor: '涉江采芙蓉，饰于白玉之上，是为芙蓉戒。',
                    kind: '灵饰 · 戒指',
                    requires: ['等级 80'],
                    stats: [
                        { label: '伤害', value: '+24' },
                        { label: '物理暴击等级', value: '+8', extra: '+16', gain: true },
                        { label: '治疗能力', value: '+8', extra: '+12', gain: true },
                        { label: '治疗能力', value: '+7', extra: '+12', gain: true },
                        { label: '治疗能力', value: '+4', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '401' },
                        { label: '精炼等级', value: '4' },
                    ],
                    lines: [
                        /* 「回春之术」不存在——原先这里填的是它，而特效全集里没有这个词。
                         * 灵饰的治疗向特效是「再生」。见 `character.ts` 的 `GEAR_SPECIALS`。 */
                        { label: '特效', value: '再生', tone: 'seal' },
                        { label: '套装', value: '治疗能力 +24（已生效）', tone: 'ochre' },
                    ],
                    foot: '制造者：Jsut`画晚强化打造',
                },
            },
            {
                slot: '耳饰',
                caption: '碎星坠',
                detail: {
                    name: '碎星坠',
                    kind: '灵饰 · 耳饰',
                    requires: ['等级 120'],
                    stats: [
                        { label: '法术伤害', value: '+32' },
                        { label: '法术暴击等级', value: '+6', extra: '+12', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '420' },
                        { label: '精炼等级', value: '3' },
                        /* 钟灵石：截图里这一件没露出这一行（被悬浮框挡住了），
                         * 值按游戏面板的写法补一个示例，只为让卡上版心的
                         * 「钟灵石」那一行有内容可看——正式数据以录入的为准。 */
                        { label: '钟灵石', value: '3 段' },
                    ],
                },
            },
            {
                slot: '配饰',
                caption: '青玉环',
                detail: {
                    name: '青玉环',
                    kind: '灵饰 · 配饰',
                    requires: ['等级 120'],
                    stats: [
                        { label: '防御', value: '+46' },
                        { label: '气血上限', value: '+180', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '400' },
                        { label: '精炼等级', value: '3' },
                    ],
                },
            },
            {
                slot: '手镯',
                caption: '缠丝镯',
                detail: {
                    name: '缠丝镯',
                    kind: '灵饰 · 手镯',
                    requires: ['等级 120'],
                    stats: [
                        { label: '封印命中等级', value: '+14' },
                        { label: '抗封印命中等级', value: '+12', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '440' },
                        { label: '精炼等级', value: '2' },
                    ],
                },
            },
            /* ---------- 玉魄 2 件：照「双列对比」那张截图，各记自己那一列 ---------- */
            {
                slot: '玉魄·阴',
                caption: '上古玉魄·阴',
                detail: {
                    name: '上古玉魄·阴',
                    kind: '上古玉魄 · 阴',
                    stats: [
                        { label: '格挡值', value: '+18' },
                        { label: '奇袭法术', value: '+0.5%' },
                        { label: '气血', value: '+36', extra: '+126', gain: true },
                        { label: '气血回复效果', value: '+7', extra: '+18', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '201' },
                        { label: '灵尘等级', value: '3' },
                    ],
                    lines: [{ label: '奇袭道具', value: '空', tone: 'ochre' }],
                },
            },
            {
                slot: '玉魄·阳',
                caption: '上古玉魄·阳',
                detail: {
                    name: '上古玉魄·阳',
                    flavor: '神天兵的命魂之玉，蕴藏着方正克己的天命之力。气血回复效果 +6',
                    kind: '上古玉魄 · 阳',
                    stats: [
                        { label: '物理暴击等级', value: '+10' },
                        { label: '奇袭法术', value: '+0.5%' },
                        { label: '伤害', value: '+5', extra: '+12', gain: true },
                        { label: '治疗能力', value: '+4', extra: '+9', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '200' },
                        { label: '灵尘等级', value: '2' },
                    ],
                    lines: [{ label: '奇袭特技', value: '空', tone: 'ochre' }],
                },
            },
        ],
        gearMeta: { special: '起死回生', suit: '天罡 5/5' },
        /* 4 只，携带上限 7（截图上的 4/7）。只有第一只的数据是逐项读的。 */
        pets: [
            {
                name: '归岚',
                level: 136,
                joinLevel: 65,
                quality: {
                    attack: 1440,
                    defense: 1276,
                    hp: 3030,
                    mp: 2380,
                    speed: 1344,
                    dodge: 1276,
                },
                life: 93,
                growth: '1.202',
                element: '火',
                attrs: [
                    { label: '气血', value: '1773' },
                    { label: '魔法', value: '1198' },
                    { label: '攻击', value: '2044' },
                    { label: '防御', value: '724' },
                    { label: '速度', value: '288' },
                    { label: '法伤', value: '747' },
                    { label: '法防', value: '747' },
                    { label: '忠诚', value: '90' },
                ],
                /* 名字是占位：截图里图标看得清形状、看不清字。 */
                skills: ['连击', '必杀', '吸血', '偷袭'],
                innerPills: ['狂怒', '坚甲'],
                spirit: 90,
            },
            {
                name: '小狗',
                level: 75,
                joinLevel: 45,
                quality: {
                    attack: 1180,
                    defense: 980,
                    hp: 2400,
                    mp: 1620,
                    speed: 1100,
                    dodge: 1040,
                },
                life: 210,
                growth: '1.148',
                element: '土',
                attrs: [
                    { label: '气血', value: '1120' },
                    { label: '魔法', value: '760' },
                    { label: '攻击', value: '1486' },
                    { label: '防御', value: '512' },
                    { label: '速度', value: '240' },
                    { label: '法伤', value: '488' },
                    { label: '法防', value: '502' },
                    { label: '忠诚', value: '76' },
                ],
                skills: ['连击', '偷袭'],
                innerPills: [],
            },
            {
                name: '天狗（人形）',
                level: 0,
                joinLevel: 65,
                quality: {
                    attack: 1320,
                    defense: 1140,
                    hp: 2760,
                    mp: 2080,
                    speed: 1200,
                    dodge: 1160,
                },
                life: 400,
                growth: '1.176',
                element: '金',
                attrs: [
                    { label: '气血', value: '960' },
                    { label: '魔法', value: '620' },
                    { label: '攻击', value: '820' },
                    { label: '防御', value: '410' },
                    { label: '速度', value: '210' },
                    { label: '法伤', value: '402' },
                    { label: '法防', value: '418' },
                    { label: '忠诚', value: '100' },
                ],
                skills: [],
                innerPills: [],
            },
            {
                name: '黑熊',
                level: 16,
                joinLevel: 15,
                quality: {
                    attack: 860,
                    defense: 1020,
                    hp: 1860,
                    mp: 940,
                    speed: 780,
                    dodge: 820,
                },
                life: 320,
                growth: '1.062',
                element: '水',
                attrs: [
                    { label: '气血', value: '640' },
                    { label: '魔法', value: '380' },
                    { label: '攻击', value: '486' },
                    { label: '防御', value: '320' },
                    { label: '速度', value: '152' },
                    { label: '法伤', value: '210' },
                    { label: '法防', value: '246' },
                    { label: '忠诚', value: '88' },
                ],
                skills: ['连击'],
                innerPills: [],
            },
        ],
    },
    {
        id: 'yun-zhong-he',
        name: '云中鹤',
        level: 109,
        school: '化生寺',
        server: '陕西区 · 大雁塔',
        guild: '大唐芙蓉园',
        attrGroups: [
            {
                title: '资源',
                rows: [
                    { label: '气血', value: '5600' },
                    { label: '魔法', value: '1200' },
                    { label: '活力', value: '640' },
                    { label: '体力', value: '720' },
                ],
            },
            {
                title: '名望',
                rows: [
                    { label: '人气', value: '512' },
                    { label: '帮贡', value: '980' },
                    { label: '门贡', value: '64' },
                ],
            },
            {
                title: '战斗',
                rows: [
                    { label: '命中', value: '468' },
                    { label: '伤害', value: '512' },
                    { label: '防御', value: '604' },
                    { label: '速度', value: '262' },
                    { label: '法伤', value: '402' },
                    { label: '法防', value: '588' },
                ],
            },
            {
                title: '加点',
                rows: [
                    { label: '体质', value: '210' },
                    { label: '魔力', value: '96' },
                    { label: '力量', value: '88' },
                    { label: '耐力', value: '246' },
                    { label: '敏捷', value: '132' },
                ],
            },
            {
                title: '潜能',
                rows: [
                    { label: '乾元丹', value: '3' },
                    { label: '潜能果', value: '12' },
                ],
            },
        ],
        experience: { value: '786.4万', need: '' },
        /* 化生寺的七项，名字照 `game/data/schools.json` 那张表（2026-11-03 换过一轮）：
         * 原先填的「推气过宫」「香飘飘」「韦陀护法」这些是照印象写的，
         * 只有「大慈大悲」「渡世步」两项与真表对得上——而门派技能现在**由门派带入**，
         * 种子里留一套假名字，等于第一眼看到的就是错的。 */
        skills: [
            { name: '小乘佛法', level: 100, cap: 180 },
            { name: '金刚伏魔', level: 100, cap: 180 },
            { name: '诵经', level: 100, cap: 180 },
            { name: '佛光普照', level: 95, cap: 180 },
            { name: '大慈大悲', level: 90, cap: 180 },
            { name: '歧黄之术', level: 85, cap: 180 },
            { name: '渡世步', level: 80, cap: 180 },
        ],
        assists: [
            { name: '强身术', level: 120, kind: 'life' },
            { name: '裁缝技巧', level: 100, kind: 'life' },
            { name: '冥想', level: 90, kind: 'life' },
            { name: '烹饪技巧', level: 80, kind: 'life' },
            { name: '炼金术', level: 70, kind: 'life' },
            { name: '中药医理', level: 60, kind: 'life' },
        ],
        trainings: [
            {
                title: '任务修炼',
                rows: [
                    { name: '攻击修炼', level: 4, cap: 17 },
                    { name: '防御修炼', level: 14, cap: 17 },
                    { name: '法术修炼', level: 10, cap: 17 },
                    { name: '抗法修炼', level: 14, cap: 17 },
                    { name: '猎术修炼', level: 0, cap: 17 },
                ],
            },
            {
                title: '宠物修炼',
                rows: [
                    { name: '攻击控制力', level: 0, cap: 17 },
                    { name: '防御控制力', level: 0, cap: 17 },
                    { name: '法术控制力', level: 0, cap: 17 },
                    { name: '抗法控制力', level: 0, cap: 17 },
                    { name: '育兽术', level: 5, cap: 30 },
                ],
            },
        ],
        gear: [
            {
                slot: '头',
                caption: '慈航冠',
                detail: {
                    name: '慈航冠',
                    kind: '帽子',
                    requires: ['等级 110', '男'],
                    stats: [
                        { label: '防御', value: '+68' },
                        { label: '魔法', value: '+120' },
                    ],
                    cond: [
                        { label: '耐久度', value: '380' },
                        { label: '锻炼等级', value: '2' },
                    ],
                    lines: [{ label: '套装', value: '慈悲 3 / 5', tone: 'ochre' }],
                },
            },
            {
                slot: '项链',
                caption: '琉璃光',
                detail: {
                    name: '琉璃光',
                    kind: '项链',
                    requires: ['等级 110', '男'],
                    stats: [
                        { label: '灵力', value: '+142' },
                        { label: '法术伤害', value: '+28' },
                    ],
                    cond: [{ label: '耐久度', value: '400' }],
                },
            },
            {
                slot: '武器',
                caption: '降魔杵',
                detail: {
                    name: '降魔杵',
                    flavor: '佛门法器，杵身缠着降魔真言。',
                    kind: '法杖 · 男',
                    requires: ['等级 110', '五行 金'],
                    stats: [
                        { label: '伤害', value: '+318' },
                        { label: '命中', value: '+420' },
                        { label: '魔力', value: '+22', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '340' },
                        { label: '锻炼等级', value: '2' },
                    ],
                    lines: [{ label: '特技', value: '慈航普度', tone: 'seal' }],
                },
            },
            {
                slot: '衣服',
                caption: '袈裟',
                detail: {
                    name: '袈裟',
                    kind: '男衣',
                    requires: ['等级 110', '男'],
                    stats: [
                        { label: '防御', value: '+238' },
                        { label: '气血上限', value: '+360' },
                        { label: '体质', value: '+18', gain: true },
                    ],
                    cond: [{ label: '耐久度', value: '360' }],
                    lines: [{ label: '套装', value: '慈悲 3 / 5', tone: 'ochre' }],
                },
            },
            {
                slot: '腰带',
                caption: '缠丝带',
                detail: {
                    name: '缠丝带',
                    kind: '腰带',
                    requires: ['等级 100'],
                    stats: [
                        { label: '防御', value: '+52' },
                        { label: '速度', value: '+28' },
                    ],
                    cond: [{ label: '耐久度', value: '300' }],
                },
            },
            /* 这只号鞋子空着——正好验「空位是挖掉的格」这条。 */
            { slot: '鞋子' },
            {
                slot: '戒指',
                caption: '舍利戒',
                detail: {
                    name: '舍利戒',
                    kind: '灵饰 · 戒指',
                    requires: ['等级 100'],
                    stats: [
                        { label: '伤害', value: '+18' },
                        { label: '治疗能力', value: '+6', extra: '+9', gain: true },
                    ],
                    cond: [
                        { label: '耐久度', value: '320' },
                        { label: '精炼等级', value: '2' },
                    ],
                },
            },
            {
                slot: '耳饰',
                caption: '菩提坠',
                detail: {
                    name: '菩提坠',
                    kind: '灵饰 · 耳饰',
                    requires: ['等级 100'],
                    stats: [{ label: '法术防御', value: '+24' }],
                    cond: [{ label: '精炼等级', value: '1' }],
                },
            },
            { slot: '配饰' },
            {
                slot: '手镯',
                caption: '念珠镯',
                detail: {
                    name: '念珠镯',
                    kind: '灵饰 · 手镯',
                    requires: ['等级 100'],
                    stats: [{ label: '抗封印命中等级', value: '+8' }],
                    cond: [{ label: '精炼等级', value: '1' }],
                },
            },
            { slot: '玉魄·阴' },
            { slot: '玉魄·阳' },
        ],
        gearMeta: { special: '慈航普度', suit: '慈悲 3/5' },
        pets: [
            {
                name: '小雷',
                level: 96,
                joinLevel: 55,
                quality: {
                    attack: 1240,
                    defense: 1080,
                    hp: 2680,
                    mp: 2240,
                    speed: 1180,
                    dodge: 1090,
                },
                life: 148,
                growth: '1.164',
                element: '雷',
                attrs: [
                    { label: '气血', value: '1420' },
                    { label: '魔法', value: '980' },
                    { label: '攻击', value: '1680' },
                    { label: '防御', value: '620' },
                    { label: '速度', value: '252' },
                    { label: '法伤', value: '640' },
                    { label: '法防', value: '660' },
                    { label: '忠诚', value: '94' },
                ],
                skills: ['连击', '必杀'],
                innerPills: ['狂怒'],
            },
            {
                name: '花妖',
                level: 42,
                joinLevel: 35,
                quality: {
                    attack: 960,
                    defense: 880,
                    hp: 2200,
                    mp: 1800,
                    speed: 1020,
                    dodge: 980,
                },
                life: 280,
                growth: '1.088',
                element: '木',
                attrs: [
                    { label: '气血', value: '880' },
                    { label: '魔法', value: '540' },
                    { label: '攻击', value: '720' },
                    { label: '防御', value: '380' },
                    { label: '速度', value: '196' },
                    { label: '法伤', value: '340' },
                    { label: '法防', value: '326' },
                    { label: '忠诚', value: '82' },
                ],
                skills: ['吸血'],
                innerPills: [],
            },
        ],
    },
];
