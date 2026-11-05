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
 * 老系统这层是 `async` + `throw`（`savePriceLog` 超过上限就抛）。这里不抛：写盘确实
 * 是异步的（`persist()` 异步写 SQLite、失败落进 `writeError`），但异步不等于该用 `throw`
 * ——失败是**常态**（磁盘满、库文件被别的进程占住），而调用方是同步的界面事件，
 * 既等不起、也没有合适的 `catch` 位置。`throw` 在这条链上唯一的去处是被界面兜住
 * 之后变成一行红字，那不如直接返回 `{ ok: false, error }`：调用方少一层 try，
 * 类型上也说得清「哪些情况会失败」。
 */
import { ref } from 'vue';
import { hasDesktop, pricesLoad, pricesSave } from '../../services/desktop';
import { todayText } from '../../services/format';
import { createPersist } from '../../services/persist';
import { onStorageSync } from '../../services/storage-sync';
import { makeId } from '../../services/shape';
import { DEFAULT_CATEGORY, isPriceCategory } from './prices-catalog';
import {
    POINT_LIMIT,
    STORAGE_KEY,
    makePriceItem,
    makePricePoint,
    normalizePriceItem,
    parsePriceItems,
    readPriceItems,
    retuneSub,
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
 * 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。
 *
 * `pricesLoad()` 的契约是「`null` = 没有 Tauri 宿主或调用失败」，而这两件事在类型上
 * 分不开、后果却差得远：早先这里写 `(stored ?? [])`，把「读失败」当「空库」处理——
 * 界面是空表、没有任何红字，用户随手记一笔，`persist()` 就整份覆盖掉了原来的物价表。
 * 现在读失败会把这条错误位立起来，并让 `persist()` 拒绝写入。
 */
const loadError = ref('');

/** 读过一轮没有。`persist` 靠它挡住「还没读库就整份覆盖」（见 `services/persist.ts`）。 */
const loaded = ref(false);

/**
 * 读档。**只能调一次，且在 mount 之前**。
 *
 * 桌面路径只有两步：读库 → 规范化。**不搬 `localStorage` 那一版**——老版本数据一概
 * 不接（见 `lib.rs` 的 `DATA_DIR_NAME`），`migrateLegacy` 那套「三态判据 + 留底改名」
 * 随老版本兼容一起删了。
 */
export async function loadPrices(): Promise<void> {
    if (!hasDesktop()) {
        items.value = readPriceItems();
        loaded.value = true;
        return;
    }

    const stored = await pricesLoad();
    /* 读失败**不是空库**。先拿到原始结果再分支，是为了让「`null`」这个信号
     * 能走到下面那条错误位——写成 `(stored ?? [])` 就把它抹掉了。 */
    if (stored === null) {
        loadError.value = '读不出物价表，已暂停写入以免覆盖原有数据';
        items.value = [];
        return;
    }
    loadError.value = '';
    loaded.value = true;
    /* 过一遍 `normalizePriceItem`：库是上一版应用写的、或有人手动改过文件时，
     * 读出来的东西不一定合今天的形。它是幂等的，正常数据走一遍什么都不会变。 */
    items.value = stored.map(normalizePriceItem);
}

/**
 * 多窗口同步（**只在浏览器那条路径上真正发生**）。
 *
 * 桌面版两个窗口共享的是同一个 SQLite 文件，`localStorage` 的 `storage` 事件不会触发；
 * 两窗同时写由 SQLite 自己串行化，最后写的那份是全量，覆盖掉前面的也无妨。
 * 这里保留监听是为了探针和 `npm run dev`——那边仍是 `localStorage`。
 * 事件本身的过滤（`key === null` 的 `clear()`、只认自己的键）在 `services/storage-sync.ts`。
 */
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

/**
 * 落盘。
 *
 * 「读失败拒绝写、浏览器写本地、桌面版异步写库、连续写排队」这一整套在
 * `services/persist.ts` 的 `createPersist`——三份数据层共用一份，理由写在那里。
 * 这里只说这份数据怎么落：整份 `PriceItem[]` 交给 `prices_save`。
 */
const persist = createPersist({
    label: '物价表',
    loadError,
    loaded,
    writeError,
    writeLocal: () => writePriceItems(items.value),
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
    /**
     * 新建一件物品。`initialPrice` 大于 0 时顺带记下当天的第一条价——
     * 用户往往是「看到这个价了，顺手记一张卡」，逼他建完卡再点一次「记一条」是多余的。
     */
    function addItem(draft: PriceItemDraft, initialPrice: number): PriceWrite {
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

    return {
        items,
        loadError,
        writeError,
        addItem,
        saveItem,
        removeItem,
        addPoint,
        savePoint,
        removePoint,
    };
}
