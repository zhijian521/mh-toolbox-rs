/**
 * 收益 → 账号的**按天自动同步**：把「当天的净收益」与「当天分摊的点卡」写成账号流水。
 *
 * ---- 每天每角色两条，不是一条 ----
 * 用户定的口径（2026-11-11）：**不把点卡从收益里扣掉再合并**。两条各说一件事——
 *   - `游戏收益`（收入）= 当天这个号速记的净额（含物品），**不扣点卡**；
 *   - `点卡消耗`（支出）= 当天这个号分摊的点卡。
 * 合成一条的话，用户在账号页看到的是「一个数」，而他想核对的是「今天赚了多少、烧了多少」；
 * 而且点卡口径一关，合并过的那一条就没法退回原样了。
 *
 * ---- 为什么是「算出来 + 整批替换」 ----
 * 这两类记录不是用户写的，是**当下这份速记与上线记录的函数**。速记被撤回、时长被改，
 * 对应的账号记录就该跟着变或消失。所以每次同步都重算全表，交给
 * `accounts-store` 的 `applyAutoEntries` 整批替换（它只动 `source === 'auto'` 的那些），
 * 手记的一条不碰。
 *
 * ---- 为什么以「天」为粒度而不是「这一小时」 ----
 * 用户要的是「以天为单位自动记录在账号收支里」。按小时写会一天冒出十几笔，
 * 账号页那张流水表就没法读了。
 */
import { watch } from 'vue';
import { daysAgo } from '../../services/format';
import { useAccounts, type AutoInput } from '../accounts/accounts-store';
import { useOnline } from '../income/online-store';
import { useIncome } from '../income/income-store';
import { cardCostByDay } from '../income/online';
import { totalsOf, type IncomeEntry } from '../income/income';

/** 自动同步写出来的两种分类。与 `accounts.ts` 的 `ACCOUNT_CATEGORIES` 同名。 */
export const AUTO_INCOME = '游戏收益';
export const AUTO_CARD = '点卡消耗';

/**
 * 一条自动记录的稳定 id。
 *
 * **必须由「日期 + 角色 + 分类」拼出来**：同步是 upsert 语义，同一天同一个号同一种账
 * 每次都要落到同一个 id 上。用随机 id 的话，第二次同步就是一整批新记录，
 * 而旧的那批被 `applyAutoEntries` 删掉——净效果没错，但 `createdAt` 每次都变，
 * 列表里那两行会一直往下跑。
 */
export function dailyKey(date: string, characterId: string, category: string): string {
    return `auto-${date}-${characterId || 'none'}-${category === AUTO_CARD ? 'card' : 'income'}`;
}

/**
 * 某一天每个角色的净收益（原值整数），键是角色 id。
 *
 * 用 `totalsOf` 而不是自己 `reduce`：收益页统计条上的「净额」用的是同一个函数，
 * 两处各算一次的话，卡片上的数与账号里那一笔迟早会不一样。
 */
function netByCharacter(entries: readonly IncomeEntry[], date: string): Map<string, number> {
    const byWho = new Map<string, IncomeEntry[]>();
    for (const one of entries) {
        if (one.date !== date) continue;
        const list = byWho.get(one.characterId) ?? [];
        list.push(one);
        byWho.set(one.characterId, list);
    }
    const out = new Map<string, number>();
    for (const [id, list] of byWho) out.set(id, totalsOf(list).net);
    return out;
}

/**
 * 算出「这一天」应该有哪些自动记录（不落盘）。`date` 是 `YYYY-MM-DD`。
 *
 * 收益只写 `> 0` 的：当天没赚到钱就不该在账号里留一条 0 元的收入（`normalizeEntry`
 * 也会把它丢掉，只是丢掉时没人知道）。点卡反过来——**写着开关就照写**，因为
 * 「今天没扣点卡」与「今天没玩」在账面上必须分得开。
 */
