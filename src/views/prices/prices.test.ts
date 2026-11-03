import { describe, expect, it } from 'vitest';
import {
    CHART_LIMIT,
    NAME_LIMIT,
    POINT_LIMIT,
    SUB_LIMIT,
    changeSentence,
    changeText,
    chartPrices,
    currentPoint,
    filterItems,
    itemDraftErrors,
    makePriceItem,
    makePricePoint,
    moneyText,
    normalizePriceItem,
    parsePriceItems,
    percentText,
    pointDelta,
    pointDraftErrors,
    priceBadge,
    priceChange,
    priceLabel,
    readPriceItems,
    recentPrices,
    retuneSub,
    serializePriceItems,
    shortDate,
    sortedPoints,
    todayText,
    updateSummary,
    writePriceItems,
} from './prices';
import type { PriceFilter, PriceItem, PricePoint, PriceSort } from './prices';

/**
 * 物价的纯函数层。
 *
 * `prices.ts` 不 import vue、不碰 DOM，所以这里也不拉组件、不建 jsdom ——
 * 断言的对象就是「卡片与走势窗会拿到什么」。
 *
 * 用例按「错了会怎样」排优先级：
 * 1. **单位口径**这一季从「万 / 亿」改成「只有万」，一列数字能不能直接比大小全靠它；
 * 2. **未记录的卡排在哪**：排错会把还没记过价的卡顶到最前面，被当成「最便宜的一批」；
 * 3. **坏存档读回来**会不会牵连整份表（这一层的失败方式只在重启后出现，最难查）。
 *
 * 数据工厂只写用例关心的字段，其余按契约给默认值——这样「这条用例在测什么」一眼看得出。
 */

let serial = 0;

/** 一条价格记录。`createdAt` 不传就递增，保证同一天的多条也分得出先后。 */
function point(price: number, date: string, createdAt?: number): PricePoint {
    serial += 1;
    return { id: `pt-${serial}`, date, price, note: '', createdAt: createdAt ?? serial };
}

/** 一件物品。`updatedAt` 默认 1000，排序用例自己覆盖。 */
function makeItem(
    name: string,
    points: PricePoint[] = [],
    extra: Partial<PriceItem> = {},
): PriceItem {
    return {
        id: `item-${name}`,
        name,
        category: '其他',
        sub: '',
        unit: '个',
        note: '',
        points,
        createdAt: 1000,
        updatedAt: 1000,
        ...extra,
    };
}

function filterOf(sort: PriceSort, rest: Partial<PriceFilter> = {}): PriceFilter {
    return { keyword: '', category: '', sub: '', sort, ...rest };
}

/** 2026 年起第 n 天的 `YYYY-MM-DD`，造大批历史用。 */
function day(index: number): string {
    return new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
}

/* ======================================================================
 * 显示口径
 * ==================================================================== */

