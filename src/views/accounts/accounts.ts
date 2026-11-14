import { isDayText } from '../../services/format';
/**
 * 账号页的**规则**：币种、分类、快速入口、金额口径、归一与汇总。
 *
 * 与 `income.ts` / `prices.ts` 同一种分工：这一层是纯函数，能单测；
 * `accounts-store.ts` 只管读写；`.vue` 只管摆。
 *
 * ---- 为什么是两本账 ----
 * 人民币按「元」、梦幻币按「万」，两者**从不相加**。合成一个「总收支」得来的那个数
 * 没有任何意义：1 元与 1 万金币不是一个量级的东西，加起来只是两个数拼在一起。
 * 所以页面上并排两张汇总卡，各自回答「这一本账怎么样」。
 *
 * 这也是 `amount` 的单位跟着 `currency` 走的原因：`rmb` 存元、`cash` 存原值（万 × 10000，
 * 与收益页同口径）。统一成一种单位反而会出现「1 元 = 1 万」这种中间态。
 */
import type { IconName } from '../../components/icons';
import { dateText, daysAgo, parseDay, todayText } from '../../services/format';
import { makeId } from '../../services/shape';

/** 币种。`rmb` 按元、`cash` 按万；这是**两本独立的账**，不是同一本账的两种记法。 */
export type Currency = 'rmb' | 'cash';

export type AccountKind = 'income' | 'expense';

/** 币种的中文名与单位。单位进输入框的标签、也进明细表头。 */
export const CURRENCY_META: Record<Currency, { label: string; unit: string }> = {
    rmb: { label: '人民币', unit: '元' },
    cash: { label: '梦幻币', unit: '万' },
};

/**
 * 分类：账号页记的是「钱包进出」，所以分类按**交易对象**分，不按物品分。
 *
 * 与收益页的物品清单不重叠：那边一项一件货（定魂珠、兽决），这边一类一笔钱。
 * 点卡拆两条（官方充值 / 游戏内买卡）是因为前者花人民币、后者花梦幻币，
 * 合成一条就得在明细里靠币种小字分辨。
 */
export const ACCOUNT_CATEGORIES = [
    '装备交易',
    '召唤兽交易',
    '点卡充值',
    '点卡购买',
    '游戏币买入',
    '游戏币卖出',
    '养成投入',
    /* 与收益页的速记**不是一件事**：那边是按物品的明细（今天点了 20 次定魂珠），
     * 这里是「这一段时间整体进账多少」的粗记。两者都记会让梦幻币收入出现两份，
     * 所以入口的 hint 里写明「一次性」——它是给懒得逐件速记的那天用的。 */
    '游戏产出',
    /* 下面两个只由收益页**自动同步**写入。留在清单里是因为编辑窗的分类下拉取自这里：
     * 删掉它，一条历史记录的分类就选中不了（显示成空白）。
     * 「游戏收益」与上面的「游戏产出」差在来源——前者是每天按角色算出来的净额
     * （见 views/accounts/daily-sync.ts），后者是用户自己填的一次性粗记。 */
    '游戏收益',
    /* 当天该角色分摊的点卡。与「点卡充值 / 点卡购买」不重复：那两条是**买卡**（进货），
     * 这条是**用卡**（在线时长折算出来的消耗）。 */
    '点卡消耗',
    '其他收支',
] as const;

export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/** 交易渠道。四项够用：其余场景都落在「其他」里，硬造渠道只会让下拉变长。 */
export const CHANNELS = ['游戏内', '藏宝阁', '官方充值', '其他'] as const;

export type Channel = (typeof CHANNELS)[number];

/**
 * 一笔账号收支。
 *
 * `characterId` 允许空串：点卡是全号共用的，不该硬塞给某一个角色。
 * 角色被删掉时**不清这条记录**，界面显示「未指定」——账不能因为改了个名字就少一笔。
 */
export interface AccountEntry {
    id: string;
    /** `YYYY-MM-DD`。 */
    date: string;
    characterId: string;
    kind: AccountKind;
    currency: Currency;
    category: string;
    channel: string;
    /** 正的金额；方向由 `kind` 说，不用负数。单位跟着 `currency` 走。 */
    amount: number;
    note: string;
    createdAt: number;
    /**
     * 哪儿来的：空串 = 手记，"auto" = 收益页按天自动同步的。
     *
     * **单独一栏而不是靠分类前缀猜**：自动同步每天每角色 upsert 一次，它必须准确认出
     * 「这一条是我上次写的」，否则第二次同步会写出重复的一笔；认反了更糟——用户手记的
     * 一条被当成自动的删掉，那是真丢账。
     */
    source: string;
}

