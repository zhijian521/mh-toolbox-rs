import type { DeepReadonly } from 'vue';
import { parseLocalList } from '../../services/local-data';
/** 物价字段、归一与纯计算；状态和持久化在 prices-store.ts。
 * 当前价由历史派生，金额保存游戏币原值，显示时再换算万 / 亿。 */
/* 金额与日期的写法全站只有一份，在 `services/format.ts`——收益页也要 `moneyText` /
 * `todayText`，放在这一页会让另一页反向依赖物价模块。 */
import { isDayText, moneyText, shortDate, todayText } from '../../services/format';
import { isObject, makeId, rows, stamp, text } from '../../services/shape';
import { DEFAULT_CATEGORY, isPriceCategory, legacyPriceSlot } from './prices-catalog';

/** 名称上限，与表单的 `maxlength` 同一枚常量——两处各写一个数必然有一天不相等。 */
export const NAME_LIMIT = 40;
/** 二级分类上限，与表单的 `maxlength` 同上。 */
export const SUB_LIMIT = 12;
/** 一件物品最多保留的价格记录数：够看长期走势，又不至于让整份表大得写不动
 *  （桌面版每次改动都是整份 JSON 写回 SQLite）。 */
export const POINT_LIMIT = 200;
/**
 * 走势面板最多画多少条。
 *
 * 与 `POINT_LIMIT` 是两件事：那个是**存**多少，这个是**画**多少。40 条落在 500px 宽的
 * 图上约 12px 一个点，再密就只能靠颜色深浅猜；而超过上限时界面要说明「只画最近 40 次」，
 * 别让人以为那是全史（读屏也要听到同一句话）。
 */
export const CHART_LIMIT = 40;
/** 新建物品的单位。界面上不填单位（老系统也不填），统一记「个」。 */
const DEFAULT_UNIT = '个';
/** 存储键。与角色名册（`mh-roster`）的命名方式一致。
 *  导出是给 `prices-store` 的跨窗口监听用的：它只认这个 key 的 `storage` 事件。 */
export const STORAGE_KEY = 'mh-prices';

/* ======================================================================
 * 类型
 * ==================================================================== */

/**
 * 一条价格记录。
 *
 * `date` 是**那一天的行情**，`createdAt` 是**敲下这一笔的时刻**，两者不是一回事：
 * 补记前天的价时日期往前拨，而落账顺序仍要靠 `createdAt`——`date` 只精确到天，
 * 同一天记两次时它分不出先后。
 */
export interface PricePoint {
    id: string;
    /** 记录日期，恒为 `YYYY-MM-DD`。 */
    date: string;
    /** 游戏币原值，15000 表示 1.5 万。恒大于 0。 */
    price: number;
    note: string;
    createdAt: number;
}

export interface PriceItem {
    id: string;
    name: string;
    /** 一级分类，恒为 `PRICE_CATEGORIES` 之一（`normalizePriceItem` 兜底）。 */
    category: string;
    /** 二级分类，可为空：知道大类、还没细分的卡是合法的。 */
    sub: string;
    unit: string;
    note: string;
    /**
     * 价格历史。**存储顺序不承诺有序**——补记会把新记录插进中间的日期。
     * 一切读取都走 `sortedPoints()`，不要在界面里自己 `.sort()`。
     */
    points: PricePoint[];
    createdAt: number;
    updatedAt: number;
}

/** 物品表单的输入。单位不在其中：新建统一「个」，编辑不动它。 */
export interface PriceItemDraft {
    name: string;
    category: string;
    sub: string;
    note: string;
}

/** 价格记录表单的输入。 */
export interface PricePointDraft {
    date: string;
    price: number;
    note: string;
}

/** 涨用朱砂、跌用墨绿、持平用次级墨；各视图共用 toneOf 的方向。 */
export type PriceTone = 'up' | 'down' | 'flat';

export interface PriceChange {
    /** 最新价 − 基准价，单位是游戏币原值。 */
    delta: number;
    /** 相对基准价的比例（0.12 表示涨 12%）；基准价 ≤ 0 时为 `null`。 */
    ratio: number | null;
    tone: PriceTone;
    /** 基准价与最新价，历史列表要用它说明「跟哪一条比」。 */
    from: number;
    to: number;
    /** 基准那一条的日期 `YYYY-MM-DD`。 */
    since: string;
    /** 基准与最新落在同一天：文案得说「同日上一条」，写日期会被读成「跟昨天比」。 */
    sameDay: boolean;
}

export interface PriceFilter {
    keyword: string;
    /** 一级分类，空串 = 不限。 */
    category: string;
    /** 二级分类空串为不限；两级筛选分别生效，未填写二级的条目不匹配具体二级。 */
    sub: string;
}