describe('价格显示口径（只折万，不再折亿）', () => {
    it('满一万折成万；满一亿也还是万，不再出现「1.5 亿」', () => {
        expect(priceLabel(3200000)).toEqual({ value: '320', unit: '万' });
        /* 这一季改动的核心：1.5 亿 现在写成 15000 万。同一列里只剩一种单位，
         * 读的人才不用在心里换算一次再比大小。 */
        expect(priceLabel(150000000)).toEqual({ value: '15000', unit: '万' });
        expect(priceLabel(10000)).toEqual({ value: '1', unit: '万' });
    });

    it('不足一万按原值，且不带单位', () => {
        expect(priceLabel(9999)).toEqual({ value: '9999', unit: '' });
        expect(priceLabel(1)).toEqual({ value: '1', unit: '' });
        expect(priceLabel(8600)).toEqual({ value: '8600', unit: '' });
    });

    it('保留四位小数：与输入格的精度对齐，重开编辑不会「变了个数」', () => {
        expect(priceLabel(12345)).toEqual({ value: '1.2345', unit: '万' });
        expect(priceLabel(86000)).toEqual({ value: '8.6', unit: '万' });
    });

    it('尾随的零去掉，但不吃掉整数位上的零', () => {
        expect(priceLabel(15000)).toEqual({ value: '1.5', unit: '万' });
        // 1000 万 不能因为「去尾零」变成 1 万。
        expect(priceLabel(10000000)).toEqual({ value: '1000', unit: '万' });
        expect(priceLabel(10000)).toEqual({ value: '1', unit: '万' });
    });

    it('0 / null / NaN / 负数 / Infinity 都是「未记录」，不是「零游戏币」', () => {
        const dash = { value: '—', unit: '' };
        expect(priceLabel(0)).toEqual(dash);
        expect(priceLabel(null)).toEqual(dash);
        expect(priceLabel(Number.NaN)).toEqual(dash);
        expect(priceLabel(-1)).toEqual(dash);
        expect(priceLabel(Number.POSITIVE_INFINITY)).toEqual(dash);
    });

    it('moneyText 拼单位，且不留尾随空格', () => {
        expect(moneyText(3200000)).toBe('320 万');
        expect(moneyText(150000000)).toBe('15000 万');
        // 不到一万时单位为空，直接 `${value} ${unit}` 会留下一个空格。
        expect(moneyText(800)).toBe('800');
        // 差额是负数进来的（`changeText` 走这条），符号由调用方加，这里取绝对值。
        expect(moneyText(-800)).toBe('800');
    });

    it('changeText：零是「持平」，负号用 U+2212 而不是 ASCII 连字符', () => {
        expect(changeText(0)).toBe('持平');
        expect(changeText(15000)).toBe('+1.5 万');
        // U+2212 与「+」等宽，一列差额上下才对得齐（见 changeText 的注释）。
        expect(changeText(-800)).toBe('\u2212800');
        expect(changeText(-800).includes('-')).toBe(false);
    });

    it('percentText：10% 以下留一位小数，之上取整', () => {
        expect(percentText(0.052)).toBe('5.2%');
        expect(percentText(0.025)).toBe('2.5%');
        expect(percentText(0.071)).toBe('7.1%');
        expect(percentText(0.1234)).toBe('12%');
        // 边界：正好 10% 走整数档。
        expect(percentText(0.1)).toBe('10%');
        // 传绝对值：跌 5.2% 也显示「5.2%」，方向由 tone 表态。
        expect(percentText(-0.052)).toBe('5.2%');
        /* 9.99% 被一位小数四舍五入成 10%，与整数档撞在一起。
         * 这是取舍不是错（只差 0.01 个点），钉住它免得以后误改。 */
        expect(percentText(0.0999)).toBe('10%');
    });
});

describe('changeSentence：一句完整的涨跌话', () => {
    it('跨天：说日期、方向、金额与百分比', () => {
        const change = priceChange(
            makeItem('金刚石', [point(20000, '2026-11-03'), point(10000, '2026-11-01')]),
        )!;
        expect(changeSentence(change)).toBe('较 11-01 涨 1 万（100%）');
    });

    it('同一天：说「上一次」——写日期会被读成「跟昨天比」', () => {
        const change = priceChange(
            makeItem('金刚石', [point(12000, '2026-11-03', 2), point(10000, '2026-11-03', 1)]),
        )!;
        expect(change.sameDay).toBe(true);
        /* 这里原本是「较 同日上一条 涨 2000（20%）」——五个字夹在 `较 … 涨` 中间被空格切碎，
         * 读起来像机器拼的。换成「上一次」之后不留空格才顺。 */
        expect(changeSentence(change)).toBe('较上一次涨 2000（20%）');
    });

    it('基准价为 0：不带百分比（不除零），只报金额', () => {
        const change = priceChange(
            makeItem('金刚石', [point(20000, '2026-11-03'), point(0, '2026-11-01')]),
        )!;
        expect(change.ratio).toBeNull();
        expect(changeSentence(change)).toBe('较 11-01 涨 2 万');
    });

    it('持平：说「与 X 同价」', () => {
        const change = priceChange(
            makeItem('金刚石', [point(10000, '2026-11-03'), point(10000, '2026-11-01')]),
        )!;
        expect(changeSentence(change)).toBe('与 11-01 同价');
    });
});

