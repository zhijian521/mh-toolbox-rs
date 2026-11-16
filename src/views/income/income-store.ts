/** 收益账与速记单价的模块级状态；修改后排队保存，失败保留错误供重试。 */
import { readonly, ref, watch } from 'vue';
import { gameDataReady, quickItems } from '../../services/game-data';
import { linkIncomePriceWrites, usePrices } from '../prices/prices-store';
import { currentPoint, type ReadonlyPriceItem } from '../prices/prices';
import { readLocalData, writeLocalData, parseLocalList } from '../../services/local-data';
import { planPriceImport } from './price-import';
import { loadData } from '../../services/load-data';
import { incomeLoad, incomeSave } from '../../services/storage';
import { fromWan, todayText } from '../../services/format';
import { createPersist } from '../../services/persist';
import { onStorageSync } from '../../services/storage-sync';
import { makeId } from '../../services/shape';
import {
    parseEntries,
    parsePrices,
    splitAmount,
    type IncomeEntry,
    type QuickPrices,
} from './income';

/** 浏览器预览（探针 / `npm run dev`）那一版存在这里；桌面版走 SQLite，两者各自独立。 */
const STORAGE_KEY = 'mh-income';

/**
 * 「这一笔记给谁」——**这一屏的状态，不落盘**。
 *
 * 空数组 = 不指定角色。**记在模块作用域**而不是页面里：切到别的页再回来，
 * 用户不该重新选一次「记给归ω岚」——他刚才那一整屏都是在给这个号记。
 * 换一个号记是**有意**的动作，不是刷新副作用。
 *
 * 速记仅选一个角色；沿用空数组 / 单元素数组与记账接口对接。
 */
const target = ref<string[]>([]);

/** 全部记录，新→旧由 `dayGroupsOf` 负责排；这里只保证「都在这」。 */
const entries = ref<IncomeEntry[]>([]);

/** 速记单价：物品 id → 原值。没有键 = 没设过价，界面显示「未设价」。 */
const prices = ref<QuickPrices>({});

/** 最近一次落盘失败的原因。写着「已记上」但其实是空的，比报错更糟。 */
const writeError = ref('');

/** 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。 */
const loadError = ref('');

/** 当前数据已成功加载；读取中或失败时保持不可写。 */
const loaded = ref(false);

/** 一次写入的结果。速记要据此弹一句话（或红字）。 */
export type IncomeWrite =
    { ok: true; entries: readonly Readonly<IncomeEntry>[] } | { ok: false; error: string };

interface StoredShape {
    entries: unknown;
    prices: unknown;
}

/** 内存 → 落库形状：单价是 Record，库里是 `[{ itemId, price }]`。 */
function payloadOf(): { entries: IncomeEntry[]; prices: { itemId: number; price: number }[] } {
    return {
        entries: entries.value,
        prices: Object.entries(prices.value).map(([id, price]) => ({
            itemId: Number(id),
            price,
        })),
    };
}

/** 修改后排队保存当前全量；读取失败拒写，导出与关窗等待 flush。 */
const persist = createPersist({
    label: '收益账',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, payloadOf()),
    writeRemote: () => incomeSave(payloadOf()),
});

linkIncomePriceWrites(persist, writeError);
const market = usePrices();
let linkingPrices = false;
let linksReady = false;
let previousCards: readonly ReadonlyPriceItem[] = [];

/** 两边都读成功才联动；首次只接已有固定价，清除过的单价不因重载恢复。 */
const stopPriceLinks = watch(
    [loaded, market.loaded, gameDataReady, market.items],
    ([incomeReady, marketReady, rulesReady, cards]) => {
        if (
            !incomeReady ||
            !marketReady ||
            !rulesReady ||
            loadError.value ||
            market.loadError.value
        ) {
            linksReady = false;
            return;
        }
        if (linkingPrices) return;
        const fixed = quickItems().fixed;
        if (!linksReady) {
            const missing = fixed
                .filter(
                    (item) =>
                        prices.value[item.id] && !cards.some((card) => card.name === item.name),
                )
                .map((item) => ({ name: item.name, price: prices.value[item.id] }));
            if (!writePriceCards(missing)) return;
        }
        const next = { ...prices.value };
        let changed = false;
        for (const item of fixed) {
            const card = market.items.value.find((one) => one.name === item.name);
            const before = previousCards.find((one) => one.name === item.name);
            const point = card ? currentPoint(card) : null;
            const previous = before ? currentPoint(before) : null;
            const samePoint = point?.id === previous?.id && point?.price === previous?.price;
            if (!linksReady ? !(item.id in next) : samePoint) continue;
            const price = point ? Math.round(point.price) : 0;
            if ((next[item.id] ?? 0) === price) continue;
            if (price > 0) next[item.id] = price;
            else delete next[item.id];
            changed = true;
        }
        previousCards = market.items.value;
        linksReady = true;
        if (changed) {
            prices.value = next;
            persist();
        }
    },
    { flush: 'sync' },
);

