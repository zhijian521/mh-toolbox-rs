/**
 * 上线计时的**持有者**：模块级单例 + 写入即落盘。
 *
 * 与 `income/income-store.ts` 同一套写法：规则全在 `online.ts`（纯函数、可单测），
 * 这里只做读、改、写，以及把「改不成」的原因交回去。
 *
 * ---- 为什么记录与口径一起写 ----
 * `OnlinePayload` 两栏一次读写（见 `store.rs` 的 `online_load`）：点卡成本要同时用到
 * 时长与单价，分两条命令会让卡片先画时长、再补成本，中间那一拍是错的。
 *
 * ---- 为什么计时中的那一条也落盘 ----
 * 不落盘的话，关掉应用那一刻正在计时的那段就没了；而「忘了点结束」是常态。
 * 于是 `endAt: null` 是一个**真实的状态**（不是「还没写」），启动时读回来就接着算。
 */
import { ref } from 'vue';
import { hasDesktop } from '../../services/desktop';
import { onlineLoad, onlineSave } from '../../services/storage';
import { dateText, fromWan } from '../../services/format';
import { createPersist } from '../../services/persist';
import { onStorageSync } from '../../services/storage-sync';
import { makeId } from '../../services/shape';
import {
    DEFAULT_CARD_PRICE,
    ownersOf,
    parseSessions,
    normalizeSettings,
    type OnlineSession,
    type OnlineSettings,
} from './online';

/** 浏览器预览（探针 / `npm run dev`）那一版存在这里；桌面版走 SQLite，两者各自独立。 */
const STORAGE_KEY = 'mh-online';

/** 全部上线记录。顺序由 `parseSessions` 排成「新的在上」。 */
const sessions = ref<OnlineSession[]>([]);

/** 点卡口径。改它会影响之后算出来的成本，不改已经写进账号的那几笔。 */
const settings = ref<OnlineSettings>({ cardPrice: DEFAULT_CARD_PRICE, cardCost: true });

/** 最近一次落盘失败的原因。 */
const writeError = ref('');

/** 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。 */
const loadError = ref('');

/** 读过一轮没有。`persist` 靠它挡住「还没读库就整份覆盖」。 */
const loaded = ref(false);

/** 一次写入的结果。 */
export type OnlineWrite = { ok: true; sessions: OnlineSession[] } | { ok: false; error: string };

interface StoredShape {
    sessions: unknown;
    settings: unknown;
}

function readLocal(): StoredShape | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as StoredShape) : null;
    } catch {
        return null;
    }
}

function saveLocal(payload: StoredShape): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('上线记录写不进 localStorage', error);
        writeError.value = '这一笔没存下来，检查一下浏览器存储空间';
    }
}

/** 内存 → 落库形状。与 `OnlinePayload` 同形。 */
function payloadOf(): { sessions: OnlineSession[]; settings: OnlineSettings } {
    return { sessions: sessions.value, settings: settings.value };
}

const persist = createPersist({
    label: '上线记录',
    loadError,
    loaded,
    writeError,
    writeLocal: () => saveLocal(payloadOf()),
    writeRemote: () => onlineSave(payloadOf()),
});

/**
 * 读档。**只能调一次，且在 mount 之前**（`main.ts` 的那个 `Promise.all`）。
 *
 * 读失败**不是空账**：把它当成空账的话，用户随手点一下「开始」就会整份覆盖原有记录。
 * 与收益账同一个判据，理由写在那里。
 */
export async function loadOnline(): Promise<void> {
    if (!hasDesktop()) {
        const stored = readLocal();
        sessions.value = parseSessions(stored?.sessions);
        settings.value = normalizeSettings(stored?.settings);
        loaded.value = true;
        return;
    }

    const stored = await onlineLoad();
    if (stored === null) {
        loadError.value = '读不出上线记录，已暂停写入以免覆盖原有数据';
        sessions.value = [];
        return;
    }
    loadError.value = '';
    loaded.value = true;
    sessions.value = parseSessions(stored.sessions);
    settings.value = normalizeSettings(stored.settings);
}

/* 多窗口同步：事件的边界在 `services/storage-sync.ts`。桌面版两窗共享同一个库，
 * 这条只在浏览器路径（`npm run dev` / 探针）上真的会发生。 */
onStorageSync(STORAGE_KEY, (raw) => {
    if (raw === null) {
        sessions.value = [];
        return;
    }
    try {
        const parsed = JSON.parse(raw) as StoredShape;
        sessions.value = parseSessions(parsed.sessions);
        settings.value = normalizeSettings(parsed.settings);
    } catch {
        console.error('storage 事件里的上线记录解析失败，保留当前数据不动');
    }
});

/* ---------- 读数 ---------- */

/** 还在计时的几条。界面据此把按钮从「上线」换成「结束」。 */
export function runningSessions(): OnlineSession[] {
    return sessions.value.filter((one) => one.endAt === null);
}