/* ======================================================================
 * 涨跌
 * ==================================================================== */

describe('priceChange：涨跌与基准', () => {
    it('不足两条记录谈不上涨跌，返回 null（界面不挂徽章）', () => {
        expect(priceChange(makeItem('空'))).toBeNull();
        expect(priceChange(makeItem('一条', [point(10000, '2026-11-03')]))).toBeNull();
    });

    it('涨：from / to / delta / ratio / tone / since 一起给', () => {
        const change = priceChange(
            makeItem('金刚石', [point(20000, '2026-11-03'), point(10000, '2026-11-01')]),
        );
        expect(change).toMatchObject({
            delta: 10000,
            ratio: 1,
            tone: 'up',
            from: 10000,
            to: 20000,
            since: '2026-11-01',
            sameDay: false,
        });
    });

    it('跌：delta 为负，tone 是 down', () => {
        const change = priceChange(
            makeItem('金刚石', [point(8000, '2026-11-03'), point(10000, '2026-11-01')]),
        );
        expect(change).toMatchObject({ delta: -2000, ratio: -0.2, tone: 'down' });
    });

    it('跟「上一条不同日期」比，不是跟紧挨着的那一条——同一天补记不冲掉跨天涨跌', () => {
        /* 11-03 记了两次（先 15000 再 20000）。若跟紧邻那条比，涨幅只剩 5000，
         * 而用户想知道的是「这个月涨了多少」。 */
        const change = priceChange(
            makeItem('金刚石', [
                point(20000, '2026-11-03', 3),
                point(15000, '2026-11-03', 2),
                point(10000, '2026-11-01', 1),
            ]),
        );
        expect(change).toMatchObject({ since: '2026-11-01', delta: 10000, sameDay: false });
    });

    it('所有记录都落在同一天时退回上一条，并标 sameDay', () => {
        const change = priceChange(
            makeItem('金刚石', [point(12000, '2026-11-03', 2), point(10000, '2026-11-03', 1)]),
        );
        expect(change).toMatchObject({ sameDay: true, since: '2026-11-03', delta: 2000 });
    });

    it('基准价为 0 时 ratio 是 null，不是 Infinity / NaN', () => {
        /* 正常路径下 0 价的记录会被 `normalizePoint` 整条丢掉，所以这里手工造一条
         * 越界数据——防御分支也要有人看着。 */
        const change = priceChange(
            makeItem('金刚石', [point(20000, '2026-11-03'), point(0, '2026-11-01')]),
        );
        expect(change?.ratio).toBeNull();
        expect(Number.isFinite(change?.delta)).toBe(true);
    });
});

describe('pointDelta：流水行内「比上一笔」', () => {
    const sorted = [
        point(12000, '2026-11-03', 3),
        point(10000, '2026-11-02', 2),
        point(8000, '2026-11-01', 1),
    ];

    it('每一行跟紧挨着的更早一条比', () => {
        expect(pointDelta(sorted, 0)).toBe(2000);
        expect(pointDelta(sorted, 1)).toBe(2000);
    });

    it('最早一条没有更早的可比，返回 null（界面写「起点」）', () => {
        expect(pointDelta(sorted, 2)).toBeNull();
        // 越界也不抛错：先取 previous，取不到就交还 null。
        expect(pointDelta(sorted, 9)).toBeNull();
        expect(pointDelta([], 0)).toBeNull();
    });
});

