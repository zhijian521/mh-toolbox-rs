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
import { dateText, daysAgo, moneyText } from '../../services/format';
import { makeId } from '../../services/shape';

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

/* `WAN` / `fromWan` / `toWan` 在 `services/format.ts`：金额换算是全站口径，
 * 不属于收益页。这里只留收益页自己的两件事——平分与回执。 */

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
    /** 笔数（收 + 支）。 */
    count: number;
    /**
     * 收入 / 支出的笔数。
     *
     * 统计条的副文要写「31 笔 · 均 14.9 万」，那个 31 必须是**收入**笔数而不是总笔数——
     * 用总数去除收入合计，算出来的是「每笔的平均」，两者差着一个量级。
     * 放在 `totalsOf` 里一次数完，比在页面里再 filter 一遍省事，也不会两处口径不同。
     */
    incomeCount: number;
    expenseCount: number;
}

/** 一组记录的合计。空数组返回全 0（不是 null）——界面直接显示「0 万」比「—」好读。 */
export function totalsOf(entries: readonly IncomeEntry[]): Totals {
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    for (const one of entries) {
        if (one.kind === 'expense') {
            expense += one.amount;
            expenseCount += 1;
        } else {
            income += one.amount;
            incomeCount += 1;
        }
    }
    return {
        income,
        expense,
        net: income - expense,
        count: entries.length,
        incomeCount,
        expenseCount,
    };
}

/* ---------- 范围窗口 ----------
 * 「今天 / 近七天 / 本月」原先写在 `IncomeView` 的 `scoped` 里，是三个内联 `filter`。
 * 2026-11-05 统计条要显示「较上一档」，于是需要**同一个范围的前一档**——把窗口定义
 * 留在页面里，第二处（上一档）就得照抄一遍边界，而「近七天」是不是含今天、
 * 「本月」从 1 号还是从今天算，抄的人各有各的理解。
 * 现在窗口只有这一份，页面只选名字。
 */

export type IncomeRange = 'day' | 'week' | 'month';

/** 闭区间。`YYYY-MM-DD` 天生可比较，所以直接比字符串。 */
export interface DateWindow {
    from: string;
    to: string;
}

/** 范围对应的窗口。 */
export function windowOf(range: IncomeRange, today: string): DateWindow {
    const at = new Date(`${today}T00:00:00`);
    if (range === 'day') return { from: today, to: today };
    /* 近七天 = 含今天的七天，不是「周一到今天」：周一切换会把周日那天从账上抹掉。 */
    if (range === 'week') return { from: daysAgo(6, at), to: today };
    return { from: `${today.slice(0, 7)}-01`, to: today };
}

/**
 * 紧邻的上一档，用来算「较上一档」。
 *
 * 三档各自与**同样长度、紧邻**的一段比：
 *   今天 → 昨天；近七天 → 再往前七天；本月 → 上月同期（1 号到上月同一天）。
 *
 * 「上月同期」不是「上月整月」：本月才过到 5 号，拿 5 天去比 30 天，百分比会永远是负的。
 * 上月没有那一天（3 月 31 日对 2 月）就截到月末，由 `new Date(y, m, 0)` 给出天数。
 */
export function previousWindowOf(range: IncomeRange, today: string): DateWindow {
    const at = new Date(`${today}T00:00:00`);
    if (range === 'day') {
        const yesterday = daysAgo(1, at);
        return { from: yesterday, to: yesterday };
    }
    if (range === 'week') return { from: daysAgo(13, at), to: daysAgo(7, at) };

    const endOfPrev = new Date(at.getFullYear(), at.getMonth(), 0).getDate();
    const day = Math.min(at.getDate(), endOfPrev);
    return {
        from: dateText(new Date(at.getFullYear(), at.getMonth() - 1, 1)),
        to: dateText(new Date(at.getFullYear(), at.getMonth() - 1, day)),
    };
}

/** 窗口内的记录。 */
export function entriesIn(entries: readonly IncomeEntry[], window: DateWindow): IncomeEntry[] {
    return entries.filter((one) => one.date >= window.from && one.date <= window.to);
}

/* ---------- 统计条的四格 ----------
 * 口径住在这里而不是页面里：收益页与总览页共用同一块（`StatStrip`），
 * 两页给出的数必须一模一样，所以连副文的写法都只能有一份。
 */

/**
 * 「较上一档」的变化率：`+12.4%` / `−3.1%` / `±0%` / `—`。
 *
 * 三种情况给「—」，都不是故障而是**算不出**：
 *   1. 上一档是 0——没有基数。写成 `+100%` 是假的（0 → 1 也是 +100%）。
 *   2. 两侧异号（净额由亏转盈）——跨零的百分比没有意义，写出来会被读成「涨了 300%」。
 *   3. 上一档没有记录，与 0 同一条路（`totalsOf` 空数组给 0）。
 *
 * 分母取绝对值：净额从 −12 万变成 −6 万，算的是「亏损收窄 50%」，
 * 符号说方向（+ 表示朝正方向走），不表示「现在是正数」。
 */
export function ratioText(current: number, previous: number): string {
    if (previous === 0) return '—';
    if (Math.sign(current) !== Math.sign(previous)) return '—';
    const ratio = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
    if (ratio === 0) return '±0%';
    return `${ratio > 0 ? '+' : '−'}${Math.abs(ratio)}%`;
}