/** 一本账的合计。两本账各算一份，`net` 可为负。 */
export interface AccountStats {
    income: number;
    expense: number;
    net: number;
    count: number;
}

/* ---------- 归一 ----------
 * 库可能是上一版应用写的、也可能是人手动改过的备份。**坏条目单条丢掉、不抛错**：
 * 一条坏记录不该让整页白屏。丢掉时 `console.error`，不能静默。
 */
function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 金额按币种收到该有的精度：人民币到分、梦幻币到整数。
 *
 * 这两条不是「顺手取整」：币没有小数，浮点尾巴（`46000.000000001`）会让同额的两笔
 * 在汇总时差出一点点，而差值出现在小数第 15 位时，人只会看到「总数不对」。
 */
function quantize(amount: number, currency: Currency): number {
    return currency === 'rmb' ? Math.round(amount * 100) / 100 : Math.round(amount);
}

export function normalizeEntry(raw: unknown): AccountEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;

    const date = text(one.date);
    if (!isDayText(date)) return null;

    /* 币种认不出就丢掉，**不猜**：单位差 10000 倍，猜错的那一条会让整本账的汇总错得离谱，
     * 而界面上它看起来只是一条普通记录。 */
    const currency = one.currency === 'rmb' ? 'rmb' : one.currency === 'cash' ? 'cash' : null;
    if (!currency) return null;

    const amount = quantize(num(one.amount), currency);
    if (amount <= 0) return null;

    return {
        id: text(one.id) || makeId('acc'),
        date,
        characterId: text(one.characterId),
        /* 认不出就当收入——与 `income.ts` 的 `normalizeEntry` 同一条兜底。
         * 两个页面在同一个字段上给两种默认值，查起账来会先怀疑是哪边算错了。 */
        kind: one.kind === 'expense' ? 'expense' : 'income',
        currency,
        category: text(one.category) || '其他收支',
        channel: text(one.channel) || '其他',
        amount,
        note: text(one.note),
        createdAt: num(one.createdAt) || Date.now(),
        /* 只认字面量 "auto"，其余一律当手记。旧库没有这一栏，读出来是空串 = 手记，
         * 于是升级后已有记录一条都不会被自动同步覆盖或删掉。 */
        source: one.source === 'auto' ? 'auto' : '',
    };
}

/** 整份归一：坏条目丢掉并报出来，好的留下。排序不在这里做（读取方各自排）。 */
export function parseAccounts(raw: unknown): AccountEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: AccountEntry[] = [];
    for (const one of raw) {
        const entry = normalizeEntry(one);
        if (entry) out.push(entry);
        else console.error('丢掉一条读不懂的账号记录', one);
    }
    return out;
}

/* ---------- 汇总与筛选 ---------- */

/**
 * 一本账的合计。只数 `currency` 那一种，另一种直接跳过——
 * 这就是「两本账从不相加」在代码里的样子。
 */
export function accountStats(entries: readonly AccountEntry[], currency: Currency): AccountStats {
    let income = 0;
    let expense = 0;
    let count = 0;
    for (const one of entries) {
        if (one.currency !== currency) continue;
        if (one.kind === 'income') income += one.amount;
        else expense += one.amount;
        count += 1;
    }
    income = quantize(income, currency);
    expense = quantize(expense, currency);
    return { income, expense, net: quantize(income - expense, currency), count };
}

/** 新的在上：同一天里最后记的那笔排最前。 */
export function newestFirst(entries: readonly AccountEntry[]): AccountEntry[] {
    return [...entries].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.createdAt - a.createdAt;
    });
}

/* ---------- 时间范围 ---------- */

export type RangePreset = 'month' | 'week' | 'all';

/**
 * 时间范围的三档。
 *
 * 「本月」与「近七天」是两种不同的问法（「这个月花了多少」vs「这几天花了多少」），
 * 而「全部」是唯一的对账口径——前两档给出的数都比全量小，用户想核对总额时必须有它。
 */
export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
    { value: 'month', label: '本月' },
    { value: 'week', label: '近七天' },
    { value: 'all', label: '全部' },
];

/**
 * 把档位换算成日期区间。`today` 可注入，否则测试会在跨午夜时随机失败。
 *
 * 「本月」的右端是**今天**而不是月末：账本里不该有未来的记录，而月末那天会把
 * 「本月」画成一个包含尚未发生的日子的区间。
 */