export function autoRowsOf(date: string): AutoInput[] {
    const { entries } = useIncome();
    const { sessions, settings } = useOnline();

    const rows: AutoInput[] = [];

    for (const [characterId, net] of netByCharacter(entries.value, date)) {
        if (net <= 0) continue;
        /* 「不指定角色」的那批（空串）也写：它对应收益页里没记给任何号的速记，
         * 而账号页的「未指定」本来就是一个合法的归属。 */
        rows.push({
            id: dailyKey(date, characterId, AUTO_INCOME),
            date,
            characterId,
            category: AUTO_INCOME,
            kind: 'income',
            amount: net,
            note: '收益页自动同步',
        });
    }

    if (settings.value.cardCost) {
        /* 一张表算全量再按天筛：跨天的那一段在 `cardCostByDay` 里已经按本地零点切好了，
         * 这里再按日期取自己那一片，两边不会因为「谁负责切天」而各算一次。 */
        for (const [key, amount] of cardCostByDay(sessions.value)) {
            const at = key.indexOf('|');
            const day = key.slice(0, at);
            const characterId = key.slice(at + 1);
            if (day !== date || amount <= 0) continue;
            rows.push({
                id: dailyKey(date, characterId, AUTO_CARD),
                date,
                characterId,
                category: AUTO_CARD,
                kind: 'expense',
                amount,
                note: '在线时长折算',
            });
        }
    }

    return rows;
}

/**
 * 同步**一天**。调用点在「速记变了 / 计时结束或开始 / 启动补算」三处。
 *
 * 只同步受影响的那些天，不做全量：全量要遍历所有历史记录，而它会被速记连点反复触发。
 *
 * 返回失败原因而不是抛错——同步是**副动作**，它失败不该让「速记已记上」这件事变成失败。
 * 界面上按老版本的做法提示一句「收益已记录，但同步到账号失败」。
 */
export function syncDay(date: string): { ok: boolean; error?: string } {
    const { applyAutoEntries } = useAccounts();
    const result = applyAutoEntries(autoRowsOf(date));
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * 「速记或计时一变就同步」——**在这里挂一次监听**，而不是在每个改动点手写一句同步。
 *
 * 改动点有五处（速记、撤回、改一条、开始计时、结束计时），逐处调 `syncDay` 的话
 * 迟早会漏掉一处，而漏掉的表现是「账号里今天少一笔」——它不会报错。
 *
 * 监听的是**输入**（收益与上线记录），不是账号账本：同步会写账号，
 * 若把账号也纳入监听就成了自激循环。
 *
 * 400ms 合并：速记是连点的动作，点十下要写十次账号是没有意义的。
 */
export function startDailySync(): void {
    const { entries } = useIncome();
    const { sessions, settings } = useOnline();
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(
        [entries, sessions, settings],
        () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = undefined;
                /* 两天：跨零点的那一段会同时落在今天与昨天，只同步今天会让昨晚那半截
                 * 的点卡永远补不上。 */
                syncRecent(2);
            }, 400);
        },
        { deep: true },
    );
}

/**
 * 同步**最近几天**。启动时用：应用关着的那几天没人触发同步，而用户的账要补齐。
 *
 * 取最近 `days` 天（含今天）逐个调 `syncDay`：不是「从最早一条记录算起」——
 * 那会把几年前的数据都重算一遍，而它们早就定型了。
 */
export function syncRecent(days = 7): { ok: boolean; error?: string } {
    /* 日期一律走 `format.ts` 的 `daysAgo`：这里原先手拼了一份「本地零点减天数」，
     * 与 `dateText` / `parseDay` 是同一个口径的第三份实现——跨月、跨年、夏令时
     * 三处都得对，而只要有一处先漂，补算的那几天就会错开一格。 */
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const result = syncDay(daysAgo(offset));
        if (!result.ok) return result;
    }
    return { ok: true };
}