/** 笔数的变化：`+6 笔` / `−3 笔` / `±0 笔`。笔数本来就是整数，用差比用百分比好读。 */
export function countDeltaText(current: number, previous: number): string {
    const diff = current - previous;
    if (diff === 0) return '±0 笔';
    return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} 笔`;
}

/** 这一组账涉及几个号、几条没归号。 */
export interface EntryFacts {
    /** 去重后的角色数（`characterId` 为空的那些不算）。 */
    names: number;
    /** 没指定角色的条数。 */
    unassigned: number;
}

export function factsOf(entries: readonly IncomeEntry[]): EntryFacts {
    const names = new Set<string>();
    let unassigned = 0;
    for (const one of entries) {
        if (one.characterId) names.add(one.characterId);
        else unassigned += 1;
    }
    return { names: names.size, unassigned };
}

/**
 * 统计条的一格。
 *
 * 与 `components/StatStrip.vue` 的 `StatItem` 结构相同，但**不引它的类型**：
 * 这一层是纯函数（要能单测），不该依赖一个 `.vue`；结构类型在这里天然兼容。
 */
export interface StatRow {
    cap: string;
    value: string;
    tone: 'num' | 'loss';
    /** 左下：这一格由什么组成（几笔、笔均、占比、结余率、几个号）。 */
    sub: string;
    /** 右下：较上一档的增减，已带符号；算不出时是「—」。 */
    delta: string;
}

/**
 * 笔均：圆到千币（0.1 万）。
 *
 * 不圆的话 `462.5 万 ÷ 31` 会显示成「14.9193 万」——`moneyText` 保留四位小数是为了
 * 与输入精度对齐（那是价格的事），而笔均是**估计值**，多出来的位数只会挤占那行小字。
 */
function averageText(total: number, count: number): string {
    if (!count) return '—';
    return moneyText(Math.round(total / count / 1000) * 1000);
}

/** 「占收入 2.7%」/「结余率 97.3%」。分母为 0 时给「—」，不编一个 0%。 */
function percentText(part: number, whole: number): string {
    if (!whole) return '—';
    return `${Math.round((part / whole) * 1000) / 10}%`;
}

/**
 * 四格的读数、副文与对比。
 *
 * `previous` 传 null 表示「上一档没有可比的一段」（窗口里一条记录都没有）——
 * 与传一份全 0 的合计等价，都落成「—」。做成可空是为了让调用方不必自己拼空对象。
 */
export function statRowsOf(current: Totals, previous: Totals | null, facts: EntryFacts): StatRow[] {
    const prev: Totals = previous ?? {
        income: 0,
        expense: 0,
        net: 0,
        count: 0,
        incomeCount: 0,
        expenseCount: 0,
    };

    const incomeSub = current.incomeCount
        ? `${current.incomeCount} 笔 · 均 ${averageText(current.income, current.incomeCount)}`
        : '—';
    const expenseSub = current.expenseCount
        ? current.income
            ? `${current.expenseCount} 笔 · 占收入 ${percentText(current.expense, current.income)}`
            : `${current.expenseCount} 笔`
        : '—';
    const netSub = current.income ? `结余率 ${percentText(current.net, current.income)}` : '—';
    /* 「几个号」在没有归号时不该写成「0 个号 · 3 条未指定」——那句话读起来像
     * 「一个号都没有，还漏了三条」，而事实是「这三条本来就没归号」。没号就只说条数。 */
    const countSub = current.count
        ? facts.names
            ? `${facts.names} 个号${facts.unassigned ? ` · ${facts.unassigned} 条未指定` : ''}`
            : `${facts.unassigned} 条未指定`
        : '—';

    return [
        {
            cap: '收入',
            value: amountText(current.income),
            tone: 'num',
            sub: incomeSub,
            delta: ratioText(current.income, prev.income),
        },
        {
            /* 支出为 0 时读数给「—」而不是「0 万」：这一天没花钱，与「花了 0 块」不是一回事
             * （后者不存在）。这条沿用 `StatStrip` 抽取前的写法。 */
            cap: '支出',
            value: current.expense ? `−${amountText(current.expense)}` : '—',
            tone: current.expense ? 'loss' : 'num',
            sub: expenseSub,
            delta: ratioText(current.expense, prev.expense),
        },
        {
            /* 负数必须带符号：只在颜色上转朱时，「15 万」会被读成「今天赚了 15 万」。 */
            cap: '净额',
            value: current.net < 0 ? `−${amountText(-current.net)}` : amountText(current.net),
            tone: current.net < 0 ? 'loss' : 'num',
            sub: netSub,
            delta: ratioText(current.net, prev.net),
        },
        {
            cap: '笔数',
            value: `${current.count}`,
            tone: 'num',
            sub: countSub,
            delta: countDeltaText(current.count, prev.count),
        },
    ];
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

/* `today` / `daysAgo` / `dayText` 已挪到 `services/format.ts`：物价页与收益页用的是
 * 同一天口径（本地时区、`YYYY-MM-DD`），原先各写一份、各自解释一遍为什么不用 `toISOString()`。
 * 现在全站只有 `todayText()` 一个「今天」，引用点直接用它，不再有第二个别名。
 */
