/**
 * 收益页的**规则**：类型、金额换算、归一、合计与按日分组。
 *
 * 与 `prices.ts` / `characters/roster.ts` 同一种分工：这一层是纯函数，能单测；
 * `income-store.ts` 只管「读、改、写、把改不成的原因交回去」；`.vue` 只管摆。
 *
 * ---- 金额只存一个数 ----
 * 速记时人说的是「这件 4.6 万」，而**库里存原值**（`46000`）：与物价同一个口径，
 * 显示时才折万。存「4.6」再配一个单位列，等于每处读取都要记得乘回去，
 * 而漏乘一次的表现是「账目少了一万倍」——这种错不会报错，只会让总数悄悄不对。
 *
 * 方向由 `kind` 说，**不用负数**：支出存正数 + `kind: 'expense'`。
 * 负数与「支出」两套写法混用，汇总时漏掉一处就会把净额算反。
 */
import { makeId } from '../../services/shape';
import { moneyText, todayText } from '../prices/prices';

/** 一万。速记的输入框收「万」（打 `4.6`），落库是「原值」（`46000`）。 */
export const WAN = 10_000;

export type IncomeKind = 'income' | 'expense';

/**
 * 一笔收益/支出。
 *
 * `characterId` 允许空串：整号摆摊、代练收入不该硬塞给某一个角色。
 * 角色被删掉时**不清这条记录**，界面上按「未指定角色」显示——账不能因为改了个名字就少一笔。
 */
export interface IncomeEntry {
    id: string;
    /** `YYYY-MM-DD`。 */
    date: string;
    characterId: string;
    kind: IncomeKind;
    /** 原值（梦幻币），恒大于 0。 */
    amount: number;
    /** 物品名；手记时可空。 */
    item: string;
    note: string;
    createdAt: number;
}

/** 一件速记物品的参考单价（原值）。没有条目 = 还没设过价。 */
export interface QuickPrices {
    [itemId: number]: number;
}

/** 万 → 原值。**必须取整**：`4.6 * 10000` 在浮点里是 46000.00000000001。 */
export function fromWan(wan: number): number {
    return Math.round(wan * WAN);
}

/** 原值 → 万（不取整：界面上要显示 4.6，取整会变成 5）。 */
export function toWan(amount: number): number {
    return amount / WAN;
}

/**
 * 把一笔金额平分给 `count` 个人，**总额一分不差**。
 *
 * 不能写成 `amount / count`：`4.6 万 ÷ 3` 是 `15333.33…`，三个人各记 15333 就少了 1 币，
 * 各记 15334 又多 2 币。账本里这种「少一点」不会报错，只会让总额与当天实际收入对不上，
 * 而且攒上几十条之后再查是哪几条造成的，基本查不出来。
 *
 * 做法是**整数币上算**：先整除、再把余数（最多 `count - 1` 币）一币一币地补给排在
 * 前面的人。于是 1000000 分给 3 人是 `333334 / 333333 / 333333`——差别只有一块钱，
 * 但三条相加严格等于原额。
 *
 * 差额给「前面的人」而不是随机或都给最后一个：**结果要可复现**。同一份输入每次算出来
 * 一样，测试才写得出期望，用户对不上账时才查得清。
 *
 * `count <= 1` 时原样返回一条——速记里「不指定角色」走的也是这条路。
 */
export function splitAmount(amount: number, count: number): number[] {
    const size = Math.max(1, Math.round(count) || 1);
    const total = Math.round(amount);
    const base = Math.floor(total / size);
    const rest = total - base * size;
    return Array.from({ length: size }, (_, index) => base + (index < rest ? 1 : 0));
}

/** 金额一句话：「4,120 万」/「8,000」。与物价页同一个口径（共用 `moneyText`）。 */
export function amountText(amount: number): string {
    return moneyText(amount);
}

/**
 * 金额的**紧凑写法**：`4.6 万` → `4.6万`。
 *
 * `moneyText` 里那个空格是给表格中一列数字对齐用的。速记的格子下面是一条窄签
 * （44 宽起），空格白占半个字，还把「万」推成一个看着像另一样东西的字
 * （2026-11-04 用户：「价格数字加万字」）。**只在窄签里用**，表格照旧。
 */
export function compactAmount(amount: number): string {
    return amountText(amount).replace(' ', '');
}

/**
 * 记完之后回执里的那句话。
 *
 * 多选记给几个号时要说清**总额没变、只是分成了几份**：只说「已记 4.6 万」，
 * 用户会以为每个号都进了 4.6 万；只说「已记 3 条」又看不出钱对不对。
 * 所以两句都给：总额 + 分给了几个号。
 */
export function recordSummary(item: string, entries: readonly IncomeEntry[]): string {
    const name = item || '这一笔';
    const total = entries.reduce((sum, one) => sum + one.amount, 0);
    if (entries.length <= 1) return `已记 ${name} · ${amountText(total)}`;
    return `已记 ${name} · ${amountText(total)} → ${entries.length} 个号平分`;
}

