/**
 * 开发帮助里「导入模拟数据」的那一份数据与那两个循环。
 *
 * 目的只有一个：**让刚做完的功能有东西可看**。角色卡要看到「练满」与「刚开号」两种极端，
 * 物价页要看到涨、跌、持平，以及一张「还没记过价」的卡——否则每验一次界面都要手填十行属性。
 *
 * ---- 只走 store 的公开方法 ----
 * 不直接改 `roster` / `items` 这两个 ref，也不碰 localStorage：`useRoster()` 的
 * `add` / `remove` 与 `usePrices()` 的 `addItem` / `removeItem` / `addPoint` 都自己落盘，
 * 内存里那份也跟着换。于是**不需要 reload**——设置页的「导入备份」走的是 Rust 整份替换，
 * 那边必须 `location.reload()`；这一条是从应用自己的数据层写的，重载反而会把刚弹出来的
 * 回执一起丢掉。
 *
 * ---- 为什么先清空再写 ----
 * 导入的定义是「让界面变成这份样子」。追加写第二遍会得到两份同名角色、两份同名物品
 * （物价那边还会因为重名被 `addItem` 拒掉一半），越点越乱。清空和写入在同一个动作里，
 * 确认窗挡在前面，代价写在问句里。
 *
 * ---- 为什么写死，不随机 ----
 * 每次点出来一样，验界面时「昨天那一版长什么样」还能对上；随机数只会让「这条为什么
 * 只涨了一点」变成一件无法复现的事。
 *
 * ---- 以后每加一个带持久化的功能，都在这份里补一段 ----
 * 这个按钮的意义是「一屏有没有东西可看」。功能加了、数据没加，开发页就只覆盖了半张表，
 * 而缺的那半张恰恰要手填十行才验得出来（CONVENTIONS §2.3-6）。补的时候照三条走：
 * **写死**（可复现，不随机）、**量级真实**（见下一条）、**极端态齐全**——满、空、
 * 只有一条、一条没有，四种里至少给前两种，否则退墨与空行那几屏永远验不到。
 *
 * ---- 数量 ----
 * 4 个角色：两个来自 `mock.ts` 的种子（装备、召唤兽、浮片都有完整内容），两个按极端造
 * （一个练满、一个空号）。6 件物价：4 件五天的走势、1 件只有一天、1 件一条没有。
 *
 * ---- 数字要像真的 ----
 * 模拟数据最怕的是「量级不对」：一屏看着像表，读第二个数字就出戏（一颗宝石 820 币、
 * 175 级号力量 1046）。物价一律按**万**写（`42 * WAN`），因为这一行里所有人谈价都说万；
 * 角色数值按同级号该有的量级给——练满那张卡是「175 级物理系」，不是把种子放大 1.35 倍。
 */
import { schoolNames } from '../../services/game-data';
import type { AssistSkill, CharacterData, Pet } from '../characters/character';
import { CHARACTERS } from '../characters/mock';
import { emptyCharacter, normalizeCharacter, useRoster } from '../characters/roster';
import { schoolSkills } from '../characters/schools';
import { usePrices } from '../prices/prices-store';

/* ======================================================================
 * 角色
 * ==================================================================== */

/**
 * 练满号的属性读数（175 级物理系）。
 *
 * 几个不是随手取的点：**人气 800 是上限**（游戏里封顶就是 800，写 820 一眼是编的）；
 * **命中高于伤害**（同级号的命中通常比伤害高两百上下，反过来等于这一身装备只在挨打）；
 * 五维总和约 2020——130 级的种子是 1580，45 级只多出 225 点可加，剩下的靠装备，
 * 所以 175 级不该出现「力量 1046」这种把总和撑到 2300 的数。
 *
 * 只填一部分：留空的格子同样是给人看的——「这一项还没记」与「这一项是 0」在这张表上
 * 必须分得开，全填满反而验不出 `normalizeCharacter` 有没有把空串兜住。
 */
const MAXED_ATTRS: Record<string, string> = {
    气血: '12,860',
    魔法: '3,180',
    活力: '1,240',
    体力: '1,180',
    人气: '800',
    帮贡: '3,640',
    门贡: '1,980',
    命中: '3,286',
    伤害: '3,126',
    防御: '1,834',
    速度: '642',
    法伤: '1,205',
    法防: '1,388',
    体质: '412',
    魔力: '168',
    力量: '786',
    耐力: '268',
    敏捷: '386',
    乾元丹: '12',
    潜能果: '86',
};

/** 一只「能看出是满配」的召唤兽：资质、成长、内丹、灵性都给上。 */
const MAXED_PET: Pet = {
    name: '霄汉',
    level: 175,
    joinLevel: 65,
    quality: {
        attack: 1688,
        defense: 1436,
        hp: 3420,
        mp: 2620,
        speed: 1502,
        dodge: 1388,
    },
    life: 120,
    growth: '1.286',
    element: '火',
    attrs: [
        { label: '气血', value: '2,046' },
        { label: '魔法', value: '1,312' },
        { label: '攻击', value: '2,388' },
        { label: '防御', value: '836' },
        { label: '速度', value: '312' },
        { label: '法伤', value: '862' },
        { label: '法防', value: '862' },
        { label: '忠诚', value: '100' },
    ],
    skills: ['连击', '必杀', '吸血', '偷袭', '神佑复生'],
    innerPills: ['狂怒', '坚甲', '迅捷'],
    spirit: 100,
};