describe('priceBadge：卡片上那枚徽章', () => {
    it('不足两条不给徽章', () => {
        expect(priceBadge(makeItem('空'))).toBeNull();
        expect(priceBadge(makeItem('一条', [point(10000, '2026-11-03')]))).toBeNull();
    });

    it('涨：字只放一个数（有百分比就放百分比），完整那句进 title', () => {
        expect(
            priceBadge(makeItem('甲', [point(20000, '2026-11-03'), point(10000, '2026-11-01')])),
        ).toEqual({ text: '▲ 100%', tone: 'up', title: '较 11-01 涨 1 万（100%）' });
    });

    it('跌：箭头与 tone 一起翻', () => {
        expect(
            priceBadge(makeItem('甲', [point(8000, '2026-11-03'), point(10000, '2026-11-01')])),
        ).toEqual({ text: '▼ 20%', tone: 'down', title: '较 11-01 跌 2000（20%）' });
    });

    it('持平：写「持平」，tone 是 flat', () => {
        expect(
            priceBadge(makeItem('甲', [point(10000, '2026-11-03'), point(10000, '2026-11-01')])),
        ).toEqual({ text: '持平', tone: 'flat', title: '与 11-01 同价' });
    });

    it('基准价为 0 时退回金额，不显示 Infinity%', () => {
        const badge = priceBadge(
            makeItem('甲', [point(20000, '2026-11-03'), point(0, '2026-11-01')]),
        );
        expect(badge?.text).toBe('▲ 2 万');
        expect(badge?.text).not.toContain('Infinity');
        expect(badge?.title).toBe('较 11-01 涨 2 万');
    });
});

describe('updateSummary：卡片底行那一句', () => {
    it('没有记录写「未记录」', () => {
        expect(updateSummary(makeItem('空'))).toBe('未记录');
    });

    it('有记录写「日期 · 条数」，日期取最新那条', () => {
        expect(
            updateSummary(makeItem('甲', [point(10000, '2026-11-01'), point(20000, '2026-11-03')])),
        ).toBe('11-03 · 2 条');
    });

    it('日期去掉年份——这一页关心的都是最近几个月', () => {
        expect(shortDate('2026-11-03')).toBe('11-03');
    });
});

/* ======================================================================
 * 筛选与排序
 * ==================================================================== */

/* 排序刚从「comparator 里现算」改成 decorate-sort，所以每个用例都要同时钉住
 * 两件事：**顺序对**、**未记录的卡排在最后**。
 *
 * 三件道具是刻意挑的：
 * - 拼音顺序 藏(cang) < 定(ding) < 金(jin)，与 updatedAt 顺序、与码点顺序都不同；
 * - 定魂珠价格最高但涨幅最小，金刚石价格最低但涨幅最大 —— `price-desc` 与 `delta`
 *   因此给出**相反**的顺序，两个排序才不会互相冒充。
 */
const 藏宝图 = makeItem('藏宝图', [], { updatedAt: 200, category: '任务产出', sub: '藏宝图' });
const 金刚石 = makeItem('金刚石', [point(10000, '2026-11-03'), point(5000, '2026-11-01')], {
    updatedAt: 100,
    category: '任务产出',
    sub: '五宝',
    unit: '枚',
    note: 'OCR文本',
});
const 定魂珠 = makeItem('定魂珠', [point(30000, '2026-11-03'), point(20000, '2026-11-01')], {
    updatedAt: 300,
    category: '任务产出',
    sub: '兽决',
});