if (import.meta.hot) import.meta.hot.dispose(stopPriceLinks);

function writePriceCards(rows: readonly { name: string; price: number }[]): boolean {
    if (!rows.length) return true;
    linkingPrices = true;
    try {
        const result = market.setCurrentPrices(rows);
        if (!result.ok) {
            writeError.value = result.error;
            return false;
        }
        previousCards = market.items.value;
        return true;
    } finally {
        linkingPrices = false;
    }
}

/** 启动阶段读取，完成前由写队列阻止保存；旧版转换统一在启动导入入口处理。 */
export async function loadIncome(): Promise<void> {
    await loadData({
        loaded,
        loadError,
        error: '读不出收益账，已暂停写入以免覆盖原有数据',
        readLocal: () =>
            readLocalData(STORAGE_KEY, (raw) => {
                if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                    throw new TypeError('数据不是对象');
                }
                const payload = raw as StoredShape;
                const prices = parsePrices(payload.prices);
                if (
                    !Array.isArray(payload.prices) ||
                    Object.keys(prices).length !== payload.prices.length
                ) {
                    throw new TypeError('单价记录损坏或重复');
                }
                return {
                    entries: parseLocalList(payload.entries, parseEntries),
                    prices,
                };
            }),
        readRemote: incomeLoad,
        applyLocal: (stored) => {
            entries.value = stored?.entries ?? [];
            prices.value = stored?.prices ?? parsePrices(undefined);
        },
        applyRemote: (stored) => {
            const next = {
                entries: parseEntries(stored.entries),
                prices: parsePrices(stored.prices),
            };
            entries.value = next.entries;
            prices.value = next.prices;
        },
    });
}

/* 仅同步浏览器同源 localStorage，桌面数据不走此通道。 */
onStorageSync(STORAGE_KEY, (raw) => {
    if (raw === null) {
        entries.value = [];
        prices.value = {};
        return;
    }
    try {
        const parsed = JSON.parse(raw) as StoredShape;
        entries.value = parseEntries(parsed.entries);
        prices.value = parsePrices(parsed.prices);
    } catch {
        /* 读不懂就保持现状：另一个窗口写坏了自己的存储，不该连累这一边。 */
        console.error('storage 事件里的收益账解析失败，保留当前数据不动');
    }
});

/* ---------- 改 ---------- */

/**
 * 速记一条：这就是「点一下物品格」要的全部。
 *
 * `input.amount` 用**原值**（`fromWan` 之后的数）；页面上那几个格子说的是「万」，
 * 换算只在输入那一侧发生一次，进了这个函数就都是原值。
 *
 * ---- 选了几个号就是几条记录 ----
 * 记给 N 个角色时，一次分账写 N 条、金额**平分**（`splitAmount`，尾差按币给排在前面的），
 * 总额与只记给一个号时完全相等。所以「今天收入」不会因为多选而变大——多选改变的是
 * **这些钱算在谁头上**，不是「赚了多少」。
 *
 * 不写「一条记录挂多个角色 id」：那样按人合计时要么整条算给每个人（翻 N 倍），
 * 要么得在读取时再分一次账——分摊规则就跑到查询里去了，而删除一条时也说不清撤的是谁的份。
 */
export function recordEntry(input: {
    item: string;
    /** 原值。`0` 表示还没定价——调用方那时应该先弹单价窗，不要调这里。 */
    amount: number;
    kind?: 'income' | 'expense';
    /** 记给谁。不传就用当前选中的那组；空数组 = 不指定角色。 */
    characterIds?: string[];
    note?: string;
}): IncomeWrite {
    if (!persist.canWrite()) return { ok: false, error: '收益账读取失败，先修好再来记' };

    /* **先取整，再判正**。反过来会让 `0.4` 过关、落成 `0`，而 `0` 在 `normalizeEntry`
     * 里是「丢掉」——用户点了、提示说记上了、重启后那条不见了。
     * 币没有小数，所以「四舍五入之后还是不是正数」才是这一格真实的下限。 */
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: '金额要大于 0' };
    }

    const ids = (input.characterIds ?? target.value).filter(Boolean);
    /* 不指定角色时只有一条、金额原样；此时 `splitAmount(amount, 1)` 也返回 `[amount]`，
     * 所以两条路可以合成一句——少一个分支，也就少一处「只改了一条路」的错法。 */
    const owners = ids.length ? ids : [''];
    const parts = splitAmount(amount, owners.length);

    const createdAt = Date.now();
    const created: IncomeEntry[] = owners.map((characterId, index) => ({
        id: makeId('inc'),
        date: todayText(),
        characterId,
        kind: input.kind ?? 'income',
        amount: parts[index],
        item: input.item.trim(),
        note: (input.note ?? '').trim(),
        /* 同一批的 `createdAt` 相同：它们本来就是「同一个动作」写出来的。
         * 排序靠数组顺序（新的一批整体插在最前），不靠时间戳分先后。 */
        createdAt,
    }));

    entries.value = [...created, ...entries.value];
    persist();
    return { ok: true, entries: readonly(created) };
}