/**
 * 练满的号：门派技能全上限、十项修炼全满、五项辅助、三件装备、一只满配召唤兽。
 *
 * 用 `emptyCharacter()` 起手而不是手写整份对象：结构（五组属性、十二格装备、十项修炼）
 * 由它按清单建，这里只覆盖**值**。游戏表没加载上时门派技能会是空的，那时它退化成一个
 * 属性有数的号——仍然能看，不会白屏。
 */
function maxedCharacter(): CharacterData {
    const base = emptyCharacter();
    /* 取表里的第二家，避开种子的「五庄观」，这样两张卡的图标不是同一套。 */
    const school = schoolNames()[1] ?? base.school;
    const skills = schoolSkills(school).map((row) => ({ ...row, level: row.cap ?? 180 }));
    const assists: AssistSkill[] = [
        { name: '强身术', level: 140, cap: 140, kind: 'life' },
        { name: '冥想', level: 120, cap: 140, kind: 'life' },
        { name: '打造技巧', level: 160, cap: 160, kind: 'life' },
        { name: '调息', level: 5, cap: 5, kind: 'story' },
        { name: '打坐', level: 5, cap: 5, kind: 'story' },
    ];
    /* 装备只给前三格一个名字：**空位要占格**这件事，正是这一页要验的其中一条。 */
    const gearNames = ['霜冷九州', '罗汉金钟·冠', '无量净瓶'];

    return {
        ...base,
        id: 'demo-max',
        name: '天罡·满级',
        level: 175,
        school,
        server: '紫禁之巅',
        guild: '账本试笔',
        attrGroups: base.attrGroups.map((group) => ({
            ...group,
            rows: group.rows.map((row) => ({ ...row, value: MAXED_ATTRS[row.label] ?? '' })),
        })),
        /* 175 级是当前满级，经验条本就该是满的：两栏同数，于是这一条读作「本级已满」，
         * 与种子的 130 级（3,777.2万 / 4,200万）形成对照。 */
        experience: { value: '9,860万', need: '9,860万' },
        skills,
        assists,
        trainings: base.trainings.map((group) => ({
            ...group,
            rows: group.rows.map((row) => ({ ...row, level: row.cap })),
        })),
        gear: base.gear.map((slot, index) =>
            index < gearNames.length ? { ...slot, caption: gearNames[index] } : slot,
        ),
        pets: [MAXED_PET],
    };
}

/**
 * 空号：只有名字、等级、区服。
 *
 * 它验的是另一种极端——卡上「还没有记录辅助技能」「12 格全空」「师门七项全 0」
 * （0 级那一档退墨）、修炼十行全 0（签里的数也退一档）。这些状态在种子那两个号上看不到。
 */
function blankCharacter(): CharacterData {
    const base = emptyCharacter();
    return {
        ...base,
        id: 'demo-empty',
        name: '初入江湖',
        level: 69,
        server: '生日快乐',
        guild: '',
    };
}

/** 导入用的四个角色，**每份都是新副本**（`normalizeCharacter` 逐字段新建）。 */
export function demoCharacters(): CharacterData[] {
    return [...CHARACTERS, maxedCharacter(), blankCharacter()].map(normalizeCharacter);
}

/* ======================================================================
 * 物价
 * ==================================================================== */

interface DemoPoint {
    /** 几天前。0 = 今天。 */
    daysAgo: number;
    price: number;
    note?: string;
}

interface DemoPrice {
    name: string;
    category: string;
    sub: string;
    note: string;
    /** 由旧到新；空数组 = 那张「还没记过价」的卡。 */
    points: DemoPoint[];
}

/**
 * 万 → 梦幻币原值。**物价一律按万写**：`wan(42)` 读作「42 万」，存进去是 420000。
 *
 * 为什么不直接写 420000：这一页上没人说「四十二万」以外的数，写五个零只会在核对时数错
 * 一位；也不直接写 42——`price` 存的是原值（见 `prices.ts` 的 `priceLabel`），
 * 42 就是 42 币，显示出来连「万」字都不带。
 *
 * 取整不是为了好看：`12.8 * 10000` 在浮点里是 128000.00000000001，直接存会让
 * 「12.8 万」在编辑格里回显成 12.8000。`PriceField` 输入时也是这么四舍五入的。
 */
function wan(amount: number): number {
    return Math.round(amount * 10_000);
}

/**
 * 六件物价，覆盖九类里的五类，涨跌平各一条。
 *
 * 量级按摆摊的实际报价给，**一页里同时有两种量级才是真实的**：无级别武器与高级兽决是
 * 「几千万」那一档，宝石、精铁、五宝、三药是「几万到几十万」那一档。全都写成四位数
 * 看着整齐，读第二行就穿帮（一颗舍利子 820）。
 *
 * 走势也克制：一周内 +3.7%（武器，周中急出压过两百万）、-12%（周常产出多，五天连跌）、
 * 不到半成（宝石）。没有那种一天翻倍的线——真出现，多半是记错了区。
 */
