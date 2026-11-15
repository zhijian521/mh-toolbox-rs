/** 物价表的模块级状态；规则归 prices.ts，加载与写队列共用 services。 */
import { readonly, ref } from 'vue';
import { readLocalData, writeLocalData, parseLocalList } from '../../services/local-data';
import { loadData } from '../../services/load-data';
import { pricesLoad, pricesSave } from '../../services/storage';
import { todayText } from '../../services/format';
import { createPersist } from '../../services/persist';
import { onStorageSync } from '../../services/storage-sync';
import { makeId } from '../../services/shape';
import { DEFAULT_CATEGORY, isPriceCategory, legacyPriceSlot } from './prices-catalog';
import {
    POINT_LIMIT,
    STORAGE_KEY,
    currentPoint,
    makePriceItem,
    makePricePoint,
    normalizePriceItem,
    parsePriceItems,
    retuneSub,
    type PriceItem,
    type PriceItemDraft,
    type PricePoint,
    type PricePointDraft,
} from './prices';

/**
 * 一次写入的结果。`ok: true` 时带受影响的**物品 id**——新建之后界面要靠它把
 * 走势面板切到这件新物品上，否则用户刚记的东西不在眼前。
 */
export type PriceWrite = { ok: true; id: string } | { ok: false; error: string };

/** 初始为空，启动阶段由 loadPrices 读取；桌面 SQLite 与浏览器存储独立。 */
const items = ref<PriceItem[]>([]);

/** 最近一次落盘失败的原因。写着「已保存」但其实是空的，比报错更糟。 */
const writeError = ref('');

/** 最近一次读取错误；非空时写队列拒绝覆盖。 */
const loadError = ref('');

/** 当前数据已成功加载；读取中或失败时保持不可写。 */
const loaded = ref(false);

/** 启动阶段读取，完成前由写队列阻止保存；旧版转换统一在启动导入入口处理。 */
export async function loadPrices(): Promise<void> {
    await loadData({
        loaded,
        loadError,
        error: '读不出物价表，已暂停写入以免覆盖原有数据',
        readLocal: () =>
            readLocalData(STORAGE_KEY, (raw) =>
                parseLocalList(raw, (rows) => parsePriceItems(JSON.stringify(rows)) ?? []),
            ),
        readRemote: pricesLoad,
        applyLocal: (stored) => {
            items.value = stored ?? [];
        },
        applyRemote: (stored) => {
            items.value = stored.map(normalizePriceItem);
        },
    });
}

/** 仅同步浏览器同源 localStorage；不提供桌面多窗口间的数据库状态协调。 */
onStorageSync(STORAGE_KEY, (raw) => {
    /* 那一份被删掉了（`removeItem` / `clear`），确实该空——这与「解析失败」是两件事。 */
    if (raw === null) {
        items.value = [];
        return;
    }
    const parsed = parsePriceItems(raw);
    /* 解析失败**不是空库**：把它当空表会清掉内存里的 `items`，而下一次任意写
     * （加一条价、改个名字）就把这份空表整份写回去，用户的物价表就没了。 */
    if (parsed === null) {
        console.error('storage 事件里的物价表解析失败，保留当前数据不动', raw);
        return;
    }
    items.value = parsed;
});

/** 修改后排队保存当前全量；读取失败拒写，导出与关窗等待 flush。 */
const persist = createPersist({
    label: '物价表',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, items.value),
    writeRemote: () => pricesSave(items.value),
});

/** 整条替换一件物品，然后落盘。列表每次都换新数组，`computed` 不必靠深度侦听。 */
function replaceItem(next: PriceItem): void {
    items.value = items.value.map((item) => (item.id === next.id ? next : item));
    persist();
}

function find(itemId: string): PriceItem | undefined {
    return items.value.find((item) => item.id === itemId);
}

/**
 * 下一笔价格记录的时间戳。
 *
 * 连点两次「记下」时 `Date.now()` 可能落在同一毫秒，两条记录就分不出先后——
 * 同一天的记录本来就是靠 `createdAt` 定顺序的（`date` 只到天），撞上之后
 * 列表顺序会变成「看运气」。这里保证它在**该物品内**严格递增。
 * 与老系统 `savePriceLog` 里那两行同一个理由。
 */
function nextStamp(pointList: PricePoint[]): number {
    const latest = pointList.reduce((max, point) => Math.max(max, point.createdAt), 0);
    return Math.max(Date.now(), latest + 1);
}

/** 同名物品会让人对着两张卡分不清是哪一张，所以在写入处挡掉。 */
function nameTaken(name: string, exceptId: string): boolean {
    const target = name.trim();
    return items.value.some((item) => item.id !== exceptId && item.name.trim() === target);
}