export function rangeOf(preset: RangePreset, today = todayText()): { from: string; to: string } {
    if (preset === 'all') return { from: '', to: '' };
    if (preset === 'week') return { from: daysAgo(6, parseDay(today)), to: today };
    const [year, month] = today.split('-').map(Number);
    return { from: dateText(new Date(year, month - 1, 1)), to: today };
}

/* ---------- 快捷记账 ---------- */

export interface Shortcut {
    id: string;
    title: string;
    /** 图标名，取自 `components/icons.ts` 的 `IconName`——写错名字在这里就报错，
     * 而不是等页面渲染出一个空方块。 */
    icon: IconName;
    /** 副标题：说清「花的是哪种钱、走哪个渠道」。 */
    hint: string;
    preset: {
        kind: AccountKind;
        currency: Currency;
        category: AccountCategory;
        channel: Channel;
    };
}

/**
 * 快捷入口：点一下就把「方向 + 币种 + 分类 + 渠道」填好，剩下的只是填金额。
 *
 * 这十一个不是「常用」的意思，而是**这个游戏里钱的所有走法**：人民币进出的四个口子
 * （藏宝阁买卖装备、买卖召唤兽）、点卡的两条路（官方充值花人民币、游戏内买卡花梦幻币）、
 * 游戏币的买卖、养成投入、日常产出、兜底的其他。
 *
 * 少了任何一个，用户就得从「其他收支」进去再改四个下拉——那四步里最容易被忘的是币种，
 * 而币种错了不会报错，只会让两本账各错一笔。
 */
export const SHORTCUTS: Shortcut[] = [
    {
        id: 'gear-buy',
        title: '买入装备',
        icon: 'sword',
        hint: '藏宝阁 · 人民币',
        preset: { kind: 'expense', currency: 'rmb', category: '装备交易', channel: '藏宝阁' },
    },
    {
        id: 'gear-sell',
        title: '卖出装备',
        icon: 'sword',
        hint: '藏宝阁 · 人民币',
        preset: { kind: 'income', currency: 'rmb', category: '装备交易', channel: '藏宝阁' },
    },
    {
        id: 'pet-buy',
        title: '买入召唤兽',
        icon: 'paw',
        hint: '藏宝阁 · 人民币',
        preset: { kind: 'expense', currency: 'rmb', category: '召唤兽交易', channel: '藏宝阁' },
    },
    {
        id: 'pet-sell',
        title: '卖出召唤兽',
        icon: 'paw',
        hint: '藏宝阁 · 人民币',
        preset: { kind: 'income', currency: 'rmb', category: '召唤兽交易', channel: '藏宝阁' },
    },
    {
        id: 'topup',
        title: '点卡充值',
        icon: 'card',
        hint: '官方充值 · 人民币',
        preset: { kind: 'expense', currency: 'rmb', category: '点卡充值', channel: '官方充值' },
    },
    {
        id: 'topup-cash',
        title: '点卡购买',
        icon: 'card',
        hint: '游戏内 · 梦幻币',
        preset: { kind: 'expense', currency: 'cash', category: '点卡购买', channel: '游戏内' },
    },
    {
        id: 'coin-buy',
        title: '买入游戏币',
        icon: 'coins',
        hint: '游戏内 · 人民币',
        preset: { kind: 'expense', currency: 'rmb', category: '游戏币买入', channel: '游戏内' },
    },
    {
        id: 'coin-sell',
        title: '卖出游戏币',
        icon: 'coins',
        hint: '游戏内 · 人民币',
        preset: { kind: 'income', currency: 'rmb', category: '游戏币卖出', channel: '游戏内' },
    },
    {
        id: 'progress',
        title: '养成投入',
        icon: 'growth',
        hint: '游戏内 · 梦幻币',
        preset: { kind: 'expense', currency: 'cash', category: '养成投入', channel: '游戏内' },
    },
    {
        id: 'game-income',
        title: '游戏产出',
        icon: 'bolt',
        /* 「不自动」必须写出来：分类清单里还有一个「游戏收益」是**自动**同步的，
         * 两个名字太近，不标一句用户会以为这条也会自己补上。 */
        hint: '游戏内 · 梦幻币 · 一次性 · 不自动',
        preset: { kind: 'income', currency: 'cash', category: '游戏产出', channel: '游戏内' },
    },
    {
        id: 'other',
        title: '其他收支',
        icon: 'ledger',
        hint: '自选方向与币种',
        preset: { kind: 'expense', currency: 'rmb', category: '其他收支', channel: '其他' },
    },
];
