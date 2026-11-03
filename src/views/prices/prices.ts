/**
 * 物价的字段契约 + 纯计算 + 本机存储的读写。
 *
 * ---- 这个文件为什么存在 ----
 * 物价页要在三个地方读同一份数据（卡片网格、走势面板、编辑表单），而「当前价是多少」
 * 「比上一条涨了几个点」这两件事必须只有一处算法：卡片与走势面板各算一遍，
 * 迟早给出两个价。所以规则全在这里，界面只负责画。
 *
 * ---- 为什么没有 `view` ----
 * 这里**不 import vue、不碰 DOM**。持有状态的是隔壁 `prices-store.ts`（模块级 `ref` +
 * `usePrices()`，与 `characters/roster.ts`、`use-theme.ts` 同一套写法）。
 * 拆开的理由与 `components/ghost/map-paint.ts` 从 `MapCanvas.vue` 里拆出去是同一条
 * （CONVENTIONS §2.2 那条「一个文件只回答一个问题」）：这里答「数据长什么样、怎么算」，
 * store 答「谁持有它、什么时候落盘」。顺带的好处是这一层能直接被单测覆盖，
 * 不必拉起 Vue 运行时。
 *
 * ---- 当前价由历史派生，不单独存 ----
 * 老系统（`mh-tool/src/renderer/domain/prices.js:8-10`）立的第一条规矩：
 * 一件物品只存价格历史，当前价取最新一条。两处各存一份，迟早出现卡上的价与历史
 * 最后一条对不上，而且**没有任何办法判断哪一份是对的**。这里照搬：`PriceItem` 上
 * 没有 `price` 字段，`currentPoint()` 现算。
 *
 * ---- 量纲：只存游戏币原值 ----
 * `price` 一律是原始数（15000 表示 1.5 万），显示时才折算万 / 亿（`priceLabel`）。
 * 把「1.5」和「万」拆开存，等于让每一处读取都得记得乘回去；一旦某天要换成「亿」，
 * 全部历史记录都要批量改。
 */
import { DEFAULT_CATEGORY, isPriceCategory, legacyPriceSlot, subsOf } from './prices-catalog';

/** 名称上限，与表单的 `maxlength` 同一枚常量——两处各写一个数必然有一天不相等。 */
export const NAME_LIMIT = 40;
/** 二级分类上限，与表单的 `maxlength` 同上。 */
export const SUB_LIMIT = 12;
/** 一件物品最多保留的价格记录数：够看长期走势，又不至于把一份 localStorage 撑爆。 */
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
/** 存储键。与角色名册（`mh-roster`）、开发者模式（`mh-dev-mode`）同一命名节奏。
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

/**
 * 涨跌方向。
 *
 * **涨红跌绿是国内的读法，与欧美股市相反**（那边红是跌）。这一页的读者是国服玩家，
 * 摆摊报价涨了就是「贵了」，因此：涨用朱砂（`--cinnabar`），跌用墨绿（`--moss`），
 * 持平用次级墨（`--muted`）。这条口径写死在 `toneOf` 里，配色由三个组件各自引令牌，
 * 谁都不许反着来——反过来读的人会把整张表看反。
 */
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

/** 排序方式。「最近更新」是基准顺序，其余都是看数据的临时视角。 */
export type PriceSort = 'updated' | 'price-desc' | 'price-asc' | 'delta' | 'name';

export interface PriceFilter {
    keyword: string;
    /** 一级分类，空串 = 不限。 */
    category: string;
    /**
     * 二级分类，空串 = 不限。
     *
     * 一级与二级是两个独立的下拉（用户定的），所以这里不能只存一级再「包含其所有二级」：
     * 一级为空、二级有值时是合法组合吗——不是，界面上二级在一级为「全部」时是禁用的。
     * 但这一层不替界面兜底：两个条件各自成立就各自过滤，空串跳过。
     * 数据里的 `sub` 允许为空（只知道大类、还没细分的卡），所以「筛某个二级」时
     * 那些没填二级的卡自然不出现——这正是筛选该有的意思。
     */
    sub: string;
    sort: PriceSort;
}

