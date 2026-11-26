/** 完整演示账本的唯一生成入口：固定编号、相对日期，每次返回独立副本，不读写 store。 */
import { dateText, daysAgo, parseDay } from '../../services/format';
import { quickItems, schoolNames } from '../../services/game-data';
import type { Pet } from '../characters/pets';
import type { AssistSkill, CharacterData } from '../characters/character';
import { CHARACTERS } from '../characters/mock';
import { emptyCharacter, normalizeCharacter } from '../characters/roster';
import { schoolSkills } from '../characters/schools';
import type { AccountEntry } from '../accounts/accounts';
import type { IncomeEntry } from '../income/income';
import { DEFAULT_CARD_PRICE, type OnlineSession } from '../income/online';
import type { Goal } from '../goals/goals';
import type { PriceItem } from '../prices/prices';
import { identifyCharacterAssets, mergeCharacterAssets } from '../warehouse/character-assets';
import type { GoalInput } from '../goals/goals-store';
import type { ReadonlyCharacter } from '../characters/character';
import { parseWarehouse, type WarehouseItem } from '../warehouse/warehouse';

/** 整套账本中的未穿戴资产；使用固定编号，和角色资产分开。 */
export function demoWarehouseItems(): WarehouseItem[] {
    const base = {
        server: '紫禁之巅',
        createdAt: 1_800_000_000_000,
        updatedAt: 1_800_000_000_000,
    };
    return parseWarehouse([
        {
            ...base,
            id: 'demo-warehouse-gear',
            kind: 'gear',
            gear: {
                slot: '武器',
                detail: {
                    name: '霜冷九州',
                    kind: '剑',
                    level: 160,
                    stats: [
                        { label: '命中', value: '720' },
                        { label: '伤害', value: '650' },
                    ],
                },
            },
        },
        { ...base, id: 'demo-warehouse-pet', kind: 'pet', pet: MAXED_PET },
    ]);
}

/** 目标只关联本套模拟角色，不引用当前真实名册。 */
export function demoGoalInputs(characters: readonly ReadonlyCharacter[]): GoalInput[] {
    const selected = characters.slice(0, 2);
    if (!selected.length) return [];
    const base = {
        members: selected.map((one) => ({ id: one.id, name: one.name })),
        deadline: '',
        note: '',
        title: '',
        target: 0,
        unit: '项',
        tracking: null,
    };
    return [
        {
            ...base,
            kind: 'growth',
            title: '示例 · 角色等级',
            target: Math.max(...selected.map((one) => one.level)) + 1,
            unit: '级',
            tracking: { category: 'level', key: '角色等级' },
        },
        {
            ...base,
            kind: 'combo',
            title: '示例 · 组合养成',
            items: selected.flatMap((one) => [
                {
                    characterId: one.id,
                    tracking: { category: 'level' as const, key: '角色等级' },
                    target: Math.max(1, one.level),
                },
                {
                    characterId: one.id,
                    tracking: { category: 'assist' as const, key: '强身术' },
                    target: (one.assists.find((row) => row.name === '强身术')?.level ?? 0) + 10,
                },
            ]),
        },
    ];
}

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
 * 练满的号：门派技能全上限、十项修炼全满、五项辅助、一只满配召唤兽。
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
    return {
        ...base,
        id: 'demo-max',
        name: '天罡·满级',
        level: 175,
        school,
        server: '紫禁之巅',
        guild: '账本试笔',
        growthHistory: [
            {
                id: 'demo-growth-level',
                date: daysAgo(2),
                createdAt: 0,
                source: 'edit',
                note: '',
                changes: [{ group: '角色', label: '等级', from: '174', to: '175' }],
            },
            {
                id: 'demo-growth-assist',
                date: daysAgo(1),
                createdAt: 0,
                source: 'goal',
                note: '强身修满',
                changes: [{ group: '生活技能', label: '强身术', from: '130', to: '140' }],
            },
        ],
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
            rows: group.rows.map((row) => ({
                ...row,
                level: row.name === '育兽术' ? 35 : 20,
            })),
        })),
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
    return [...CHARACTERS, maxedCharacter(), blankCharacter()].map((one) =>
        identifyCharacterAssets(normalizeCharacter(one), true),
    );
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

