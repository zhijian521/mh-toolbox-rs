/**
 * 收益页「上线计时」的**规则**：时长、点卡成本、按天切开、分摊。
 *
 * 与 `income.ts` 同一种分工：这里全是纯函数（能单测），`online-store.ts`
 * 只管读写与调账，`.vue` 只管摆。
 *
 * ---- 三个量纲，别混 ----
 * 1. **时长**用分钟算，界面显示的「3 小时 20 分」是显示的写法；
 * 2. **点卡**用「点」算：`每号每小时 6 点`（`POINTS_PER_HOUR`），多开时按号数乘；
 * 3. **钱**用原值算：单价存 `15000`（= 1.5 万/点），成本也是原值整数。
 *    与收益、物价同一个口径——**存原值，显示时才折万**。
 *
 * ---- 为什么按天切 ----
 * 一晚连续挂 6 小时会跨过零点。账要「以天为单位」记，那一段就必须拆成两天两笔；
 * 不拆的话，昨天的账里少一块、今天的多一块，而两条各自都对不上当天实际在线。
 */

import { pad2 } from '../../services/clock';
import { dateText } from '../../services/format';

/** 每个号每小时消耗几点。写死是有理由的：这是游戏的计费口径，不是可配置项。 */
export const POINTS_PER_HOUR = 6;

/** 默认点卡单价（原值）：1.5 万/点。与老版本 `cardPrice` 的默认值同一个数。 */
export const DEFAULT_CARD_PRICE = 15_000;

/** 点卡口径。库里只有一行，见 `store.rs` 的 `online_settings`。 */
export interface OnlineSettings {
    /** 单价，**原值**：`15000` = 1.5 万/点。 */
    cardPrice: number;
    /**
     * 是否把点卡折算成账号支出。
     *
     * 关掉只是**口径开关**：已经算好的成本照旧显示，已经同步进账号的那几笔也不删。
     * 理由与老版本一样——用户是「以后不这么记了」，不是「以前那些账都不算」。
     */
    cardCost: boolean;
}

/** 一次上线。`endAt` 为 `null` = 还在计时。 */
export interface OnlineSession {
    id: string;
    /** 开始那天的 `YYYY-MM-DD`。 */
    date: string;
    startAt: number;
    endAt: number | null;
    /** 主体角色（多开时是其中之一）。 */
    characterId: string;
    /** 多开的完整名单；空数组 = 单开。 */
    roster: string[];
    /** `startAt` 那一刻的单价快照（原值）。改了单价不回头重算历史。 */
    cardPrice: number;
    note: string;
    createdAt: number;
}

/** 一天里的一段（跨天的那一段会被切成两片）。 */
export interface DaySlice {
    date: string;
    minutes: number;
}

/**
 * 这次上线算在哪些号头上。
 *
 * `roster` 为空时回落到 `characterId`——单开时前端不会填名单（填一份只有一个人
 * 的数组没有意义），于是「谁在线」这条信息只能从这里推。
 */
export function ownersOf(session: OnlineSession): string[] {
    const list = session.roster.filter((id) => id);
    /* 去重：多选面板理论上不会给出重复项，但账本不能因为面板的 bug 多扣一份点卡。 */
    const unique = Array.from(new Set(list));
    if (unique.length > 0) return unique;
    return session.characterId ? [session.characterId] : [];
}

/** 这一段实际持续了多少分钟。还在计时时用 `now` 补终点。 */
export function sessionMinutes(session: OnlineSession, now: number = Date.now()): number {
    const end = session.endAt ?? now;
    return Math.max(0, (end - session.startAt) / 60_000);
}

/**
 * 把一段按**本地日**切开，每片给出日期与分钟数。
 *
 * 用 `Date` 的本地分量找下一道零点，而不是「按 24 小时硬切」：夏令时之外，
 * 本地日就是 24 小时；但「按 24 小时切」在跨零点时会把 23:30 那段算进「开始日 + 1 天」
 * 的同一格里，日期字符串与用户看到的日期对不上。
 */
export function sessionSlices(session: OnlineSession, now: number = Date.now()): DaySlice[] {
    const end = session.endAt ?? now;
    if (end <= session.startAt) return [];

    const slices: DaySlice[] = [];
    let cursor = session.startAt;
    /* 上限 32 片：一段计时超过一天本就异常（应用没关、忘了结束），
     * 而无限循环的后果是把页面挂死。宁可只切一个月，也不要死循环。 */
    while (cursor < end && slices.length < 32) {
        const at = new Date(cursor);
        const nextMidnight = new Date(
            at.getFullYear(),
            at.getMonth(),
            at.getDate() + 1,
            0,
            0,
            0,
            0,
        ).getTime();
        const stop = Math.min(end, nextMidnight);
        slices.push({
            date: dateText(at),
            minutes: (stop - cursor) / 60_000,
        });
        cursor = stop;
    }
    return slices;
}