/** 归一使用 services/shape.ts 的基础工具；物价特有日期与金额语义留在本模块。 */

/**
 * 价格：有限正数，保留两位小数；认不出的按 0。
 *
 * 0 在整条链上都表示「没记价」，所以它不是一个合法的价格——`normalizePoint` 会因此
 * 把这条记录整条丢掉，而不是留一行「—」在历史里让人猜。
 */
const amount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};

const dateText = (value: unknown): string => {
    const candidate = text(value);
    return isDayText(candidate) ? candidate : '';
};

/* `todayText` / `shortDate` 已挪到 `services/format.ts`：收益页与设置页也要用，
 * 留在这里会让它们反向依赖物价模块。 */

/* 新 id 用 `services/shape.ts` 的 `makeId(prefix)`——原先这里有个 `makePriceId`，
 * 与名册的 `makeId` 是同一套 randomUUID 回落算法，只有前缀不同。 */

/* ======================================================================
 * 读数：当前价、涨跌、显示口径
 * ==================================================================== */

/** 日期倒序，同日按 createdAt 倒序；YYYY-MM-DD 按字典序比较，避免时区换日。
 * 调用方可复用当前版本的排序结果，不跨数据版本缓存。 */
export function sortedPoints(item: ReadonlyPriceItem): PricePoint[] {
    return item.points
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** 当前价 = 最新一条历史；一条都没有时为 `null`（界面显示「未记录」）。 */
export function currentPoint(
    item: ReadonlyPriceItem,
    points: readonly PricePoint[] = sortedPoints(item),
): PricePoint | null {
    return points[0] ?? null;
}

/**
 * 卡片上那根迷你走势线要的数：最近 N 次价格，**时间正序**（左老右新）。
 *
 * 取最近的而不是全部：走势线只有 46px 宽，200 个点进去等于一团墨。
 * 8 条是「看得出形状」与「每一笔都读得出拐点」的平衡点——再多，两点之间只剩
 * 半个像素的落差，涨跌会被抹平。
 */
export function recentPrices(
    item: ReadonlyPriceItem,
    limit = 8,
    points: readonly PricePoint[] = sortedPoints(item),
): number[] {
    return points
        .slice(0, limit)
        .reverse()
        .map((point) => point.price);
}

/** 图表仅截取最近 N 条并按时间正序展示；总条数独立传给图表，不能把截取条数当总数。 */
export function chartPrices(
    item: ReadonlyPriceItem,
    limit = CHART_LIMIT,
    points: readonly PricePoint[] = sortedPoints(item),
): { date: string; price: number }[] {
    return points
        .slice(0, limit)
        .reverse()
        .map((point) => ({ date: point.date, price: point.price }));
}

function toneOf(delta: number): PriceTone {
    // 涨红跌绿（国内读法）：见 `PriceTone` 的注释。三档之外没有第四种颜色。
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
}

/** 徽章比较上一个不同日期的最新记录；全部同日时退回上一笔，不足两笔返回 null。
 * 补记旧日期会改变比较基准，这是当前价从历史派生的结果。 */
export function priceChange(
    item: ReadonlyPriceItem,
    list: readonly PricePoint[] = sortedPoints(item),
): PriceChange | null {
    if (list.length < 2) return null;

    const latest = list[0];
    const base = list.find((point, index) => index > 0 && point.date !== latest.date) ?? list[1];
    const delta = Math.round((latest.price - base.price) * 100) / 100;

    return {
        delta,
        ratio: base.price > 0 ? delta / base.price : null,
        tone: toneOf(delta),
        from: base.price,
        to: latest.price,
        since: base.date,
        sameDay: base.date === latest.date,
    };
}

/** 历史行与紧邻的更早一笔比较，最早一笔返回 null；与跨日期的徽章基准不同，界面需说明口径。 */
export function pointDelta(sorted: PricePoint[], index: number): number | null {
    const previous = sorted[index + 1];
    if (!previous) return null;
    return Math.round((sorted[index].price - previous.price) * 100) / 100;
}

/* `trimZero` / `PriceLabel` / `priceLabel` / `moneyText` / `changeText` 已挪到
 * `services/format.ts`——它们是「金额怎么写给人看」，收益页与设置页也用同一套。 */

/**
 * 涨跌幅：10% 以下保留一位小数，再往上取整。
 *
 * 一律取整会把 2.5% 写成 3%、7.1% 写成 7%——物价刚好在那几个点上有差别，磨掉就没意义了；
 * 而 10% 以上的整数位已经够用，多一位只会让徽章变宽。传绝对值。
 */
export function percentText(ratio: number): string {
    const percent = Math.abs(ratio) * 100;
    return (percent < 10 ? Number(percent.toFixed(1)) : Math.round(percent)) + '%';
}

/** 卡片与历史窗口共用涨跌说明，包含比较基准、金额与百分比。 */
export function changeSentence(change: PriceChange): string {
    /* 「同日上一条」五个字夹在 `较 … 涨` 中间会被空格切碎：「较 同日上一条 涨 2000」。
     * 换成「上一次」这五个字就顺了；日期那一支仍保留两侧空格（「较 11-01 涨 2000」），
     * 中文和数字之间隔一格才不挤。 */
    const since = change.sameDay ? '上一次' : shortDate(change.since);
    const spaced = change.sameDay ? since : ` ${since} `;
    if (change.delta === 0) return change.sameDay ? `与${since}同价` : `与 ${since} 同价`;
    const direction = change.delta > 0 ? '涨' : '跌';
    const ratio = change.ratio === null ? '' : `（${percentText(change.ratio)}）`;
    return `较${spaced}${direction} ${moneyText(change.delta)}${ratio}`;
}

/** 卡片上那枚涨跌徽章要的三样东西。 */
export interface PriceBadge {
    /** 徽章上的字：「▲ 5.2%」「▼ 80」「持平」。 */
    text: string;
    tone: PriceTone;
    /** 悬停与读屏念的完整句（`changeSentence`）。 */
    title: string;
}

/** 不足两笔不显示徽章；优先显示百分比，基准为零时显示金额，完整说明放 title。 */
export function priceBadge(
    item: ReadonlyPriceItem,
    points: readonly PricePoint[] = sortedPoints(item),
): PriceBadge | null {
    const change = priceChange(item, points);
    if (!change) return null;
    if (change.delta === 0) {
        return { text: '持平', tone: 'flat', title: changeSentence(change) };
    }
    const up = change.delta > 0;
    /* 这一格叫 `shown` 而不是 `amount`：后者现在是本文件的兜底函数，同名会互相遮蔽。 */
    const shown = change.ratio === null ? moneyText(change.delta) : percentText(change.ratio);
    return {
        text: `${up ? '▲' : '▼'} ${shown}`,
        tone: up ? 'up' : 'down',
        title: changeSentence(change),
    };
}

/**
 * 卡片底行左边那一句：最后一次记价的日期 + 一共几条。
 *
 * 条数只在历史窗里数得出来，卡片上给一眼的总量；日期不写年份（`shortDate`），
 * 因为这一页关心的都是最近几个月。
 */
export function updateSummary(
    item: ReadonlyPriceItem,
    points: readonly PricePoint[] = sortedPoints(item),
): string {
    const point = currentPoint(item, points);
    if (!point) return '未记录';
    return `${shortDate(point.date)} · ${item.points.length} 条`;
}

/* ======================================================================
 * 归一：来的东西一律先过这一层
 * ==================================================================== */

/** 归一价格记录；无有效日期或价格不为正时返回 null，不保留无信息的空壳。 */
function normalizePoint(raw: unknown): PricePoint | null {
    if (!isObject(raw)) return null;
    const date = dateText(raw.date);
    const price = amount(raw.price);
    if (!date || !price) return null;
    return {
        id: text(raw.id) || makeId('pt'),
        date,
        price,
        note: text(raw.note),
        createdAt: stamp(raw.createdAt),
    };
}

/** 归一物品时补缺失字段、隔离坏记录。
 * 分类已合法且存在 sub 字段时保留原值，否则按旧分类和名称推断，避免反复覆盖用户选择。 */
export function normalizePriceItem(raw: unknown): PriceItem {
    const item = isObject(raw) ? raw : {};
    const name = text(item.name) || '未命名物品';
    const category = text(item.category);
    const slot =
        typeof item.sub === 'string' && isPriceCategory(category)
            ? { category, sub: text(item.sub) }
            : legacyPriceSlot(name, category);

    /* 历史按日期倒序截到上限：补记过几个月之后，旧记录可能早就超过 200 条。
     * 截断取**最新**的那一端，倒着走长期走势时丢的是最老的那几条。 */
    const points = rows(item.points)
        .map(normalizePoint)
        .filter((point): point is PricePoint => point !== null)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .slice(0, POINT_LIMIT);

    const createdAt = stamp(item.createdAt);
    /* 排序读的是 `updatedAt`。老数据没有这个字段时用「最新一条价格的时间」兜底，
     * 比用 `createdAt` 更接近事实：一件物品的「最近更新」就是它最后一次记价。 */
    const updatedAt = stamp(item.updatedAt) || points[0]?.createdAt || createdAt;

    return {
        id: text(item.id) || makeId('item'),
        name,
        category: slot.category,
        sub: slot.sub,
        unit: text(item.unit) || DEFAULT_UNIT,
        note: text(item.note),
        points,
        createdAt,
        updatedAt,
    };
}

/** 本地读取和跨窗口同步共用，结构损坏时整份拒绝。 */
export function parsePriceItems(raw: unknown): PriceItem[] {
    return parseLocalList(raw, (list) =>
        (list as unknown[]).filter(isObject).map(normalizePriceItem),
    );
}

/* ======================================================================
 * 工厂：把表单草稿变成合法的数据
 * ==================================================================== */

/** 物品草稿 → 数据。`id` 与时间戳由调用方给，这一层不碰 `Date.now()`。 */
export function makePriceItem(draft: PriceItemDraft, id: string, now: number): PriceItem {
    const category = isPriceCategory(draft.category) ? draft.category : DEFAULT_CATEGORY;
    return {
        id,
        name: draft.name.trim() || '未命名物品',
        category,
        sub: draft.sub.trim(),
        unit: DEFAULT_UNIT,
        note: draft.note.trim(),
        points: [],
        createdAt: now,
        updatedAt: now,
    };
}

/** 价格草稿 → 数据。日期与价格由表单校验过，这里只做归一。 */
export function makePricePoint(draft: PricePointDraft, createdAt: number): PricePoint {
    return {
        id: makeId('pt'),
        date: dateText(draft.date) || todayText(),
        price: amount(draft.price),
        note: draft.note.trim(),
        createdAt,
    };
}

/** 已有物品 → 表单草稿（编辑时打开表单用）。 */
export function toItemDraft(item: ReadonlyPriceItem): PriceItemDraft {
    return { name: item.name, category: item.category, sub: item.sub, note: item.note };
}

/** 已有记录 → 表单草稿（改一条旧价时用）。 */
export function toPointDraft(point: PricePoint): PricePointDraft {
    return { date: point.date, price: point.price, note: point.note };
}

/* ======================================================================
 * 校验：返回「每个格子各自的那句话」，空串表示没问题
 * ==================================================================== */

export interface PriceItemErrors {
    name: string;
    sub: string;
}

/** 返回逐字段错误供表单就近展示，不抛出首个错误中断其余字段校验。 */
export function itemDraftErrors(draft: { name: string; sub: string }): PriceItemErrors {
    const name = draft.name.trim();
    return {
        name: !name
            ? '请填写物品名称'
            : name.length > NAME_LIMIT
              ? `名称不能超过 ${NAME_LIMIT} 个字`
              : '',
        sub: draft.sub.trim().length > SUB_LIMIT ? `子类不能超过 ${SUB_LIMIT} 个字` : '',
    };
}

export interface PricePointErrors {
    date: string;
    price: string;
}

export function pointDraftErrors(draft: { date: string; price: number }): PricePointErrors {
    const date = draft.date.trim();
    return {
        date: !date ? '请填记录日期' : !dateText(date) ? '日期要写成 2026-11-05 这种格式' : '',
        price: amount(draft.price) > 0 ? '' : '价格要大于 0',
    };
}

/* ======================================================================
 * 筛选与排序
 * ==================================================================== */

const byName = (a: ReadonlyPriceItem, b: ReadonlyPriceItem) =>
    a.name.localeCompare(b.name, 'zh-Hans-CN');

/**
 * 最近更新的排在前面；同一时间戳按名称排，避免刷新一次顺序就变。
 * 这是**基准顺序**，筛选之后的重新排序都以它为出发点（同值时仍稳定）。
 */
function orderedItems(items: readonly ReadonlyPriceItem[]): ReadonlyPriceItem[] {
    return items.slice().sort((a, b) => b.updatedAt - a.updatedAt || byName(a, b));
}

/** 按条件筛选，最近更新的物品在前。 */
export function filterItems(
    items: readonly ReadonlyPriceItem[],
    filter: PriceFilter,
): ReadonlyPriceItem[] {
    const keyword = filter.keyword.trim().toLocaleLowerCase();
    const kept = items.filter((item) => {
        if (filter.category && item.category !== filter.category) return false;
        /* 二级是精确匹配：它本来就是「这一大类下面的某一小节」，
         * 用 `includes` 会让「高级兽决」把「兽决」也捞进来。 */
        if (filter.sub && item.sub !== filter.sub) return false;
        if (!keyword) return true;
        return [item.name, item.category, item.sub, item.unit, item.note]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword);
    });

    return orderedItems(kept);
}

/** 已保存数据的只读视图；编辑使用独立草稿。 */
export type ReadonlyPriceItem = DeepReadonly<PriceItem>;