/* ---------- 归一 ----------
 * 库是上一版应用写的、或有人手动改过备份时，读出来的不一定合今天的形。
 * **坏条目单条丢掉，不抛错**：一条坏记录不该让整页白屏，而它在界面上表现为
 * 「少了一笔」——所以丢掉时必须 `console.error` 出来，不能静默。
 */
function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEntry(raw: unknown): IncomeEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;

    const date = text(one.date);
    if (!DATE.test(date)) return null;

    /* 金额是这一页的命：0 或负数会让「今天赚了多少」直接算错，宁可丢掉。
     * 四舍五入到整数：币没有小数，而备份里可能带着浮点尾巴。 */
    const amount = Math.round(num(one.amount));
    if (amount <= 0) return null;

    return {
        id: text(one.id) || makeId('inc'),
        date,
        characterId: text(one.characterId),
        kind: one.kind === 'expense' ? 'expense' : 'income',
        amount,
        item: text(one.item),
        note: text(one.note),
        createdAt: num(one.createdAt) || Date.now(),
    };
}

/** 整份归一：坏条目丢掉并报出来，好的留下。排序在这里不做（读取方各自排序）。 */
export function parseEntries(raw: unknown): IncomeEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: IncomeEntry[] = [];
    for (const one of raw) {
        const entry = normalizeEntry(one);
        if (entry) out.push(entry);
        else console.error('丢掉一条读不懂的收益记录', one);
    }
    return out;
}

/** 单价表归一：键是物品 id、值是正数原价。0 与负数丢掉（0 表示「没设价」）。 */
export function parsePrices(raw: unknown): QuickPrices {
    const out: QuickPrices = {};
    if (!Array.isArray(raw)) return out;
    for (const one of raw) {
        if (!one || typeof one !== 'object') continue;
        const row = one as Record<string, unknown>;
        const itemId = num(row.itemId);
        const price = Math.round(num(row.price));
        if (itemId <= 0 || price <= 0) continue;
        out[itemId] = price;
    }
    return out;
}

/* ---------- 合计与分组 ---------- */

export interface Totals {
    /** 收入合计（原值）。 */
    income: number;
    /** 支出合计（原值，正数）。 */
    expense: number;
    /** 净额 = 收入 − 支出；**可为负**。 */
    net: number;
    /** 笔数。 */
    count: number;
}

/** 一组记录的合计。空数组返回全 0（不是 null）——界面直接显示「0 万」比「—」好读。 */
export function totalsOf(entries: readonly IncomeEntry[]): Totals {
    let income = 0;
    let expense = 0;
    for (const one of entries) {
        if (one.kind === 'expense') expense += one.amount;
        else income += one.amount;
    }
    return { income, expense, net: income - expense, count: entries.length };
}

export interface DayGroup {
    date: string;
    entries: IncomeEntry[];
    totals: Totals;
}

/**
 * 按日期分组，**新的在前**；组内也按 `createdAt` 倒序（同一分钟里后记的在上）。
 *
 * 排序在这里做而不是靠 SQL：库里读回来是倒序，可 `localStorage` 那条路径与
 * 「刚在内存里插了一条」都不保证顺序，两处各排一次迟早不一致。
 *
 * **眼下没有界面调用方**：今日清单只筛一天（`entriesOn`），分组的用处是「全部记录」
 * 那个浮层（下一批）。留着它是因为这就是这套数据的分组口径，删掉那一批还得原样写回来，
 * 而测试正盯着它——`dayGroupsOf` 现在是一条**有断言守着的预备件**，不是散落的死代码。
 */
export function dayGroupsOf(entries: readonly IncomeEntry[]): DayGroup[] {
    const byDate = new Map<string, IncomeEntry[]>();
    for (const one of entries) {
        const list = byDate.get(one.date);
        if (list) list.push(one);
        else byDate.set(one.date, [one]);
    }

    return [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([date, list]) => {
            const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
            return { date, entries: sorted, totals: totalsOf(sorted) };
        });
}

/** 某一天的记录（今天）。日期字符串比较即可——`YYYY-MM-DD` 天生可排序。 */
export function entriesOn(entries: readonly IncomeEntry[], date: string): IncomeEntry[] {
    return entries.filter((one) => one.date === date);
}

/** 今日一景：同一件物品、同一个价合到一格，`×N` 就是今天记了几次。 */
export interface ItemGroup {
    /**
     * 分组键：`kind|名字|金额`。
     *
     * 同名的一收一支不该合成一格——那会把两个方向的数抵消掉。**同一个名字的不同价也要
     * 分开**：这是 2026-11-04 用户提的（「固定价格的可以 ×N，不固定的价格不同的就分开」），
     * 因为浮动价的物品（金币、代练）每条价都不一样，合成一格之后那一格只能显示一个价，
     * 而它并不代表组里任何一条。按价分开之后，`total / count` 恒等于这一格的价，
     * 显示哪个都对。
     */
    key: string;
    name: string;
    kind: IncomeKind;
    /** 组内**每一条**的金额（原值，正数）。按金额分组，所以组里是同一个数。 */
    amount: number;
    /** 今天这件物品、这个价记了几条（这就是界面上那个 `×N`）。 */
    count: number;
    /** 这一组合计（原值，正数）= `amount × count`。 */
    total: number;
    /** 组里**最后**记的那一条，撤销时撤它。 */
    lastId: string;
    lastAt: number;
    /**
     * 这一组记给过哪些角色（去重，空串 = 未指定）。
     *
     * 聚合之后，界面上再也看不到「刚才那笔记给了谁」——而「记给」那排胶囊会停在最后一次
     * 的选择上，换号忘了切，后面几条就全进了上一个号。所以这串 id 留着：它进 `title` 与
     * 读屏标签（「记给 归ω岚、小雷」），把归属从「看得见」降级为「指得到」，不是丢掉。
     */
    whoIds: string[];
}