describe('filterItems：五种排序', () => {
    /** 故意乱序传入：排序不该依赖输入顺序。 */
    const items = [藏宝图, 金刚石, 定魂珠];
    const names = (list: PriceItem[]) => list.map((item) => item.name);

    it('updated（基准顺序）：最近更新的在前', () => {
        expect(names(filterItems(items, filterOf('updated')))).toEqual([
            '定魂珠',
            '藏宝图',
            '金刚石',
        ]);
    });

    it('name：按拼音排，不是按传入顺序也不是按码点', () => {
        expect(names(filterItems(items, filterOf('name')))).toEqual(['藏宝图', '定魂珠', '金刚石']);
    });

    it('price-desc：贵的在前，未记录排最后', () => {
        expect(names(filterItems(items, filterOf('price-desc')))).toEqual([
            '定魂珠',
            '金刚石',
            '藏宝图',
        ]);
    });

    it('price-asc：便宜的在前，未记录仍然排最后（不是当成 0 顶到最前）', () => {
        expect(names(filterItems(items, filterOf('price-asc')))).toEqual([
            '金刚石',
            '定魂珠',
            '藏宝图',
        ]);
    });

    it('delta：按涨幅比例，不按差价——未记录排最后', () => {
        /* 差价是 定魂珠 10000 > 金刚石 5000，按差价该是定魂珠在前；
         * 按比例则是 金刚石 100% > 定魂珠 50%。这里要的是后者。 */
        expect(names(filterItems(items, filterOf('delta')))).toEqual([
            '金刚石',
            '定魂珠',
            '藏宝图',
        ]);
    });

    it('同价时按名称兜底，刷新两次顺序不变', () => {
        const a = makeItem('定魂珠', [point(10000, '2026-11-03')], { updatedAt: 1 });
        const b = makeItem('藏宝图', [point(10000, '2026-11-03')], { updatedAt: 2 });
        expect(names(filterItems([a, b], filterOf('price-asc')))).toEqual(['藏宝图', '定魂珠']);
    });

    it('空表与「全被筛掉」都返回空数组', () => {
        expect(filterItems([], filterOf('updated'))).toEqual([]);
        expect(filterItems([], filterOf('delta'))).toEqual([]);
        expect(filterItems(items, filterOf('updated', { keyword: '没有这个东西' }))).toEqual([]);
    });
});

describe('filterItems：筛选条件', () => {
    const items = [藏宝图, 金刚石, 定魂珠];
    const names = (list: PriceItem[]) => list.map((item) => item.name);

    it('关键词命中名称、二级分类、单位、备注里的任意一个', () => {
        expect(names(filterItems(items, filterOf('updated', { keyword: '金刚' })))).toEqual([
            '金刚石',
        ]);
        expect(names(filterItems(items, filterOf('updated', { keyword: '五宝' })))).toEqual([
            '金刚石',
        ]);
        expect(names(filterItems(items, filterOf('updated', { keyword: '枚' })))).toEqual([
            '金刚石',
        ]);
        expect(names(filterItems(items, filterOf('updated', { keyword: 'OCR' })))).toEqual([
            '金刚石',
        ]);
    });

    it('关键词不分大小写', () => {
        expect(names(filterItems(items, filterOf('updated', { keyword: 'ocr' })))).toEqual([
            '金刚石',
        ]);
    });

    it('一级分类是精确匹配', () => {
        const other = makeItem('别的', [], { category: '召唤兽' });
        expect(
            names(filterItems([...items, other], filterOf('updated', { category: '任务产出' }))),
        ).toEqual(['定魂珠', '藏宝图', '金刚石']);
        expect(filterItems(items, filterOf('updated', { category: '召唤兽' }))).toEqual([]);
    });

    it('二级分类是精确匹配：「兽决」不会把「高级兽决」也捞进来', () => {
        const low = makeItem('低级兽决', [], { category: '兽决内丹', sub: '兽决' });
        const high = makeItem('高级兽决', [], { category: '兽决内丹', sub: '高级兽决' });
        expect(names(filterItems([low, high], filterOf('updated', { sub: '兽决' })))).toEqual([
            '低级兽决',
        ]);
        expect(names(filterItems([low, high], filterOf('updated', { sub: '高级兽决' })))).toEqual([
            '高级兽决',
        ]);
    });
});

/* ======================================================================
 * 历史派生
 * ==================================================================== */

