/**
 * 物价表的**持有者**：模块级单例 + 写入即落盘。
 *
 * 与 `characters/roster.ts`、`use-theme.ts`、`use-font-scale.ts` 同一套写法：状态放模块
 * 作用域，`usePrices()` 只把它递出去。全仓目前只有 `PricesView` 调一次——卡片、走势窗、
 * 几个弹窗都靠 props 往下传。之所以仍然放模块作用域而不是 `ref` 挂在页面里：
 * 换存储（`ARCHITECTURE.md` §2 的「写盘时机」）时只改这一层，调用方一处都不用动。
 *
 * 不引 Pinia：这几个组件都在同一页里、共享的只是一份「本机物价表」，
 * 与角色名册的处境一样，用同一条写法更省事。
 *
 * ---- 为什么规则不在这里 ----
 * 归一、排序、涨跌、显示口径全在 `prices.ts`（那里的头注释解释了拆分理由）。
 * 这个文件只做四件事：读、改、写、把「改不成」的原因原样交回去。
 *
 * ---- 错误用返回值，不用 throw ----
 * 老系统这层是 `async` + `throw`（`savePriceLog` 超过上限就抛）。这里不需要异步：
 * 写的是 `localStorage`，没有等待。而 `throw` 在这条链上唯一的用处是被界面 catch 之后
 * 变成一行红字——那不如直接返回 `{ ok: false, error }`，调用方少一层 try，
 * 类型上也说得清「哪些情况会失败」。
 */
import { ref } from 'vue';
import {
    hasDesktop,
    pricesLegacyImported,
    pricesLoad,
    pricesMarkLegacyImported,
    pricesSave,
} from '../../services/desktop';
import { DEFAULT_CATEGORY, isPriceCategory } from './prices-catalog';
import {
    POINT_LIMIT,
    STORAGE_KEY,
    makePriceId,
    makePriceItem,
    makePricePoint,
    normalizePriceItem,
    parsePriceItems,
    readPriceItems,
    retuneSub,
    todayText,
    writePriceItems,
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

/**
 * 本机物价表。**启动时是空的**——真数据由 `loadPrices()` 填，而它必须在 `mount` 之前
 * `await` 完（见 `main.ts`）。桌面版读 SQLite，浏览器里（探针 / `npm run dev`）读
 * `localStorage`，两条路径的数据各自独立。
 */
const items = ref<PriceItem[]>([]);

/** 最近一次落盘失败的原因。写着「已保存」但其实是空的，比报错更糟。 */
const writeError = ref('');

/**
 * 读档。**只能调一次，且在 mount 之前**。
 *
 * 迁移只做一次：桌面版第一次启动时，把 `localStorage` 那一版搬进 SQLite，
 * 然后往库里的 `meta` 表写一个标记。标记放库里而不是 localStorage——
 * 用户清一次浏览器缓存不该让搬过的数据再冒出来一遍。
 */
export async function loadPrices(): Promise<void> {
    if (!hasDesktop()) {
        items.value = readPriceItems();
        return;
    }

    if (!(await pricesLegacyImported())) {
        const legacy = readPriceItems();
        if (legacy.length) {
            const saved = await pricesSave(legacy);
            /* **搬成功才动源数据**。失败就什么都不做，下次启动再试——
             * 反过来（先删后写）一旦写失败就是永久丢数据。 */
            if (saved && typeof localStorage !== 'undefined') {
                /* 改名而不是删除：库文件万一被误删 / 损坏，这里还留着一份可以捞。
                 * 改名之后 `readPriceItems()` 再也读不到它，不会被重复搬。 */
                localStorage.setItem(`${STORAGE_KEY}.migrated`, JSON.stringify(legacy));
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        await pricesMarkLegacyImported();
    }

    const stored = await pricesLoad<PriceItem>();
    /* 过一遍 `normalizePriceItem`：库是上一版应用写的、或有人手动改过文件时，
     * 读出来的东西不一定合今天的形。它是幂等的，正常数据走一遍什么都不会变。 */
    items.value = (stored ?? []).map(normalizePriceItem);
}

/**
 * 多窗口同步（**只在浏览器那条路径上真正发生**）。
 *
 * 桌面版两个窗口共享的是同一个 SQLite 文件，`localStorage` 的 `storage` 事件不会触发；
 * 两窗同时写由 SQLite 自己串行化，最后写的那份是全量，覆盖掉前面的也无妨。
 * 这里保留监听是为了探针和 `npm run dev`——那边仍是 `localStorage`。
 */
function syncAcrossWindows(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (event) => {
        /* `key === null` 是有人调了 `clear()`，同样要重读。 */
        if (event.key !== null && event.key !== STORAGE_KEY) return;
        items.value = parsePriceItems(event.newValue) ?? [];
    });
}

syncAcrossWindows();

/**
 * 落盘。
 *
 * 桌面版是**异步写、不等**：`addPoint` 这类调用方是同步函数，等不起；而整份写意味着
 * 后发先至也不会坏（每一次写的都是当下全量）。真失败了记在 `writeError` 里，
 * 界面拿它显示一行红字——不能静默吞掉，否则用户以为存上了。
 */
function persist(): void {
    if (!hasDesktop()) {
        writePriceItems(items.value);
        return;
    }
    void pricesSave(items.value).then((ok) => {
        writeError.value = ok ? '' : '这一笔没写进数据库，检查一下磁盘空间';
    });
}

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
    /**
     * 新建一件物品。`initialPrice` 大于 0 时顺带记下当天的第一条价——
     * 用户往往是「看到这个价了，顺手记一张卡」，逼他建完卡再点一次「记一条」是多余的。
     */
    function addItem(draft: PriceItemDraft, initialPrice: number): PriceWrite {
        if (nameTaken(draft.name, '')) {
            return { ok: false, error: '已经有一件同名物品了，换一个名字，或直接改那一张卡' };
        }
        const now = Date.now();
        const item = makePriceItem(draft, makePriceId('item'), now);
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
        const item = items.value.find((one) => one.id === id);
        if (!item) return { ok: false, error: '这件物品已经不在了，刷新一下再试' };
        if (nameTaken(draft.name, id)) {
            return { ok: false, error: '已经有一件同名物品了，换一个名字再存' };
        }
        const category = isPriceCategory(draft.category) ? draft.category : DEFAULT_CATEGORY;
        /* 逐字段覆盖，**不整条换新对象**：`points` / `unit` / `createdAt` 都不该被
         * 「改个名字」牵连。老系统这里用的也是 `Object.assign(item, draft)`——
         * 单位不在界面上填，编辑时不动已有值。
         *
         * 二级只在**一级变了**的时候重新审一遍：旧的「宝石」挂在「装备灵饰」下是数据不一致，
         * 而没换一级时用户自造的二级必须原样留着（那是他自己写的字）。 */
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

    return { items, writeError, addItem, saveItem, removeItem, addPoint, savePoint, removePoint };
}
