/**
 * 角色页的演示数据。
 *
 * **字段是真的，值只对了一半**：结构、分组、部位、修炼项全部照 2026-11-02 拍的
 * 13 张游戏截图定；但只有 `归ω岚` 一个角色的数据是逐项从截图上读下来的，
 * `云中鹤` 用同一套字段编的——为了验证版式在「数据多少不一」时不塌（五开五个号，
 * 每个号的技能条数、属性值都不一样）。
 *
 * 两处**明确是占位**，等补：
 * 1. 辅助技能的**名字**已按图标对上五个（见 `assists` 上方注释），
 *    剩三个是推断。游戏里那一页只有图标 + 等级，看不出名字；
 *    等级 `100/56/50/40/32/2/1/1` 是截图上的真值。
 * 2. 召唤兽的**技能名**。截图里技能图标能看清形状、看不清字。
 *
 * 装备旧样例已清空（2026-11-08）：十二部位留空，按部位规则录入真实数据。
 *
 * 换成真实数据时**只换数据源，不动模板**——`CharacterCard` 的入参就是
 * `character.ts` 里的 `CharacterData`。
 *
 * 不放进 `services/`：`ghost-*.ts` 那一套有解析、有兜底、有单测，是业务逻辑；
 * 这里只放演示值与空部位骨架，放在页面旁边才不会让人以为它算半个数据层。
 */
import type { CharacterData } from './character';
import { GEAR_SLOTS } from './gear';

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
                    { name: '攻击修炼', level: 11 },
                    { name: '防御修炼', level: 5 },
                    { name: '法术修炼', level: 5 },
                    { name: '抗法修炼', level: 5 },
                    { name: '猎术修炼', level: 5 },
                ],
            },
            {
                title: '宠物修炼',
                rows: [
                    { name: '攻击控制力', level: 0 },
                    { name: '防御控制力', level: 0 },
                    { name: '法术控制力', level: 0 },
                    { name: '抗法控制力', level: 0 },
                    { name: '育兽术', level: 0 },
                ],
            },
        ],
        /* 12 格铺满：前 6 件人物装备、接着 4 件灵饰、最后 2 件玉魄。 */
        gear: GEAR_SLOTS.map((slot) => ({ slot })),
        gearMeta: { special: '', suit: '' },
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
                    { name: '攻击修炼', level: 4 },
                    { name: '防御修炼', level: 14 },
                    { name: '法术修炼', level: 10 },
                    { name: '抗法修炼', level: 14 },
                    { name: '猎术修炼', level: 0 },
                ],
            },
            {
                title: '宠物修炼',
                rows: [
                    { name: '攻击控制力', level: 0 },
                    { name: '防御控制力', level: 0 },
                    { name: '法术控制力', level: 0 },
                    { name: '抗法控制力', level: 0 },
                    { name: '育兽术', level: 5 },
                ],
            },
        ],
        gear: GEAR_SLOTS.map((slot) => ({ slot })),
        gearMeta: { special: '', suit: '' },
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