/* ======================================================================
 * 基础兜底：未知值 → 契约里的形状
 * ==================================================================== */

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

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

/**
 * 时间戳。`NaN` / `Infinity` 参与排序会让整列顺序变成 undefined 行为
 * （比较函数返回 `NaN` 时 V8 视作 0，看起来「偶尔乱序」，最难查）。
 */
const stamp = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;

const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 只接受 `YYYY-MM-DD`；认不出退回空串，绝不抛错。 */
const dateText = (value: unknown): string => {
    const candidate = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
};

/**
 * 今天，`YYYY-MM-DD`。
 *
 * **不能用 `toISOString().slice(0, 10)`**：那是 UTC 日期，东八区在凌晨 0–8 点之间会
 * 给出昨天——「今天记的价」在日期列上写着昨天，而且只有熬夜的人碰得上，
 * 报上来时根本复现不了。所以取本地日期分量自己拼。
 */
export function todayText(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

/** 日期去掉年份：卡片与历史列表里全是今年的记录，年份占位置不提供信息。 */
export function shortDate(date: string): string {
    return date.length === 10 ? date.slice(5) : date;
}

/**
 * 新 id。
 *
 * 前缀分开（`item-` / `pt-`）是为了看 localStorage 里那坨 JSON 时，
 * 一眼认得出哪个字符串是物品、哪个是价格记录。`randomUUID` 在 WebView2 与 Node 19+
 * 都有，老环境回落到时间戳 + 随机后缀（与 `roster.ts` 的 `makeId` 同一条）。
 */
export function makePriceId(prefix: 'item' | 'pt'): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid
        ? `${prefix}-${uuid}`
        : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ======================================================================
 * 读数：当前价、涨跌、显示口径
 * ==================================================================== */

/**
 * 历史按「日期倒序、同一天后记的在前」排好再给界面。
 *
 * 每条读取都先过这里，所以界面里**不许**再出现 `.sort()`：日期字符串是 `YYYY-MM-DD`，
 * 直接按字典序比较就等价于按时间比较，不需要 `Date`——这也顺手绕开了「时区把日期挪一天」。
 *
 * **同一日期的一组里，`createdAt` 最大的那条排最前**（也就是「最后记的那一笔」）。
 * 于是「当前价」= 今天最后一次记的价，而不是「今天第一次」。
 */
export function sortedPoints(item: PriceItem): PricePoint[] {
    return item.points
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** 当前价 = 最新一条历史；一条都没有时为 `null`（界面显示「未记录」）。 */
export function currentPoint(item: PriceItem): PricePoint | null {
    return sortedPoints(item)[0] ?? null;
}

/**
 * 卡片上那根迷你走势线要的数：最近 N 次价格，**时间正序**（左老右新）。
 *
 * 取最近的而不是全部：走势线只有 46px 宽，200 个点进去等于一团墨。
 * 8 条是「看得出形状」与「每一笔都读得出拐点」的平衡点——再多，两点之间只剩
 * 半个像素的落差，涨跌会被抹平。
 */
export function recentPrices(item: PriceItem, limit = 8): number[] {
    return sortedPoints(item)
        .slice(0, limit)
        .reverse()
        .map((point) => point.price);
}

/**
 * 走势面板的折线要的数：最多 N 条，时间正序。
 *
 * 上限存在的理由与卡片那根线不同：这里不是「点太密看不清」，而是「一屏放不下十年的账」。
 * 超过上限时**图只画最近 40 条**，所以调用方必须把总条数一起交出去（`PriceChart` 的
 * `total`），否则读屏会听到「共 40 次记录」而同屏抬头写着「120 条记录」。
 */
export function chartPrices(
    item: PriceItem,
    limit = CHART_LIMIT,
): { date: string; price: number }[] {
    return sortedPoints(item)
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

/**
 * 涨跌：与**上一条不同日期**的记录比；全部记录都落在同一天时退回上一条。
 *
 * 为什么不是死板地「跟紧挨着的那一条比」：一天内记两次价是常态（先记个大概价、
 * 回头核实再改），两条都在今天时，跟紧邻那条比出来的只是「我今天改过一次数」，
 * 报成涨跌会让人以为行情动了。跨天时基准仍是上一个不同日期，同一天补记不会把
 * 跨天涨跌冲掉。**不足两条返回 `null`**——一条记录谈不上涨跌，界面不挂徽章。
 *
 * 与老系统 `priceChange` 同一条口径（`prices.js:116-144`）。
 *
 * ---- 两个已知后果，写在这里免得被当成 bug 修 ----
 * 1. 同一日期的一组里，基准取 `createdAt` **最新**的那一条（`sortedPoints` 的次序）。
 *    所以「今天记了三次」时，比的是今天最后一次与上个不同日期。
 * 2. **补记一条旧日期的价会改掉徽章**：徽章的基准是「最新的那条」自己找出来的，
 *    补上一条昨天的记录之后，昨天的价就成了基准，今天的涨幅跟着变。这是「当前价由
 *    历史派生」这条设计的必然代价，不是缓存没刷。
 */
export function priceChange(item: PriceItem): PriceChange | null {
    const list = sortedPoints(item);
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

/**
 * 历史列表里某一行的涨跌：跟**紧挨着的下一条（更早的那条）**比。
 *
 * **与 `priceChange` 不是一个问题，两个答案都对**：徽章答「行情相对上一个交易日动了多少」，
 * 这一列答「这一笔比上一笔多了多少」。同一天记了两次时，首行可能写 `+10`，而徽章写
 * 「较 11-02 涨 25%」——不是矛盾，是「今天改过一次数」与「这个月涨了多少」。
 * 界面要给首行加 `title` 说明基准（见 `PricesView` 的 `rows`），否则读的人会以为算错了。
 *
 * 最早那一行没有更早的记录可比，返回 `null`（显示「起点」）。
 */
export function pointDelta(sorted: PricePoint[], index: number): number | null {
    const previous = sorted[index + 1];
    if (!previous) return null;
    return Math.round((sorted[index].price - previous.price) * 100) / 100;
}

/** 撤掉多余的小数尾巴：1.50 → 1.5，2.00 → 2。 */
function trimZero(value: number): string {
    const fixed = value.toFixed(2).replace(/\.?0+$/, '');
    return fixed === '' ? '0' : fixed;
}

export interface PriceLabel {
    value: string;
    unit: string;
}

/**
 * 价格显示口径：**一律以「万」为单位**，不足一万的按原值。
 *
 * 梦幻币的量级就是几十万到几亿，摆摊也这么说（「这个 320 万」）。
 * 原先满亿会折成「1.5 亿」——于是同一列里「1.5 亿」和「860 万」两种单位并排，
 * 读的人得在心里换算一次才能比大小。全都落成万之后，一列数字可以直接比。
 *
 * 代价是上亿的数会变长（1.5 亿 → 15000 万）。这是用户明确要的：这一页看的是行情对比，
 * 不是报数，同一个单位比「短」更重要。
 *
 * 不足一万仍按原值：`0.03 万` 比 `333` 更难懂，而梦幻币低于一万的价本来就少。
 *
 * 卡片、历史、走势图纵轴共用这一个函数——三处各写一套换算，迟早有一处把 1.5 亿写成
 * 1500 万。
 *
 * 传 `null` 或 0 时给「—」且单位为空：那是「未记录」，不是「零游戏币」。
 */
export function priceLabel(value: number | null): PriceLabel {
    const total = Number(value);
    if (!Number.isFinite(total) || total <= 0) return { value: '—', unit: '' };
    if (total >= 10000) return { value: trimZero(total / 10000), unit: '万' };
    return { value: trimZero(total), unit: '' };
}

/** 金额一句话（带单位）。不到一万时单位为空，直接拼会留一个尾随空格。 */
export function moneyText(value: number): string {
    const label = priceLabel(Math.abs(value));
    return label.unit ? `${label.value} ${label.unit}` : label.value;
}

/**
 * 带正负号的差额：「+1.5 万」「−80」「持平」。
 *
 * 减号用 U+2212（`−`）而不是 ASCII 连字符：与 `+` 等宽，一列差额上下对齐时不会左右晃。
 * 全站数字列都走 `tabular-nums`，就这一处会破功。
 */
export function changeText(delta: number): string {
    if (delta === 0) return '持平';
    const sign = delta > 0 ? '+' : '−';
    return sign + moneyText(delta);
}

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

/**
 * 一句完整的涨跌话：跟谁比、差多少、差几个百分点。
 *
 * 例：「较 11-02 涨 1.5 万（5.2%）」「与同日上一条同价」。
 * 这句话原先在 `PriceCard` 的徽章 `title` 与 `PriceHistoryDialog` 的抬头里**各拼一遍**，
 * 句式还不一样（一处带百分比、一处不带）。口径只该有一个，两处都引这里。
 */
export function changeSentence(change: PriceChange): string {
    const since = change.sameDay ? '同日上一条' : shortDate(change.since);
    if (change.delta === 0) return `与 ${since} 同价`;
    const direction = change.delta > 0 ? '涨' : '跌';
    const ratio = change.ratio === null ? '' : `（${percentText(change.ratio)}）`;
    return `较 ${since} ${direction} ${moneyText(change.delta)}${ratio}`;
}

/** 卡片上那枚涨跌徽章要的三样东西。 */
export interface PriceBadge {
    /** 徽章上的字：「▲ 5.2%」「▼ 80」「持平」。 */
    text: string;
    tone: PriceTone;
    /** 悬停与读屏念的完整句（`changeSentence`）。 */
    title: string;
}

/**
 * 卡片的涨跌徽章。不足两条记录时为 `null`——一条记录谈不上涨跌，界面不挂徽章。
 *
 * 徽章只放**一个**数：有百分比就放百分比，没有（基准价为 0）才退回金额。
 * 完整那句话放 `title`，与历史弹窗抬头引的是同一个 `changeSentence`。
 *
 * 这段原先写在 `PriceCard.vue` 的 `computed` 里。搬出来的理由不是「代码长」，
 * 而是它属于「物价怎么读」这件事——同一套口径还会被收益页、总览页用上，
 * 留在某一个组件的 setup 里，下一页就得再抄一遍。
 */
export function priceBadge(item: PriceItem): PriceBadge | null {
    const change = priceChange(item);
    if (!change) return null;
    if (change.delta === 0) {
        return { text: '持平', tone: 'flat', title: changeSentence(change) };
    }
    const up = change.delta > 0;
    const amount = change.ratio === null ? moneyText(change.delta) : percentText(change.ratio);
    return {
        text: `${up ? '▲' : '▼'} ${amount}`,
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
export function updateSummary(item: PriceItem): string {
    const point = currentPoint(item);
    if (!point) return '未记录';
    return `${shortDate(point.date)} · ${item.points.length} 条`;
}

/* ======================================================================
 * 归一：来的东西一律先过这一层
 * ==================================================================== */

/**
 * 一条来路不明的记录 → 合法的 `PricePoint`，认不出返回 `null`（整条丢掉）。
 *
 * 与老系统不同的是这里**不留空壳**：老版把坏记录补成 `{ date: '', price: 0 }` 留着，
 * 结果历史列表里多出一行「— 「—」」，用户既看不出那是坏数据，也没有入口修它。
 * 一条日期不可读或价格不为正的价格记录没有任何信息——丢掉是唯一诚实的处理。
 */
function normalizePoint(raw: unknown): PricePoint | null {
    if (!isObject(raw)) return null;
    const date = dateText(raw.date);
    const price = amount(raw.price);
    if (!date || !price) return null;
    return {
        id: text(raw.id) || makePriceId('pt'),
        date,
        price,
        note: text(raw.note),
        createdAt: stamp(raw.createdAt),
    };
}

/**
 * 一条来路不明的物品 → 合法的 `PriceItem`。**永不抛错**，字段缺什么补什么。
 *
 * 兜底的原则（照 `roster.ts` 的 `normalizeCharacter`）：**缺什么补什么、坏条目单条丢掉**。
 * 它失败的方式很特别——只在重启之后才出错，而那时页面已经挂载完，一行
 * `undefined is not iterable` 就是整页白屏，报错里也看不出是哪一件物品的哪一格。
 *
 * 分类走两级推断：存下来的 `category` 在目录里、且有 `sub` 字段（哪怕是空串）就照用；
 * 否则交给 `legacyPriceSlot` 按名称与旧分类名推一次。推过之后字段就存在了，
 * 用户再改成什么样都不会被推回去。
 */
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
        id: text(item.id) || makePriceId('item'),
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

/**
 * 读一份物价表。返回 `null` 表示「没有可用数据」——没存过、不是 JSON、或不是数组，
 * 三种都交给调用方决定（这里是给空表，因为物价页的空状态是专门画过的）。
 */
export function parsePriceItems(raw: string | null): PriceItem[] | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        /* 非对象（`null`、字符串、数字）是结构垃圾，直接丢——留着会变成一张名字全空的卡。
         * 对象哪怕字段全空也留着：那是录到一半的记录，「名字必填」由表单保证。 */
        return parsed.filter(isObject).map(normalizePriceItem);
    } catch {
        return null;
    }
}

export function serializePriceItems(list: PriceItem[]): string {
    return JSON.stringify(list);
}

/**
 * `localStorage` 可能不存在（单测跑在 node 里）或被策略禁用，两种都按「读不到」处理：
 * 物价表是这一页的全部内容，为了一个存储异常把整页打成白屏不值得。
 * 换存储时只改这两个函数（`ARCHITECTURE.md` §2 的「写盘时机」）。
 */
export function readPriceItems(): PriceItem[] {
    // 不能给初始值 `null`：`try` 与 `catch` 两条路径都必然赋值，那个 `null` 永远用不上，
    // 只会让 lint 报 `no-useless-assignment`，也会让人以为「读不到」有个隐式的默认路径。
    let raw: string | null;
    try {
        raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
        raw = null;
    }
    return parsePriceItems(raw) ?? [];
}

export function writePriceItems(list: PriceItem[]): void {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, serializePriceItems(list));
    } catch {
        // 写不进去（配额满、隐私模式）时界面照常工作，只是这次改动活不过重启。
    }
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
        id: makePriceId('pt'),
        date: dateText(draft.date) || todayText(),
        price: amount(draft.price),
        note: draft.note.trim(),
        createdAt,
    };
}

/** 已有物品 → 表单草稿（编辑时打开表单用）。 */
export function toItemDraft(item: PriceItem): PriceItemDraft {
    return { name: item.name, category: item.category, sub: item.sub, note: item.note };
}

/** 已有记录 → 表单草稿（改一条旧价时用）。 */
export function toPointDraft(point: PricePoint): PricePointDraft {
    return { date: point.date, price: point.price, note: point.note };
}

/**
 * 换了一级分类之后，旧的二级还留不留。
 *
 * 二级是用户自己写的，换一级之后它可能**属于另一块行情**：从「宝石符石」改到
 * 「装备灵饰」，子类仍写「宝石」——卡上的小签照旧印「宝石」，而它已经归在装备那一块，
 * 筛选、搜索、`subsHint` 三处立刻互相矛盾。这不是观感问题，是数据不一致。
 *
 * 规则：**旧二级在新一级的名单里就留着，不在就清空**。
 * - 「不在名单里」不等于「乱写的」——用户自造的二级（比如「三药·秘方」）照样会被清掉，
 *   因为它本来就是在旧一级的语境下起的名字；换了一级，重新写一个更省事。
 * - 反过来，换到一个仍然认识这个词的一级（「宝石」在「宝石符石」里）就留着，
 *   用户只是想挪个位置，不该逼他重打一遍。
 *
 * 空二级永远合法（只知道大类、还没细分），所以清空不会造出非法数据。
 */
export function retuneSub(sub: string, category: string): string {
    const current = sub.trim();
    if (!current) return '';
    return subsOf(category).includes(current) ? current : '';
}

/* ======================================================================
 * 校验：返回「每个格子各自的那句话」，空串表示没问题
 * ==================================================================== */

export interface PriceItemErrors {
    name: string;
    sub: string;
}

/**
 * 物品表单校验。
 *
 * 返回**逐格**的错误而不是抛第一个错：名字与二级分类是两个格子，抛一个错就只能
 * 在表单顶上飘一行字，用户得自己找是哪一格。返回结构化结果，表单把话挂到各自脚下。
 * 与老系统不同的一点：这里不抛异常——`throws` 在纯函数层没法被类型约束住，
 * 而调用方（表单）本来就要逐格校验。
 */
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

const byName = (a: PriceItem, b: PriceItem) => a.name.localeCompare(b.name, 'zh-Hans-CN');

/**
 * 最近更新的排在前面；同一时间戳按名称排，避免刷新一次顺序就变。
 * 这是**基准顺序**，筛选之后的重新排序都以它为出发点（同值时仍稳定）。
 */
export function orderedItems(items: PriceItem[]): PriceItem[] {
    return items.slice().sort((a, b) => b.updatedAt - a.updatedAt || byName(a, b));
}

/**
 * 筛选 + 排序。排序是**看数据的临时视角**，不写进档案：同一批物品，有人要看贵的、
 * 有人要看刚记的，存下来只会在下次打开时制造一个说不清来由的顺序。
 */
export function filterItems(items: PriceItem[], filter: PriceFilter): PriceItem[] {
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

    const sorted = orderedItems(kept);
    if (filter.sort === 'updated') return sorted;
    if (filter.sort === 'name') return sorted.sort(byName);

    /* 先装饰、再排序、最后拆掉装饰。
     *
     * 原先 `priceOf` / `priceChange` 直接写在 comparator 里：每比较一次就算一遍，
     * 而 `currentPoint` 内部要 `sortedPoints`（一次 slice + 全量 sort）、
     * `priceChange` 还要再来一次。comparator 的调用次数是 O(n log n)，
     * 100 件物品 × 每件 200 条记录时，一次筛选要做上万次「对整张卡的记录排序」——
     * 而这个结果只跟物品有关、跟比较多少次毫无关系。现在每件只算一次。 */
    const decorated = sorted.map((item) => {
        const point = currentPoint(item);
        return {
            item,
            /** `null` = 还没记过价。不写成 -1 那种哨兵值，两处判断才好读。 */
            price: point ? point.price : null,
            ratio: priceChange(item)?.ratio ?? null,
        };
    });

    switch (filter.sort) {
        case 'price-desc':
            decorated.sort((a, b) => {
                const left = a.price ?? -1;
                const right = b.price ?? -1;
                return right - left || byName(a.item, b.item);
            });
            break;
        case 'price-asc':
            /* 未记录的排最后，而不是当成 0 顶到最前：0 会让所有「还没记价」的卡
             * 挤在列表开头，看起来像最便宜的一批。 */
            decorated.sort((a, b) => {
                if (a.price === null || b.price === null) {
                    return (
                        Number(b.price !== null) - Number(a.price !== null) ||
                        byName(a.item, b.item)
                    );
                }
                return a.price - b.price || byName(a.item, b.item);
            });
            break;
        default:
            decorated.sort((a, b) => {
                if (a.ratio === null || b.ratio === null) {
                    return (
                        Number(b.ratio !== null) - Number(a.ratio !== null) ||
                        byName(a.item, b.item)
                    );
                }
                return b.ratio - a.ratio || byName(a.item, b.item);
            });
    }

    return decorated.map((entry) => entry.item);
}