/**
 * 按「物品 + 单价」把今天的记录合成一格一格的「图标 · 价 · ×次数」（2026-11-04 用户：
 * 「不要列表这种汇总，一眼可以看清」，后又补「不固定的价格不同的就分开」）。
 *
 * 排序按**条数降序**，不是金额：用户看这一栏要回答的是「今天都点了些什么、各点了几下」，
 * 点了 20 次的定魂珠哪怕单价便宜，也是今天的主旋律；按金额排会让便宜但高频的东西沉底。
 * 条数相同再按金额、最后按名字（`localeCompare` 只为让结果稳定，不是给人看的顺序）。
 *
 * `lastId` 取 `createdAt` 最大的那条：撤销时撤的一定是「刚记的那一下」，
 * 而不是列表里碰巧排在前面的一条。
 */
export function groupByItem(entries: readonly IncomeEntry[]): ItemGroup[] {
    const map = new Map<string, ItemGroup>();
    for (const one of entries) {
        const name = one.item || '未记物品';
        const kind: IncomeKind = one.kind === 'expense' ? 'expense' : 'income';
        const key = `${kind}|${name}|${one.amount}`;
        const hit = map.get(key);
        if (!hit) {
            map.set(key, {
                key,
                name,
                kind,
                amount: one.amount,
                count: 1,
                total: one.amount,
                lastId: one.id,
                lastAt: one.createdAt,
                whoIds: one.characterId ? [one.characterId] : [],
            });
            continue;
        }
        hit.count += 1;
        hit.total += one.amount;
        if (one.characterId && !hit.whoIds.includes(one.characterId)) {
            hit.whoIds.push(one.characterId);
        }
        /* `>=` 而不是 `>`：同一毫秒里记的两条（连点）取后插入的那条，
         * 它在数组前面，也就是「最近记住的一下」。 */
        if (one.createdAt >= hit.lastAt) {
            hit.lastAt = one.createdAt;
            hit.lastId = one.id;
        }
    }

    return [...map.values()].sort(
        (a, b) => b.count - a.count || b.total - a.total || a.name.localeCompare(b.name, 'zh'),
    );
}

/**
 * 往前推 `offset` 天的日期文本（`offset = 0` 就是今天）。
 *
 * 放在这一层而不是页面里：它是「近七天」这个口径的一部分，与 `today()` 一样属于规则。
 * 原先写在 `IncomeView.vue` 里，一方面页面那层的分工写着「只留界面状态」，
 * 一方面这种函数**必须能单测**——`setMonth` 在跨月、跨年、夏令时上的表现没人记得住。
 *
 * **走本地时区、手动拼 `YYYY-MM-DD`**，不用 `toISOString()`：后者是 UTC，
 * 在东八区每天 08:00 之前会把日期退一天，于是「近七天」在早上少算一天。
 * `offset` 为负（往后推）也成立——`setDate` 自己会进位。
 */
export function daysAgo(offset: number, from: Date = new Date()): string {
    const at = new Date(from.getTime());
    at.setDate(at.getDate() - offset);
    const month = `${at.getMonth() + 1}`.padStart(2, '0');
    const day = `${at.getDate()}`.padStart(2, '0');
    return `${at.getFullYear()}-${month}-${day}`;
}

/** 今天。与物价页同一天口径（本地时区、`YYYY-MM-DD`），共用同一个函数。 */
export function today(): string {
    return todayText();
}

/**
 * 历史列表里那一天的写法：`今天` / `昨天` / `11月2日` / `2025年12月30日`。
 *
 * 近两天用人话，再往前给月日——「11月2日」比「2026-11-02」快读一档，而年份在
 * 一本只记了几个月的新账里是纯噪声（真跨年了才补，不然「12月30日」会让人以为是今年的）。
 *
 * `now` 可以注入：这个函数要能单测，而直接取 `today()` 的测试会在跨午夜时随机失败。
 * 「昨天」走 `daysAgo`，不自己减毫秒：跨月、跨年、夏令时都由它承担，那是它已经测过的部分。
 */
export function dayText(date: string, now: string = today()): string {
    if (date === now) return '今天';
    if (date === daysAgo(1, new Date(`${now}T00:00:00`))) return '昨天';

    const [year, month, day] = date.split('-');
    const label = `${Number(month)}月${Number(day)}日`;
    return year === now.slice(0, 4) ? label : `${year}年${label}`;
}