export const DEMO_PRICES: DemoPrice[] = [
    {
        name: '霜冷九州',
        category: '装备灵饰',
        sub: '武器',
        note: '无级别限制，周末摆摊报价最高',
        points: [
            { daysAgo: 4, price: wan(5400) },
            { daysAgo: 3, price: wan(5200), note: '有人急出，压了两百万' },
            { daysAgo: 2, price: wan(5500) },
            { daysAgo: 1, price: wan(5800), note: '周末摆摊' },
            { daysAgo: 0, price: wan(5600) },
        ],
    },
    {
        name: '高级魔兽要诀·必杀',
        category: '兽决内丹',
        sub: '高级兽决',
        note: '周常产出多，整周都在往下走',
        points: [
            { daysAgo: 4, price: wan(4680) },
            { daysAgo: 3, price: wan(4520) },
            { daysAgo: 2, price: wan(4360) },
            { daysAgo: 1, price: wan(4240) },
            { daysAgo: 0, price: wan(4120) },
        ],
    },
    {
        name: '舍利子',
        category: '宝石符石',
        sub: '宝石',
        note: '一颗的价，五日波动不到半成',
        points: [
            { daysAgo: 4, price: wan(13.2) },
            { daysAgo: 3, price: wan(13.0) },
            { daysAgo: 2, price: wan(12.8) },
            { daysAgo: 1, price: wan(13.0) },
            { daysAgo: 0, price: wan(12.9) },
        ],
    },
    {
        name: '百炼精铁',
        category: '打造材料',
        sub: '百炼精铁',
        note: '90 级那一档，打造活动前后差价最明显',
        points: [
            { daysAgo: 4, price: wan(34) },
            { daysAgo: 3, price: wan(41), note: '打造活动前抢货' },
            { daysAgo: 2, price: wan(38) },
            { daysAgo: 1, price: wan(36) },
            { daysAgo: 0, price: wan(35) },
        ],
    },
    {
        name: '定魂珠',
        category: '任务产出',
        sub: '五宝',
        note: '只记过一次，用来验「只有一天」的卡',
        points: [{ daysAgo: 0, price: wan(4.6) }],
    },
    {
        name: '金香玉',
        category: '消耗补给',
        sub: '三药',
        note: '一条都没记，用来验「未记录」的空态',
        points: [],
    },
];

/* ======================================================================
 * 导入
 * ==================================================================== */

/**
 * 界面上的两处数字都读这一份：开关旁边那行小字，与确认窗问句里的「N 个角色”。
 *
 * 不把 4 / 6 写进模板——补数据的人改了上面两张表，界面却还报旧数，那是最难发现的一种
 * 不一致（不报错、不影响功能，只是说了假话）。
 */
export const DEMO_COUNTS = {
    /* + 2 = `maxedCharacter()` 与 `blankCharacter()`，种子角色之外的这两个极端。 */
    characters: CHARACTERS.length + 2,
    prices: DEMO_PRICES.length,
};

export type DemoImportResult =
    { ok: true; characters: number; prices: number } | { ok: false; error: string };

/** 几天前的日期文本，与 `prices.ts` 的 `todayText()` 同一种写法（`YYYY-MM-DD`）。 */
function dayText(daysAgo: number): string {
    const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const month = `${at.getMonth() + 1}`.padStart(2, '0');
    const day = `${at.getDate()}`.padStart(2, '0');
    return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * 把两份模拟数据写进名册与物价表，**先清空再写**。
 *
 * 读失败时**拒绝动手**：两个 store 的 `persist()` 都有「读失败一律不写」的闸，可内存里
 * 仍会被改成这份模拟数据——界面看着像成功了，重启之后却什么都没留下，比报错更误导人。
 * 所以先在这里拦一道，把原因交回页面去说。
 */
export function importDemoData(): DemoImportResult {
    const roster = useRoster();
    const prices = usePrices();

    if (roster.loadError.value || prices.loadError.value) {
        return { ok: false, error: '名册或物价表正处在读取失败状态，先修好再来导入' };
    }

    for (const one of [...roster.roster.value]) roster.remove(one.id);
    const characters = demoCharacters();
    for (const one of characters) roster.add(one);

    for (const one of [...prices.items.value]) prices.removeItem(one.id);
    let imported = 0;
    for (const demo of DEMO_PRICES) {
        /* `initialPrice` 给 0：日期要按 `daysAgo` 自己排，交给 `addItem` 只会落成今天。 */
        const added = prices.addItem(
            { name: demo.name, category: demo.category, sub: demo.sub, note: demo.note },
            0,
        );
        if (!added.ok) continue;
        imported += 1;
        for (const point of demo.points) {
            prices.addPoint(added.id, {
                date: dayText(point.daysAgo),
                price: point.price,
                note: point.note ?? '',
            });
        }
    }

    return { ok: true, characters: characters.length, prices: imported };
}