/**
 * 一片（一天、多人）的点卡成本，**原值整数**。
 *
 * 取整只发生在这里一次：先按「分钟 × 每小时点数 × 号数 × 单价」算出整段的真值，
 * 再四舍五入到整币。分给个人时用 `splitAmount`，于是几个人加起来**严格等于**这个数
 * ——早先版本先除再各自取整，五个号分摊时会出现「统计扣了 1 万、流水只有 9999」。
 */
export function sliceCost(minutes: number, accounts: number, cardPrice: number): number {
    const size = Math.max(1, Math.round(accounts) || 1);
    const price = Number.isFinite(cardPrice) && cardPrice > 0 ? cardPrice : DEFAULT_CARD_PRICE;
    return Math.round((minutes / 60) * POINTS_PER_HOUR * size * price);
}

/** 这次上线的总成本（所有片相加）。界面上的「本次消耗」用它。 */
export function sessionCost(session: OnlineSession, now: number = Date.now()): number {
    const owners = ownersOf(session);
    if (owners.length === 0) return 0;
    return sessionSlices(session, now).reduce(
        (sum, slice) => sum + sliceCost(slice.minutes, owners.length, session.cardPrice),
        0,
    );
}

/** 一次上线的结果摘要（线上记录列表里每行右侧那个数）。 */
export interface SessionFacts {
    minutes: number;
    cost: number;
    /** 算在几个号头上。 */
    owners: number;
    /** 还在计时。 */
    running: boolean;
}

export function factsOfSession(session: OnlineSession, now: number = Date.now()): SessionFacts {
    return {
        minutes: sessionMinutes(session, now),
        cost: sessionCost(session, now),
        owners: ownersOf(session).length,
        running: session.endAt === null,
    };
}

/**
 * 某个号在 `[from, to]` 里的点卡成本。
 *
 * **按角色分摊只在这一处发生**：`syncDailyAccounts` 写账号流水时用的也是这条路径
 * （`shareOfSlice`），两处共用才能保证「卡片上的数」与「账号里的那一笔」永远相等。
 */
export function cardCostOf(
    sessions: readonly OnlineSession[],
    from: string,
    to: string,
    characterId = '',
    now: number = Date.now(),
): number {
    let total = 0;
    for (const session of sessions) {
        const owners = ownersOf(session);
        if (owners.length === 0) continue;
        if (characterId && !owners.includes(characterId)) continue;
        const index = characterId ? owners.indexOf(characterId) : -1;
        for (const slice of sessionSlices(session, now)) {
            if (slice.date < from || slice.date > to) continue;
            const amount = sliceCost(slice.minutes, owners.length, session.cardPrice);
            total += index >= 0 ? shareOfSlice(amount, owners.length)[index] : amount;
        }
    }
    return total;
}

/**
 * 把一片的总成本分给若干号，**总和一分不差**。
 *
 * 与 `income.ts` 的 `splitAmount` 是同一条算法（余数补给前面的人，结果可复现），
 * 但那一个是收益页「速记平分」的口径，这边单独留一份是为了标题上的分工：
 * 哪天收益页改了口径，点卡不该跟着悄悄变。
 */
export function shareOfSlice(amount: number, count: number): number[] {
    const size = Math.max(1, Math.round(count) || 1);
    const total = Math.round(amount);
    const base = Math.floor(total / size);
    const rest = total - base * size;
    return Array.from({ length: size }, (_, index) => base + (index < rest ? 1 : 0));
}

/**
 * 按「天 + 角色」摊出来的点卡成本表（原值整数），键是 `${date}|${characterId}`。
 *
 * 自动同步写账号时用它一次算全表：逐条调 `cardCostOf` 会把每个角色都对着全部记录扫一遍，
 * 而那正是「速记一变就同步」这条路上最贵的一段。
 *
 * 分摊口径与 `cardCostOf` 完全一致（`shareOfSlice`），否则卡片与账号两边又会对不上。
 */
export function cardCostByDay(
    sessions: readonly OnlineSession[],
    now: number = Date.now(),
): Map<string, number> {
    const out = new Map<string, number>();
    for (const session of sessions) {
        const owners = ownersOf(session);
        if (owners.length === 0) continue;
        for (const slice of sessionSlices(session, now)) {
            const parts = shareOfSlice(
                sliceCost(slice.minutes, owners.length, session.cardPrice),
                owners.length,
            );
            owners.forEach((id, index) => {
                const key = `${slice.date}|${id}`;
                out.set(key, (out.get(key) ?? 0) + parts[index]);
            });
        }
    }
    return out;
}

/**
 * 按「天 + 角色」摊出来的在线分钟数，键是 `${date}|${characterId}`。
 *
 * 与 `cardCostByDay` 同一条切天口径（`sessionSlices`），只是这里只数时长不折钱：
 * 卡片上那两张图要按天、按号各画一条线，而「这个号今天在线多久」与「扣了多少点卡」
 * 是两个问题——单价中途改了，成本就不与时长成正比。
 *
 * 一段多人（`roster` 非空的老记录）里每个人各得整段时长：那段时间他们确实都在线，
 * 只是点卡要按人头乘，所以成本那边才要分摊。
 */