describe('历史派生：当前价与走势取样', () => {
    const item = makeItem('金刚石', [
        point(10000, '2026-11-01', 1),
        point(20000, '2026-11-03', 3),
        point(15000, '2026-11-03', 2),
    ]);

    it('历史按日期倒序，同一天后记的在前', () => {
        expect(sortedPoints(item).map((one) => one.createdAt)).toEqual([3, 2, 1]);
    });

    it('当前价 = 最新一条，不是最后写进去的那一条', () => {
        expect(currentPoint(item)?.price).toBe(20000);
        expect(currentPoint(makeItem('空'))).toBeNull();
    });

    it('迷你走势线取最近 N 条、按时间正序（左老右新）', () => {
        expect(recentPrices(item)).toEqual([10000, 15000, 20000]);
        expect(recentPrices(item, 2)).toEqual([15000, 20000]);
    });

    it('大图最多画 CHART_LIMIT 条，画的是最近那一段', () => {
        const many = makeItem(
            '多',
            Array.from({ length: CHART_LIMIT + 10 }, (_, index) =>
                point(10000 + index, day(index), index + 1),
            ),
        );
        const chart = chartPrices(many);
        expect(chart).toHaveLength(CHART_LIMIT);
        // 丢掉的是最老的那 10 条，最后一点是最新那天。
        expect(chart[0].price).toBe(10000 + 10);
        expect(chart[chart.length - 1].price).toBe(10000 + CHART_LIMIT + 9);
    });
});

/* ======================================================================
 * 坏存档
 * ==================================================================== */

describe('parsePriceItems：读一份来路不明的存档', () => {
    it('没存过 / 不是 JSON / 不是数组，一律交还 null', () => {
        expect(parsePriceItems(null)).toBeNull();
        expect(parsePriceItems('')).toBeNull();
        expect(parsePriceItems('{ 这不是 JSON')).toBeNull();
        expect(parsePriceItems('{"id":"a"}')).toBeNull();
        expect(parsePriceItems('null')).toBeNull();
        expect(parsePriceItems('42')).toBeNull();
    });

    it('单条坏掉不牵连整份：只丢非对象那几条', () => {
        const parsed = parsePriceItems(
            JSON.stringify([null, '字符串', 42, { id: 'a', name: '甲' }, { name: '乙' }]),
        );
        expect(parsed?.map((item) => item.name)).toEqual(['甲', '乙']);
    });

    it('对象哪怕字段全空也留着——那是录到一半的记录', () => {
        const parsed = parsePriceItems(JSON.stringify([{}]));
        expect(parsed).toHaveLength(1);
        expect(parsed?.[0].name).toBe('未命名物品');
    });

    it('points 不是数组就当成没有历史，不抛错', () => {
        expect(
            parsePriceItems(JSON.stringify([{ name: '甲', points: '不是数组' }]))?.[0].points,
        ).toEqual([]);
        expect(
            parsePriceItems(JSON.stringify([{ name: '甲', points: { a: 1 } }]))?.[0].points,
        ).toEqual([]);
    });

    it('单条记录缺日期、或价格不为正，整条丢掉——不留一行「—」让人猜', () => {
        const parsed = parsePriceItems(
            JSON.stringify([
                {
                    name: '甲',
                    points: [
                        { id: 'p1', date: '2026-11-03', price: 10000 },
                        { id: 'p2', date: '', price: 10000 },
                        { id: 'p3', date: '2026-11-02', price: 0 },
                        { id: 'p4', date: '2026-11-01', price: -5 },
                        null,
                        '垃圾',
                    ],
                },
            ]),
        );
        expect(parsed?.[0].points.map((one) => one.id)).toEqual(['p1']);
    });

    it('历史超过上限时截掉最老的那一端', () => {
        const points = Array.from({ length: POINT_LIMIT + 5 }, (_, index) => ({
            date: day(index),
            price: 10000 + index,
        }));
        const item = normalizePriceItem({ name: '甲', points });
        expect(item.points).toHaveLength(POINT_LIMIT);
        expect(item.points[0].date).toBe(day(POINT_LIMIT + 4));
        expect(item.points.some((one) => one.date === day(0))).toBe(false);
    });
});