/** 删一条（今日清单上的 ×）。撤回是**真删**——账本里没有「隐藏」。 */
export function removeEntry(id: string): void {
    if (!persist.canWrite()) return;
    const before = entries.value.length;
    entries.value = entries.value.filter((one) => one.id !== id);
    if (entries.value.length !== before) persist();
}

/**
 * 改一条（历史表里的「改」）。这是「记错了也能救回来」的唯一出口。
 *
 * 只认**金额 / 物品名 / 记给谁**三样，**日期与方向（收/支）不动**：
 *   - 日期决定了它落在哪一天，改日期等于「把这一笔搬到另一天」，那是删了重记，不是改；
 *   - 方向改错会把整页的收支同时翻过来，而界面上这个字段没有任何提示。
 * 真要改这两样，走「删掉重记」，用户会看见那两步。
 *
 * 金额**先取整再判正**，与 `recordEntry` 同一条：反过来会让 0.4 过关、落成 0，
 * 而 0 在 `normalizeEntry` 里是「丢掉」——改完之后那一条直接消失。
 */
export function updateEntry(
    id: string,
    patch: { amount?: number; item?: string; characterId?: string },
): IncomeWrite {
    if (!persist.canWrite()) return { ok: false, error: '收益账读取失败，先修好再来改' };

    const index = entries.value.findIndex((one) => one.id === id);
    if (index < 0) return { ok: false, error: '这一条已经不在了' };

    const before = entries.value[index];
    const amount = Math.round(patch.amount ?? before.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: '金额要大于 0' };

    const next: IncomeEntry = {
        ...before,
        amount,
        item: (patch.item ?? before.item).trim(),
        characterId: patch.characterId ?? before.characterId,
    };

    entries.value = entries.value.map((one, at) => (at === index ? next : one));
    persist();
    return { ok: true, entries: readonly([next]) };
}

/** 改一件物品的单价（右键改价）。`wan` 是「万」，转原值后落盘。 */
export function setPrice(itemId: number, wan: number): boolean {
    if (!persist.canWrite()) return false;
    const amount = fromWan(wan);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const item = quickItems().fixed.find((one) => one.id === itemId);
    if (item && !writePriceCards([{ name: item.name, price: amount }])) return false;
    prices.value = { ...prices.value, [itemId]: amount };
    persist();
    return true;
}

/** 清掉一件物品的单价（改价窗里的「清除」）。清掉之后格子显示「未设价」。 */
export function clearPrice(itemId: number): void {
    if (!persist.canWrite()) return;
    if (!(itemId in prices.value)) return;
    const next = { ...prices.value };
    delete next[itemId];
    prices.value = next;
    persist();
}

export type PriceMerge =
    { ok: true; added: number; updated: number; unchanged: number } | { ok: false; error: string };

/** 文件中缺失的物品保留，只写入实际变化的价目。 */
export function mergePrices(
    incoming: readonly { itemId: number; price: number | null }[],
): PriceMerge {
    if (!persist.canWrite()) return { ok: false, error: '收益账读取失败，先修好再导入单价' };
    const { next, added, updated, unchanged } = planPriceImport(prices.value, incoming);
    if (added + updated + unchanged === 0) return { ok: false, error: '这份文件里没有能用的单价' };
    if (added + updated > 0) {
        const rows = quickItems()
            .fixed.filter((item) => next[item.id] && next[item.id] !== prices.value[item.id])
            .map((item) => ({ name: item.name, price: next[item.id] }));
        if (!writePriceCards(rows)) return { ok: false, error: writeError.value };
        prices.value = next;
        persist();
    }
    return { ok: true, added, updated, unchanged };
}

/** 换速记指定人，最多保留一个角色；空数组 = 不指定。 */
export function setTarget(characterIds: string[]): void {
    target.value = characterIds.filter(Boolean).slice(0, 1);
}

/** 页面拿这一份。 */
export function useIncome() {
    return {
        pending: market.pending,
        flush: market.flush,
        retry: market.retry,
        entries: readonly(entries),
        prices: readonly(prices),
        target: readonly(target),
        loadError,
        writeError: market.writeError,
        recordEntry,
        removeEntry,
        updateEntry,
        setPrice,
        clearPrice,
        mergePrices,
        setTarget,
    };
}