export function minutesByDay(
    sessions: readonly OnlineSession[],
    now: number = Date.now(),
): Map<string, number> {
    const out = new Map<string, number>();
    for (const session of sessions) {
        const owners = ownersOf(session);
        if (owners.length === 0) continue;
        for (const slice of sessionSlices(session, now)) {
            for (const id of owners) {
                const key = `${slice.date}|${id}`;
                out.set(key, (out.get(key) ?? 0) + slice.minutes);
            }
        }
    }
    return out;
}

/** 在线统计：时长、点卡成本、进行中的条数。 */
export interface OnlineTotals {
    /** 分钟数（`running` 的那几段按「到现在」算）。 */
    minutes: number;
    /** 原值。 */
    cost: number;
    /** 已结束的段数。 */
    count: number;
    /** 还在计时的段数。 */
    running: number;
}

export function onlineTotalsOf(
    sessions: readonly OnlineSession[],
    from: string,
    to: string,
    now: number = Date.now(),
): OnlineTotals {
    let minutes = 0;
    let cost = 0;
    let count = 0;
    let running = 0;
    for (const session of sessions) {
        const owners = ownersOf(session);
        if (owners.length === 0) continue;
        let touched = false;
        for (const slice of sessionSlices(session, now)) {
            if (slice.date < from || slice.date > to) continue;
            touched = true;
            minutes += slice.minutes;
            cost += sliceCost(slice.minutes, owners.length, session.cardPrice);
        }
        if (!touched) continue;
        if (session.endAt === null) running += 1;
        else count += 1;
    }
    return { minutes, cost, count, running };
}

/** 时长写法：`3 小时 20 分` / `48 分` / `—`（0 分钟）。 */
export function minutesText(minutes: number): string {
    const total = Math.max(0, Math.round(minutes));
    if (total <= 0) return '—';
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (hours === 0) return `${rest} 分`;
    if (rest === 0) return `${hours} 小时`;
    return `${hours} 小时 ${rest} 分`;
}

/** 精确到分钟的短写法（记录列表里用）：`03:20`。 */
export function clockText(minutes: number): string {
    const total = Math.max(0, Math.round(minutes));
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/* ---------- 归一 ----------
 * 库是上一版写的、或有人手改过备份时，读出来的不一定合今天的形。
 * 与 `income.ts` / `accounts.ts` 同一条边界：**坏条目单条丢掉，不抛错**。
 */
function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSession(raw: unknown): OnlineSession | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Record<string, unknown>;

    const startAt = num(one.startAt);
    if (startAt <= 0) return null;
    /* 终点必须严格晚于起点：早先有人手改备份把两者写反，读出来的时长是负数，
     * 而界面上表现为「在线 −2 小时」。这种记录留着不如丢掉。 */
    const endRaw = one.endAt;
    const endAt = typeof endRaw === 'number' && Number.isFinite(endRaw) ? endRaw : null;
    if (endAt !== null && endAt <= startAt) return null;

    const rosterRaw = one.roster;
    const roster = Array.isArray(rosterRaw)
        ? rosterRaw.filter((id): id is string => typeof id === 'string' && id !== '')
        : [];

    const price = num(one.cardPrice);

    return {
        id: text(one.id) || `onl-${startAt.toString(36)}`,
        date: DATE.test(text(one.date)) ? text(one.date) : dateText(startAt),
        startAt,
        endAt,
        characterId: text(one.characterId),
        roster,
        /* 单价快照为 0 时回落到默认：一条「0 元/点」的记录会让那段时长白算，
         * 而界面上它长得像「这段时间没扣点卡」。 */
        cardPrice: price > 0 ? price : DEFAULT_CARD_PRICE,
        note: text(one.note),
        createdAt: num(one.createdAt) || startAt,
    };
}

export function normalizeSettings(raw: unknown): OnlineSettings {
    if (!raw || typeof raw !== 'object') {
        return { cardPrice: DEFAULT_CARD_PRICE, cardCost: true };
    }
    const one = raw as Record<string, unknown>;
    const price = num(one.cardPrice);
    return {
        cardPrice: price > 0 ? price : DEFAULT_CARD_PRICE,
        /* 只认 `false` 是「关」：缺字段、`null`、`"false"` 一律当开启。
         * 点卡口径默认开着——关掉的代价是账少算一笔，而用户会以为「今天没扣点卡」。 */
        cardCost: one.cardCost !== false,
    };
}

export function parseSessions(raw: unknown): OnlineSession[] {
    if (!Array.isArray(raw)) return [];
    const list: OnlineSession[] = [];
    for (const one of raw) {
        const parsed = normalizeSession(one);
        if (parsed) list.push(parsed);
        else console.error('丢弃一条读不懂的上线记录', one);
    }
    return list.sort((left, right) => right.startAt - left.startAt);
}