/** 这些号里有没有正在计时的。判断「能不能开始」用它。 */
function busyOf(ids: readonly string[]): string[] {
    const busy = new Set<string>();
    for (const session of runningSessions()) {
        for (const id of ownersOf(session)) {
            if (ids.includes(id)) busy.add(id);
        }
    }
    return [...busy];
}

function timeError(startAt: number, endAt: number | null): string {
    const now = Date.now();
    if (!Number.isFinite(startAt) || startAt <= 0 || startAt > now) return '开始时间不能晚于现在';
    if (endAt === null) return '';
    if (!Number.isFinite(endAt) || endAt > now) return '结束时间不能晚于现在';
    if (endAt <= startAt) return '结束时间要晚于开始时间';
    return endAt - startAt < 60_000 ? '时长至少要 1 分钟' : '';
}

/** 相邻时段允许衔接；同角色的重叠时段会重复计算时长与点卡。 */
function overlaps(ids: readonly string[], startAt: number, endAt: number | null, except = '') {
    return sessions.value.some(
        (one) =>
            one.id !== except &&
            ownersOf(one).some((id) => ids.includes(id)) &&
            startAt < (one.endAt ?? Infinity) &&
            one.startAt < (endAt ?? Infinity),
    );
}

/* ---------- 改 ---------- */

/**
 * 开始计时。
 *
 * **每个号各记一条**（2026-11-11 用户改成「随时可以单独上下某一个号」）：
 * 以前一次上线是「一组人共用一段」，于是想加第三个号只能把整组停掉重开；
 * 现在号与号之间互不相干，谁先上谁先计、谁先下谁先停，账也各自算各自的那份。
 *
 * 传入两个号就是同时开始两条。已经在计时的号**不覆盖**，整批拒掉并报出是谁——
 * 静默跳过会让用户以为两个都开了。
 */
export function startOnline(input: {
    characterIds: string[];
    /** 补记时用；不传 = 现在。 */
    startAt?: number;
    note?: string;
}): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来记' };

    const ids = Array.from(new Set(input.characterIds.filter(Boolean)));
    if (ids.length === 0) return { ok: false, error: '先选一个号' };

    /* 同一个号不许两条并行计时：否则「今天在线多久」会把重叠的那段算两遍，
     * 而点卡也跟着翻倍。 */
    const busy = busyOf(ids);
    if (busy.length > 0) return { ok: false, error: '这个号还在计时，先结束再开始' };

    const startAt = input.startAt ?? Date.now();
    const error = timeError(startAt, null);
    if (error) return { ok: false, error };
    if (overlaps(ids, startAt, null)) return { ok: false, error: '这个号已有重叠的上线时段' };
    const note = (input.note ?? '').trim();
    const fresh: OnlineSession[] = ids.map((id) => ({
        id: makeId('onl'),
        date: dateText(startAt),
        startAt,
        endAt: null,
        characterId: id,
        /* 一个号一条：名单留空（`ownersOf` 的回落就是主体角色）。
         * 老数据里那种「一组人共用一段」照样读得懂、也算得对，只是不再新写。 */
        roster: [],
        /* 单价快照：改了单价不回头重算历史。 */
        cardPrice: settings.value.cardPrice,
        cardCost: settings.value.cardCost,
        note,
        createdAt: Date.now(),
    }));
    sessions.value = [...fresh, ...sessions.value];
    persist();
    return { ok: true, sessions: sessions.value };
}

/**
 * 补记一段已经过去的时长。
 *
 * 与「开始计时」的差别只有一处：终点当场给定，于是它立刻就能算进当天的账。
 * 校验放在这里而不是界面里：界面上的四个输入框互相约束（终点晚于起点、时长至少一分钟），
 * 只写在模板里等于没有约束——备份导回来、或者别的入口调进来，就绕过去了。
 */
export function backfillOnline(input: {
    characterIds: string[];
    startAt: number;
    endAt: number;
    note?: string;
}): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来记' };

    const ids = Array.from(new Set(input.characterIds.filter(Boolean)));
    if (ids.length === 0) return { ok: false, error: '先选一个号' };
    const error = timeError(input.startAt, input.endAt);
    if (error) return { ok: false, error };
    if (overlaps(ids, input.startAt, input.endAt)) {
        return { ok: false, error: '这个号已有重叠的上线时段' };
    }

    const session: OnlineSession = {
        id: makeId('onl'),
        date: dateText(input.startAt),
        startAt: input.startAt,
        endAt: input.endAt,
        characterId: ids[0],
        roster: ids.length > 1 ? ids : [],
        cardPrice: settings.value.cardPrice,
        cardCost: settings.value.cardCost,
        note: (input.note ?? '').trim(),
        createdAt: Date.now(),
    };
    sessions.value = [session, ...sessions.value].sort(
        (left, right) => right.startAt - left.startAt,
    );
    persist();
    return { ok: true, sessions: sessions.value };
}

