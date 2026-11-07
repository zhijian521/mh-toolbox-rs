/**
 * 收益账的**持有者**：模块级单例 + 写入即落盘。
 *
 * 与 `prices/prices-store.ts`、`characters/roster.ts` 同一套写法。规则全在 `income.ts`
 * （纯函数、可单测），这里只做四件事：读、改、写、把「改不成」的原因交回去。
 *
 * ---- 为什么读写是「整份」 ----
 * 一次速记点击 = 内存里加一条 + 整份写回。整份的代价是每次点都写一遍全表，
 * 好处是**永远不会出现「界面有、库里没有」**：写的是当下这一份全量，后发先至也不坏。
 * 一天几十条、一年几千条的量级，这点开销换来的是「不丢账」，划算。
 *
 * ---- 读失败为什么拒绝写入 ----
 * `incomeLoad()` 返回 `null` 时有两种可能：没有 Tauri 宿主，或调用失败。两者在类型上
 * 分不开，后果却差得远——把它当成「空账」处理，用户随手点一下速记，`persist()`
 * 就整份覆盖掉原来的记录。所以读失败会把 `loadError` 立起来，并让写入直接返回。
 */
import { ref } from 'vue';
import { hasDesktop } from '../../services/desktop';
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
 * 2026-11-04 起是数组：几个号一起摆摊时，一笔收入要落到每个人头上。
 * 平分的规则在 `income.ts` 的 `splitAmount`（尾差按币补给排在前面的人，总额不差）。
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

/** 读过一轮没有。`persist` 靠它挡住「还没读库就整份覆盖」（见 `services/persist.ts`）。 */
const loaded = ref(false);

/** 一次写入的结果。速记要据此弹一句话（或红字）。 */
export type IncomeWrite = { ok: true; entries: IncomeEntry[] } | { ok: false; error: string };

interface StoredShape {
    entries: unknown;
    prices: unknown;
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

/** 浏览器那条路径的落盘（`localStorage`）。名字与 `persist` 的参数区分开，避免看混。 */
function saveLocal(payload: StoredShape): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('收益账写不进 localStorage', error);
        writeError.value = '这一笔没存下来，检查一下浏览器存储空间';
    }
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

/**
 * 落盘。
 *
 * 「读失败拒绝写、浏览器写本地、桌面版异步写库、连续写排队」这一整套在
 * `services/persist.ts` 的 `createPersist`——三份数据层共用一份，理由写在那里。
 *
 * 这一页对那条队列的依赖最重：速记的全部用法就是连点（回执只亮 1.6 秒），
 * 而每次写都是整份，不排队就会丢中间那几笔——第 97 批为它单独写过一版队列，
 * 现在与物价、名册共用同一份。
 */
const persist = createPersist({
    label: '收益账',
    loadError,
    loaded,
    writeError,
    writeLocal: () => saveLocal(payloadOf()),
    writeRemote: () => incomeSave(payloadOf()),
});

/**
 * 读档。**只能调一次，且在 mount 之前**（与 `loadPrices()` 同一个位置）。
 *
 * 收益是第 97 批才有的功能，没有更早的 `localStorage` 版本要搬——不做 legacy 迁移。
 */
export async function loadIncome(): Promise<void> {
    if (!hasDesktop()) {
        const stored = readLocal();
        entries.value = parseEntries(stored?.entries);
        prices.value = parsePrices(stored?.prices);
        loaded.value = true;
        return;
    }

    const stored = await incomeLoad();
    /* 读失败**不是空账**。先拿原始结果再分支，就是为了让 `null` 这个信号走到错误位；
     * 写成 `stored ?? {}` 就把它抹掉了，而后果是「用户一点速记，旧账被清空」。 */
    if (stored === null) {
        loadError.value = '读不出收益账，已暂停写入以免覆盖原有数据';
        entries.value = [];
        prices.value = {};
        return;
    }
    loadError.value = '';
    loaded.value = true;
    entries.value = parseEntries(stored.entries);
    prices.value = parsePrices(stored.prices);
}

/* 多窗口同步：事件的边界在 `services/storage-sync.ts`，这里只说「读到之后怎么应用」。
 * 桌面版两窗共享同一个库，这条只在浏览器路径（`npm run dev` / 探针）上真的会发生。 */
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
    return { ok: true, entries: created };
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

    /* 整数组换新引用，而不是改对象字段：`entries` 是 `ref`，改内部字段不会触发依赖
     * （数组本身没变），页面看着「保存了但界面没动」。 */
    entries.value = entries.value.map((one, at) => (at === index ? next : one));
    persist();
    return { ok: true, entries: [next] };
}

/** 改一件物品的单价（右键改价）。`wan` 是「万」，转原值后落盘。 */
export function setPrice(itemId: number, wan: number): boolean {
    if (!persist.canWrite()) return false;
    const amount = fromWan(wan);
    if (!Number.isFinite(amount) || amount <= 0) return false;
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

/** 批量导入单价的结果。`added` / `updated` 一起报，用户才分得清「补了价目」与「换了价目」。 */
export type PriceMerge =
    { ok: true; added: number; updated: number } | { ok: false; error: string };

/**
 * 批量导入单价：**同一件物品以文件为准，文件里没有的物品保持现状**。
 *
 * 为什么是合并而不是整份替换：单价表是「价目表」，不是账。文件缺一件物品只说明
 * 那份文件里没写它（多半是导出之后才定的价），把它清成「未设价」等于替用户删配置，
 * 而下一次点那件物品会先弹窗——看上去像 bug，实际是被导没的。
 *
 * 写盘仍然**只写一次**：先算出整份新表，再 `persist()` 一次。逐条 `setPrice` 会写 N 次
 * （每次整份写库），导 59 条就是 59 次事务，中途失败还会留半截。
 *
 * 读失败（`loadError`）时拒绝：那时内存里是空的，合并进去再写就等于拿文件把旧价表顶掉。
 *
 * `price` 收 `number | null`：生成的 `QuickPrice` 里它就是 `number | null`（specta 把 f64
 * 映射成可空数，NaN / Infinity 走 null 过 IPC），所以拿不准的那一档要在这一层挡掉。
 */
export function mergePrices(
    incoming: readonly { itemId: number; price: number | null }[],
): PriceMerge {
    if (!persist.canWrite()) return { ok: false, error: '收益账读取失败，先修好再导入单价' };

    const next = { ...prices.value };
    let added = 0;
    let updated = 0;
    for (const one of incoming) {
        /* Rust 侧已经校验过一遍（见 `backup.rs` 的 `validate_prices`），这里再挡一次是
         * 因为这条函数也能被别的调用方直接用：一行非法值进了内存，下一次整份写盘就落库。 */
        if (!Number.isFinite(one.itemId) || one.itemId <= 0) continue;
        if (typeof one.price !== 'number' || !Number.isFinite(one.price) || one.price <= 0) {
            continue;
        }
        if (one.itemId in next) updated += 1;
        else added += 1;
        next[one.itemId] = one.price;
    }

    if (added + updated === 0) return { ok: false, error: '这份文件里没有能用的单价' };

    prices.value = next;
    persist();
    return { ok: true, added, updated };
}

/** 换「记给谁」。空数组 = 不指定。 */
export function setTarget(characterIds: string[]): void {
    target.value = characterIds;
}

/** 页面拿这一份。 */
export function useIncome() {
    return {
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        entries,
        prices,
        target,
        loadError,
        writeError,
        recordEntry,
        removeEntry,
        updateEntry,
        setPrice,
        clearPrice,
        mergePrices,
        setTarget,
    };
}