describe('normalizePriceItem：字段缺什么补什么', () => {
    it('不在九类里的一级分类回落到「其他」，原名进二级，不丢用户写的字', () => {
        const item = normalizePriceItem({ name: '甲', category: '不存在的分类' });
        expect(item.category).toBe('其他');
        expect(item.sub).toBe('不存在的分类');
    });

    it('一级合法、且有 sub 字段（哪怕空串）就照用，不做二次推断', () => {
        const item = normalizePriceItem({ name: '高级内丹', category: '兽决内丹', sub: '' });
        expect(item.category).toBe('兽决内丹');
        expect(item.sub).toBe('');
    });

    it('一级合法但根本没有 sub 字段：按名字推一次（旧数据迁移）', () => {
        const item = normalizePriceItem({ name: '高级内丹', category: '兽决内丹' });
        expect(item).toMatchObject({ category: '兽决内丹', sub: '高级内丹' });
    });

    it('sub 不是字符串时走推断，而不是把一个非字符串塞进字段', () => {
        const item = normalizePriceItem({ name: '变异召唤兽', category: '召唤兽', sub: 5 });
        expect(item.sub).toBe('变异召唤兽');
    });

    it('缺 id 补新的，两次补出来的不一样', () => {
        const first = normalizePriceItem({ name: '甲' });
        const second = normalizePriceItem({ name: '乙' });
        expect(first.id).toBeTruthy();
        expect(first.id).not.toBe(second.id);
    });

    it('非对象进来也不抛错：直接补成一张空卡', () => {
        const item = normalizePriceItem('不是对象');
        expect(item.name).toBe('未命名物品');
        expect(item.unit).toBe('个');
        expect(item.points).toEqual([]);
    });

    it('updatedAt 缺失时用「最新一条价格的时间」兜底，再退 createdAt', () => {
        expect(
            normalizePriceItem({
                name: '甲',
                points: [{ date: '2026-11-03', price: 100, createdAt: 777 }],
            }).updatedAt,
        ).toBe(777);
        expect(normalizePriceItem({ name: '甲', createdAt: 555 }).updatedAt).toBe(555);
        // 显式写 0 等同于「没有」：0 是个合法时间戳，但它显然不是真的。
        expect(normalizePriceItem({ name: '甲', updatedAt: 0, createdAt: 555 }).updatedAt).toBe(
            555,
        );
    });
});

/* ======================================================================
 * 工厂
 * ==================================================================== */

describe('工厂：草稿 → 数据', () => {
    it('makePriceItem：points 空、updatedAt 等于 createdAt、单位「个」', () => {
        expect(
            makePriceItem(
                { name: '  甲  ', category: '召唤兽', sub: ' 宝宝胚子 ', note: ' 备注 ' },
                'id-1',
                1234,
            ),
        ).toEqual({
            id: 'id-1',
            name: '甲',
            category: '召唤兽',
            sub: '宝宝胚子',
            unit: '个',
            note: '备注',
            points: [],
            createdAt: 1234,
            updatedAt: 1234,
        });
    });

    it('makePriceItem：一级分类不认识就落到「其他」，名称空白给占位', () => {
        const item = makePriceItem(
            { name: '   ', category: '乱写的', sub: '', note: '' },
            'id-2',
            1,
        );
        expect(item.category).toBe('其他');
        expect(item.name).toBe('未命名物品');
    });

    it('makePricePoint：同一毫秒连造两条，id 不会撞', () => {
        const first = makePricePoint({ date: '2026-11-03', price: 10000, note: '' }, 1000);
        const second = makePricePoint({ date: '2026-11-03', price: 12000, note: '' }, 1000);
        expect(first.id).not.toBe(second.id);
        expect(first.id.startsWith('pt-')).toBe(true);
    });

    it('makePricePoint：日期认不出就退回今天，价格不为正就落 0（由 store 拦）', () => {
        const item = makePricePoint({ date: '2026-1-5', price: -1, note: '' }, 1000);
        expect(item.date).toBe(todayText());
        expect(item.price).toBe(0);
    });
});

describe('retuneSub：换了一级之后旧的二级还留不留', () => {
    it('旧二级在新一级的名单里就留着——用户只是想挪个位置', () => {
        expect(retuneSub('宝石', '宝石符石')).toBe('宝石');
    });

    it('不在新一级的名单里就清空，避免「卡上印宝石、它已归装备」', () => {
        expect(retuneSub('宝石', '装备灵饰')).toBe('');
    });

    it('用户自造的二级换类后也清掉——它本来是在旧一级的语境下起的名字', () => {
        expect(retuneSub('三药·秘方', '消耗补给')).toBe('');
    });

    it('空二级永远合法', () => {
        expect(retuneSub('   ', '召唤兽')).toBe('');
    });
});