/**
 * 结束计时。
 *
 * 传 `characterIds` 只停这几个号（「随时单独下一个号」）；不传就是全部停掉
 * （页头那枚「结束」按钮）。
 *
 * **不足一分钟的段直接丢掉**：误点「上线」再误点「结束」会留下一条 0 分钟记录，
 * 它在列表里显示「—」、在当天统计里什么都不加，却要用户点两次撤回。
 * 丢掉更好——它本来就没产生任何可记的账。
 */
export function stopOnline(characterIds?: string[], now: number = Date.now()): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来停' };
    const wanted = characterIds && characterIds.length ? new Set(characterIds) : null;
    const running = runningSessions().filter(
        (one) => !wanted || ownersOf(one).some((id) => wanted.has(id)),
    );
    if (running.length === 0) return { ok: false, error: '没有正在计时的号' };

    const hits = (one: OnlineSession) => !wanted || ownersOf(one).some((id) => wanted.has(id));

    const kept: OnlineSession[] = [];
    for (const session of sessions.value) {
        /* 已结束的、以及不在这批里的号，原样留着。 */
        if (session.endAt !== null || !hits(session)) {
            kept.push(session);
            continue;
        }
        /* 不足一分钟的段丢掉：误点「上线」再误点「结束」会留下一条 0 分钟记录，
         * 它在列表里显示「—」、在当天统计里什么都不加，却要用户点两次撤回。 */
        if ((now - session.startAt) / 60_000 < 1) continue;
        kept.push({ ...session, endAt: now });
    }
    sessions.value = kept;
    persist();
    return { ok: true, sessions: sessions.value };
}

/** 改一条（改开始时间、改正名单、改备注）。**结束时间只能由「结束」写**。 */
export function updateOnline(
    id: string,
    patch: { startAt?: number; characterIds?: string[]; note?: string },
): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来改' };
    const before = sessions.value.find((one) => one.id === id);
    if (!before) return { ok: false, error: '这条记录已经不在了' };

    const startAt = patch.startAt ?? before.startAt;
    const error = timeError(startAt, before.endAt);
    if (error) return { ok: false, error };

    const ids = patch.characterIds ? Array.from(new Set(patch.characterIds.filter(Boolean))) : null;
    if (ids && ids.length === 0) return { ok: false, error: '至少要留一个号' };
    if (overlaps(ids ?? ownersOf(before), startAt, before.endAt, id)) {
        return { ok: false, error: '这个号已有重叠的上线时段' };
    }

    const next: OnlineSession = {
        ...before,
        startAt,
        date: dateText(startAt),
        characterId: ids ? ids[0] : before.characterId,
        roster: ids ? (ids.length > 1 ? ids : []) : before.roster,
        note: patch.note === undefined ? before.note : patch.note.trim(),
    };
    sessions.value = sessions.value.map((one) => (one.id === id ? next : one));
    persist();
    return { ok: true, sessions: sessions.value };
}

/** 删一条。撤回是真删——账本里没有「隐藏」。 */
export function removeOnline(id: string): void {
    if (!persist.canWrite()) return;
    const before = sessions.value.length;
    sessions.value = sessions.value.filter((one) => one.id !== id);
    if (sessions.value.length !== before) persist();
}

/**
 * 改点卡单价。输入是「万/点」（`1.5`），落库是原值（`15000`）。
 *
 * **正在计时的那几条也跟着换快照**：它们还没有被结算，成本是「到现在为止」现算的；
 * 留着旧价会让「改了单价但今天的成本没变」看起来像没生效。已结束的不动——
 * 那些成本已经定型，也已经写进过账号。
 */
export function setCardPrice(wan: number): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来改' };
    const price = Math.round(fromWan(wan));
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: '点卡单价要大于 0' };

    settings.value = { ...settings.value, cardPrice: price };
    sessions.value = sessions.value.map((one) =>
        one.endAt === null ? { ...one, cardPrice: price } : one,
    );
    persist();
    return { ok: true, sessions: sessions.value };
}

/**
 * 开关「点卡计入账号成本」。
 *
 * 关掉只是**口径开关**：卡片上的成本照旧显示，已经写进账号的那几笔也不删。
 * 用户的意思是「以后不这么记了」，不是「以前那些账都不算」。
 */
export function setCardCost(on: boolean): OnlineWrite {
    if (!persist.canWrite()) return { ok: false, error: '上线记录读取失败，先修好再来改' };
    settings.value = { ...settings.value, cardCost: on };
    persist();
    return { ok: true, sessions: sessions.value };
}

/* ---------- 给页面 ---------- */
export function useOnline() {
    return {
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        sessions,
        settings,
        loadError,
        writeError,
        startOnline,
        backfillOnline,
        stopOnline,
        updateOnline,
        removeOnline,
        setCardPrice,
        setCardCost,
    };
}