export function usePrices() {
    /** 固定单价批量记入同名卡片；先检查整批，避免导入到一半才遇到记录上限。 */
    function setCurrentPrices(incoming: readonly { name: string; price: number }[]): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        let next = items.value.slice();
        let changed = false;
        let id = '';
        for (const row of incoming) {
            const name = row.name.trim();
            if (!name || !Number.isFinite(row.price) || row.price <= 0) {
                return { ok: false, error: '物品名称不能为空，价格要大于 0' };
            }
            const existing = next.find((item) => item.name === name);
            const item = existing ?? makePriceItem(
                { name, ...legacyPriceSlot(name, ''), note: '' },
                makeId('item'),
                Date.now(),
            );
            id = item.id;
            const current = currentPoint(item);
            if (current?.price === row.price) continue;
            if (item.points.length >= POINT_LIMIT) {
                return { ok: false, error: `「${name}」的价格记录已满，先删除几条旧记录再设价` };
            }
            const createdAt = nextStamp(item.points);
            const date = current && current.date > todayText() ? current.date : todayText();
            const point = makePricePoint({ date, price: row.price, note: '' }, createdAt);
            const updated = { ...item, points: [...item.points, point], updatedAt: createdAt };
            next = existing
                ? next.map((one) => (one.id === item.id ? updated : one))
                : [...next, updated];
            changed = true;
        }
        if (changed) {
            items.value = next;
            persist();
        }
        return { ok: true, id };
    }

    /**
     * 新建一件物品。`initialPrice` 大于 0 时顺带记下当天的第一条价——
     * 用户往往是「看到这个价了，顺手记一张卡」，逼他建完卡再点一次「记一条」是多余的。
     */
    function addItem(draft: PriceItemDraft, initialPrice: number): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        if (nameTaken(draft.name, '')) {
            return { ok: false, error: '已经有一件同名物品了，换一个名字，或直接改那一张卡' };
        }
        const now = Date.now();
        const item = makePriceItem(draft, makeId('item'), now);
        if (initialPrice > 0) {
            const point = makePricePoint({ date: todayText(), price: initialPrice, note: '' }, now);
            item.points = [point];
            item.updatedAt = now;
        }
        items.value = [...items.value, item];
        persist();
        return { ok: true, id: item.id };
    }

    /** 改物品本身（名称、分类、子类、备注）。价格记录不受影响。 */
    function saveItem(id: string, draft: PriceItemDraft): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        const item = items.value.find((one) => one.id === id);
        if (!item) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        if (nameTaken(draft.name, id)) {
            return { ok: false, error: '已经有一件同名物品了，换一个名字再存' };
        }
        const category = isPriceCategory(draft.category) ? draft.category : DEFAULT_CATEGORY;
        /* 只替换可编辑字段；一级变化时校正二级，未变化时保留用户自定义值。 */
        replaceItem({
            ...item,
            name: draft.name.trim() || item.name,
            category,
            sub: category === item.category ? draft.sub.trim() : retuneSub(draft.sub, category),
            note: draft.note.trim(),
            /* 「最近更新」要对得起它的名字：改名、改分类、改备注也是更新。
             * 不刷新的话，用户改完一张卡它仍排在列表原位，看着像没存上。 */
            updatedAt: Date.now(),
        });
        return { ok: true, id };
    }

    function removeItem(id: string): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        if (!find(id)) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        items.value = items.value.filter((item) => item.id !== id);
        persist();
        return { ok: true, id };
    }

    /**
     * 追加一条价格。`updatedAt` 跟着这笔走：列表按它排序，「刚记过」的东西排最前。
     *
     * 这里用 `point.createdAt` 而不是再取一次 `Date.now()`——那个时间戳为了保证
     * 同卡内严格递增，可能比 `now()` 大 1 毫秒；两者含义相同（都是「这一刻」），
     * 取同一个值才不会出现「记录的时间比物品的更新时间还晚」。
     */
    function addPoint(itemId: string, draft: PricePointDraft): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        const item = find(itemId);
        if (!item) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        if (item.points.length >= POINT_LIMIT) {
            return {
                ok: false,
                error: `这件物品已经有 ${POINT_LIMIT} 条记录，先删掉几条旧的再记`,
            };
        }
        const createdAt = nextStamp(item.points);
        const point = makePricePoint(draft, createdAt);
        if (!point.price) return { ok: false, error: '价格要大于 0' };
        replaceItem({ ...item, points: [...item.points, point], updatedAt: createdAt });
        return { ok: true, id: itemId };
    }

    /** 改一条旧价。补错日期、把「万」看成一万这类事都会发生，得改得动。 */
    function savePoint(itemId: string, pointId: string, draft: PricePointDraft): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        const item = find(itemId);
        if (!item) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        const point = item.points.find((one) => one.id === pointId);
        if (!point) return { ok: false, error: '这条记录已经不在了，刷新一下再试' };

        const next = makePricePoint(draft, point.createdAt);
        if (!next.price) return { ok: false, error: '价格要大于 0' };
        // id 要留住：它是列表的 key，也是「正在编辑哪一条」的定位。
        replaceItem({
            ...item,
            points: item.points.map((one) =>
                one.id === pointId ? { ...next, id: point.id } : one,
            ),
            updatedAt: Date.now(),
        });
        return { ok: true, id: itemId };
    }

    /** 删一条价格。物品本身留着——没有记录的卡显示「未记录」，那仍是「我关注这件东西」。 */
    function removePoint(itemId: string, pointId: string): PriceWrite {
        if (!persist.canWrite()) return { ok: false, error: loadError.value || writeError.value };
        const item = find(itemId);
        if (!item) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        if (!item.points.some((one) => one.id === pointId)) {
            return { ok: false, error: '这条记录已经不在了，刷新一下再试' };
        }
        replaceItem({
            ...item,
            points: item.points.filter((one) => one.id !== pointId),
            updatedAt: Date.now(),
        });
        return { ok: true, id: itemId };
    }

    return {
        pending: persist.pending,
        flush: persist.flush,
        retry: persist,
        items: readonly(items),
        loaded: readonly(loaded),
        loadError,
        writeError,
        addItem,
        saveItem,
        removeItem,
        addPoint,
        savePoint,
        removePoint,
        setCurrentPrices,
    };
}