/** 收益、在线和账号统一使用同一批角色与日期，重载后由正常流程派生自动账目。 */
export function buildDemoData(now = new Date()) {
    const characters = demoCharacters();
    const members = characters.slice(0, 2).map(({ id, name }) => ({ id, name }));
    const today = dateText(now);
    const stamp = now.getTime();
    const at = (day: number, hour = 10) => {
        const time = parseDay(daysAgo(day, now));
        time.setHours(hour, 0, 0, 0);
        return time.getTime();
    };
    const prices: PriceItem[] = DEMO_PRICES.map((one, index) => ({
        id: `demo-price-${index}`,
        name: one.name,
        category: one.category,
        sub: one.sub,
        unit: '个',
        note: one.note,
        points: one.points.map((point, pointIndex) => ({
            id: `demo-price-${index}-point-${pointIndex}`,
            date: daysAgo(point.daysAgo, now),
            price: point.price,
            note: point.note ?? '',
            createdAt: point.daysAgo ? at(point.daysAgo) : stamp,
        })),
        createdAt: at(4),
        updatedAt: stamp,
    }));
    const income: IncomeEntry[] = [];
    const online: OnlineSession[] = [];
    // 近两周用于日趋势，更早的记录用于近月／半年与全部的范围差异。
    for (const day of [...Array.from({ length: 14 }, (_, index) => index), 35, 90, 160, 240]) {
        for (const [index, character] of members.entries()) {
            const createdAt = day ? at(day) : stamp;
            income.push({
                id: `demo-income-${day}-${index}`,
                date: daysAgo(day, now),
                characterId: character.id,
                kind: 'income',
                amount: wan(24 + (day % 5) * 7 + index * 11),
                item: day % 2 ? '师门任务' : '捉鬼任务',
                note: '模拟数据',
                createdAt,
            });
            income.push({
                id: `demo-expense-${day}-${index}`,
                date: daysAgo(day, now),
                characterId: character.id,
                kind: 'expense',
                amount: wan(3 + index),
                item: '任务补给',
                note: '模拟数据',
                createdAt,
            });
            // 不自动启动计时；历史时段均已结束，也不占用真实角色。
            if (day > 0) {
                online.push({
                    id: `demo-online-${day}-${index}`,
                    date: daysAgo(day, now),
                    startAt: at(day, 19),
                    endAt: at(day, 21) + index * 30 * 60_000,
                    characterId: character.id,
                    roster: [],
                    cardPrice: DEFAULT_CARD_PRICE,
                    cardCost: true,
                    note: '模拟数据',
                    createdAt,
                });
            }
        }
    }
    const baseGoal = {
        members,
        deadline: '',
        tracking: null,
        note: '模拟数据',
        createdAt: stamp,
    };
    const goals: Goal[] = demoGoalInputs(characters).map((input, index) => ({
        ...input,
        id: `demo-goal-${index}`,
        logs: [],
        createdAt: stamp,
        ...(input.kind === 'combo' ? { comboVersion: 1 as const } : {}),
    }));
    goals.push(
        {
            ...baseGoal,
            id: 'demo-goal-money',
            kind: 'money',
            title: '模拟 · 攒一套装备钱',
            target: 3000,
            unit: '万',
            logs: [
                {
                    id: 'demo-goal-deposit',
                    date: today,
                    delta: 850,
                    note: '起步存款',
                    createdAt: stamp,
                },
            ],
        },
        {
            ...baseGoal,
            id: 'demo-goal-gear',
            kind: 'gear',
            title: '模拟 · 凑齐装备',
            target: 6,
            unit: '件',
            logs: [
                {
                    id: 'demo-goal-gear-log',
                    date: today,
                    delta: 2,
                    note: '已备两件',
                    createdAt: stamp,
                },
            ],
        },
        {
            ...baseGoal,
            id: 'demo-goal-manual',
            kind: 'manual',
            title: '模拟 · 每周副本',
            target: 20,
            unit: '次',
            logs: [
                {
                    id: 'demo-goal-manual-log',
                    date: today,
                    delta: 6,
                    note: '已完成六次',
                    createdAt: stamp,
                },
            ],
        },
    );
    const stock = demoWarehouseItems().map((item) => ({
        ...item,
        createdAt: stamp,
        updatedAt: stamp,
    }));
    const pet = stock.find((one) => one.kind === 'pet')!;
    const bought = { ...pet, id: 'demo-bought-pet' };
    const sold = { ...stock[0], id: 'demo-sold-gear' };
    const entry = (id: string, patch: Partial<AccountEntry>): AccountEntry => ({
        id,
        date: today,
        characterId: members[0].id,
        kind: 'expense',
        currency: 'rmb',
        category: '其他收支',
        channel: '游戏内',
        amount: 100,
        note: '模拟数据',
        createdAt: stamp,
        source: '',
        ...patch,
    });
    const accounts: AccountEntry[] = [
        entry('demo-account-card', { category: '点卡充值', channel: '官方充值', amount: 50 }),
        entry('demo-account-cash-in', {
            category: '游戏币买入',
            currency: 'cash',
            kind: 'income',
            amount: wan(1000),
        }),
        entry('demo-account-rmb-out', { category: '游戏币买入', channel: '藏宝阁', amount: 80 }),
        entry('demo-account-cash-out', {
            category: '游戏币卖出',
            currency: 'cash',
            amount: wan(600),
        }),
        entry('demo-account-rmb-in', {
            category: '游戏币卖出',
            channel: '藏宝阁',
            kind: 'income',
            amount: 45.5,
        }),
        entry('demo-account-pet-buy', { category: '召唤兽交易', amount: 3500, assets: [bought] }),
        entry('demo-account-gear-sale', {
            category: '装备交易',
            kind: 'income',
            amount: 1800,
            assets: [sold],
        }),
    ];
    const fixed = quickItems().fixed.slice(0, 3);
    const quickPrices = fixed.map((item, index) => ({
        itemId: item.id,
        price: wan(5 + index * 3),
    }));
    // 固定单价和物价同名卡使用相同当前价，避免启动联动改写这份初始场景。
    for (const [index, item] of fixed.entries()) {
        const existing = prices.find((one) => one.name === item.name);
        const point = {
            id: `demo-quick-point-${item.id}`,
            date: today,
            price: quickPrices[index].price,
            note: '模拟数据',
            createdAt: stamp,
        };
        if (existing) {
            existing.points = existing.points.filter((one) => one.date !== today);
            existing.points.push(point);
        } else {
            prices.push({
                id: `demo-quick-price-${item.id}`,
                name: item.name,
                category: '任务产出',
                sub: '',
                unit: '个',
                note: '模拟固定单价',
                points: [point],
                createdAt: stamp,
                updatedAt: stamp,
            });
        }
    }
    return {
        format: 2 as const,
        app: 'mh-toolbox-rs' as const,
        exportedAt: stamp,
        characters,
        prices,
        income,
        accounts,
        goals,
        warehouse: mergeCharacterAssets([...stock, bought], characters),
        online,
        quickPrices,
        cardSettings: { cardPrice: DEFAULT_CARD_PRICE, cardCost: true },
    };
}

export function demoCounts(data: ReturnType<typeof buildDemoData>) {
    return {
        characters: data.characters.length,
        prices: data.prices.length,
        income: data.income.length,
        accounts: data.accounts.length,
        goals: data.goals.length,
        warehouse: data.warehouse.length,
        online: data.online.length,
    };
}