/* ======================================================================
 * 表单校验
 * ==================================================================== */

describe('表单校验：逐格给一句话', () => {
    it('名称空、超长各有一句，正好 40 字是合法的', () => {
        expect(itemDraftErrors({ name: '   ', sub: '' }).name).toBe('请填写物品名称');
        expect(itemDraftErrors({ name: '甲'.repeat(NAME_LIMIT + 1), sub: '' }).name).toBe(
            `名称不能超过 ${NAME_LIMIT} 个字`,
        );
        expect(itemDraftErrors({ name: '甲'.repeat(NAME_LIMIT), sub: '' }).name).toBe('');
    });

    it('二级分类超长才报错，空着不报', () => {
        expect(itemDraftErrors({ name: '甲', sub: '子'.repeat(SUB_LIMIT) }).sub).toBe('');
        expect(itemDraftErrors({ name: '甲', sub: '子'.repeat(SUB_LIMIT + 1) }).sub).toBe(
            `子类不能超过 ${SUB_LIMIT} 个字`,
        );
    });

    it('日期：只认 YYYY-MM-DD 这个形状', () => {
        const dateError = (date: string) => pointDraftErrors({ date, price: 10000 }).date;
        expect(dateError('2026-11-05')).toBe('');
        expect(dateError('2026-1-5')).toBe('日期要写成 2026-11-05 这种格式');
        expect(dateError('2026/11/05')).toBe('日期要写成 2026-11-05 这种格式');
        expect(dateError('')).toBe('请填记录日期');
    });

    it('日期要日历上也存在：2026-13-01 / 02-31 都拒掉', () => {
        /* 早先 `dateText` 只测 `^\d{4}-\d{2}-\d{2}$`，这两个都能过，于是会原样存进历史，
         * 列表里出现一行「13-01」，排序还把它排到最前面（字符串比较里 13 > 11）。
         * `Date.parse` 也拦不住 2-31（它自动进位成 3 月 3 日），所以现在按分量回比。 */
        expect(pointDraftErrors({ date: '2026-13-01', price: 10000 }).date).not.toBe('');
        expect(pointDraftErrors({ date: '2026-02-31', price: 10000 }).date).not.toBe('');
        expect(pointDraftErrors({ date: '2026-02-28', price: 10000 }).date).toBe('');
        expect(pointDraftErrors({ date: '2028-02-29', price: 10000 }).date).toBe('');
        expect(pointDraftErrors({ date: '2026-02-29', price: 10000 }).date).not.toBe('');
    });

    it('价格必须大于 0；小数不拦（存之前按两位小数归一）', () => {
        expect(pointDraftErrors({ date: '2026-11-05', price: 0 }).price).toBe('价格要大于 0');
        expect(pointDraftErrors({ date: '2026-11-05', price: -1 }).price).toBe('价格要大于 0');
        expect(pointDraftErrors({ date: '2026-11-05', price: 1234.5 }).price).toBe('');
    });
});

/* ======================================================================
 * 存储的降级与往返
 * ==================================================================== */

describe('本机存储', () => {
    it('没有 localStorage（单测跑在 node 里）时读成空表、写入静默失败，都不抛错', () => {
        expect(readPriceItems()).toEqual([]);
        expect(() => writePriceItems([])).not.toThrow();
        expect(() => writePriceItems([makeItem('甲')])).not.toThrow();
    });

    it('往返：序列化再解析，结构与 id 都不变', () => {
        const original = [
            makeItem('金刚石', [point(10000, '2026-11-03'), point(5000, '2026-11-01')], {
                category: '任务产出',
                sub: '五宝',
            }),
        ];
        expect(parsePriceItems(serializePriceItems(original))).toEqual(original);
    });
});
