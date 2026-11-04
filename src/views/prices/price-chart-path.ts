/**
 * 折线图怎么画：入参进、路径出，不碰 Vue、不碰 DOM。
 *
 * ---- 为什么自己算路径 ----
 * 这个仓不引图表库（`package.json` 一个字符都不改），所以这里只有两件事要做：
 * 把「一串价格」换算成屏幕坐标，再拼成 `<path d="…">` 的字符串。组件只负责
 * 「量多宽、什么时候重算、把结果塞进 SVG」。
 * 与 `components/ghost/map-paint.ts` 从 `MapCanvas.vue` 里拆出来是同一条分工
 * （CONVENTIONS §2.2「先拆样子与纯计算」那条）：组件答「什么时候画」，这里答「画成什么样」。
 *
 * ---- 坐标系 ----
 * **不用固定 viewBox + 等比缩放**。`viewBox="0 0 640 200"` 配 `width: 100%` 时，
 * SVG 会等比缩放并把多出来的地方留白，图两侧各空一条，曲线永远对齐不到卡片边缘；
 * 换 `preserveAspectRatio="none"` 又会让圆点被拉成椭圆（描边能靠
 * `vector-effect` 兜住，圆形不行）。
 *
 * 所以宽度由调用方**实测**给进来（`ResizeObserver` 量容器），`viewBox` 就等于
 * `0 0 实测宽 固定高`——1 用户单位 = 1 像素，圆是真圆，线宽不用换算。
 * 高度不跟字号缩放：横轴日期字已经跟着 `--fs-*` 长了，图高再一起长会把比例拉成
 * 另一张图，而「高 180」是这一页的版式决定。
 *
 * ---- 横轴按序号均分，不按日期比例 ----
 * 价格记录是**不等距**的：可能连着三天记、然后两个月没记。按真实日期比例画，
 * 那两个月会在图上留下半张空白，而读者要回答的问题是「最近几次怎么走」。
 * 代价是横轴不再暗示时间间隔，所以**每个点都标日期**（点少时全标，点多时标首末与中点），
 * 不让人误以为两条记录之间就是一天。
 */
import { moneyText, shortDate } from '../../services/format';
import type { PriceTone } from './prices';

export interface ChartPointInput {
    /** `YYYY-MM-DD`。 */
    date: string;
    /** 游戏币原值。 */
    price: number;
}

export interface ChartDot {
    x: number;
    y: number;
    price: number;
    date: string;
    /** 最新那一点：画成更大的空心圈，是这一屏唯一的「现在」。 */
    latest: boolean;
}

export interface ChartGuide {
    y: number;
    label: string;
}

export interface ChartTick {
    x: number;
    text: string;
    anchor: 'start' | 'middle' | 'end';
}

/** 绘图区（不含四周留给刻度的边）。 */
export interface ChartPlot {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface PriceChartGeometry {
    /** 一条记录都没有：调用方画空状态，不要画一张没有线的空图。 */
    empty: boolean;
    /** 折线路径；只有一条记录时是一条横线，也走这里，调用方不必写第二种画法。 */
    line: string;
    dots: ChartDot[];
    guides: ChartGuide[];
    ticks: ChartTick[];
    /** 整体方向（末点相对首点），决定线的颜色。 */
    tone: PriceTone;
    plot: ChartPlot;
    /**
     * 实际使用的画布尺寸（已抬到下限）。
     *
     * **`viewBox` 必须用这两个数，不能用容器实测宽**：容器比 160 窄时这里会把宽抬到 160，
     * 折线按 160 算出来画到 x=150，而 `viewBox` 若只有 140，右端连最后一个圆点都会被裁掉。
     * 抬升后的尺寸交给调用方，两边用同一个数，画与裁才不会打架。
     */
    width: number;
    height: number;
}

/**
 * 四周留白。
 *
 * 左边这一档**是算出来的，不是点的**：纵轴最长的标签是 `priceLabel` 在
 * 「9999.99 万」这一档给出的 8 个字符。价格统一以万计（不再折亿）之后，
 * 上亿的数写成 5–6 位数字加「万」，宽度与这一档相当。`--fs-mini` 在
 * 「较大」字号档下是 11px，六位数字约 0.6em/字（36）+ 空格 3 + 「万」11 ≈ 50，
 * 再加与绘图区之间的 8px 间隙 = 58。取 **64** 留 6px 余量。
 *
 * 为什么必须留够：`<svg>` 默认裁剪到自己的 `viewBox`，标签一旦往左超出 x=0 就被切掉半个字，
 * 而那种残缺不会报错、只是读不出来。反过来也不能靠 `overflow: visible` 让它溢出槽沿——
 * 图已经是槽（`.well`）里的一层，字跑到槽外比被切更像坏了。
 *
 * 若哪天出现更长的写法（比如把口径改成不折算，屏幕上变成 `99999999`），这里要跟着加，
 * 或者改用一种**更短的轴刻度写法**——那是口径决定，得先问过用户，不能在这里私自定义。
 *
 * 下边 20 是日期那一行（字 10 + 上下各 5）。
 */
const PAD = { left: 64, right: 10, top: 12, bottom: 20 };

/** 上下各留一成二的余量：线贴着框边时，读者会怀疑是不是被裁掉了。 */
const HEADROOM = 0.12;

/** 两个日期刻度之间的最小间距（px）。再近就挤成一条黑线。 */
const TICK_GAP = 34;

export function buildPriceChart(input: {
    width: number;
    height: number;
    points: ChartPointInput[];
}): PriceChartGeometry {
    /* 尺寸兜底：容器还没布局完时 `clientWidth` 是 0，`viewBox` 宽写成 0 会让整张图
     * 消失（而且不报错）。给一个下限，至少能画出个大概，量到真宽度再重算。 */
    const width = Math.max(160, Math.round(input.width));
    const height = Math.max(100, Math.round(input.height));

    const plot: ChartPlot = {
        left: PAD.left,
        top: PAD.top,
        width: Math.max(10, width - PAD.left - PAD.right),
        height: Math.max(10, height - PAD.top - PAD.bottom),
    };

    const points = input.points;
    if (!points.length) {
        return {
            empty: true,
            line: '',
            dots: [],
            guides: [],
            ticks: [],
            tone: 'flat',
            plot,
            width,
            height,
        };
    }

    const prices = points.map((point) => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min;
    /* 全是一个价时 `span` 是 0，直接除会得到 `NaN`（整条路径变成 `M NaN NaN`，
     * SVG 静默不画）。给一条以价格量级为准的假跨度，线就落在中间那条水平线上。 */
    const margin = span > 0 ? span * HEADROOM : Math.max(max * 0.08, 1);
    const lo = min - margin;
    const hi = max + margin;

    const last = points.length - 1;
    const xOf = (index: number): number =>
        points.length === 1 ? plot.left + plot.width / 2 : plot.left + (index / last) * plot.width;

    /* 纵轴翻转：价格高的在上面。`hi - lo` 恒大于 0（上面那条 `margin` 保证了）。 */
    const yOf = (price: number): number => plot.top + (1 - (price - lo) / (hi - lo)) * plot.height;

    const dots: ChartDot[] = points.map((point, index) => ({
        x: xOf(index),
        y: yOf(point.price),
        price: point.price,
        date: point.date,
        latest: index === last,
    }));

    const segments = dots.map(
        (dot, index) => `${index === 0 ? 'M' : 'L'}${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`,
    );

    /* 只有一条记录时画一条横线：`M … L …` 的首尾都在中间会是一条零长的线，
     * 什么都看不见，而「记过一次价」这件事应该看得见。 */
    const line =
        dots.length === 1
            ? `M${plot.left} ${dots[0].y} L${plot.left + plot.width} ${dots[0].y}`
            : segments.join(' ');

    const guideValues = span > 0 ? [max, (max + min) / 2, min] : [max];
    const guides: ChartGuide[] = guideValues.map((value) => ({
        y: Math.round(yOf(value)) + 0.5,
        label: moneyText(value),
    }));

    return {
        empty: false,
        line,
        dots,
        guides,
        ticks: buildTicks(points, xOf),
        tone: toneOf(dots[0].price, dots[last].price),
        plot,
        width,
        height,
    };
}

function toneOf(first: number, last: number): PriceTone {
    // 涨红跌绿（国内读法）。曲线整体方向：末点相对首点，与徽章那条口径分开算——
    // 徽章答「比上一笔」，曲线答「这一段整体」，两个问题不该共用一个答案。
    if (last > first) return 'up';
    if (last < first) return 'down';
    return 'flat';
}

/**
 * 横轴日期。
 *
 * 顺序按**优先级**放：末点（「现在」）与首点先占位，中间再按空间插。
 * 反过来按序号顺序放、放不下就跳过，最后被挤掉的往往正是末点——一句话被截在
 * 「…」上还能猜，一个日期被吞掉就只剩一张没有右端的图。
 * 同一天记了多次时日期只标一次：三个「11-03」并排只会让人以为标错了。
 */
function buildTicks(points: ChartPointInput[], xOf: (index: number) => number): ChartTick[] {
    const last = points.length - 1;
    if (last === 0) {
        return [{ x: xOf(0), text: shortDate(points[0].date), anchor: 'middle' }];
    }

    const middle = Math.round(last / 2);
    const inner = Array.from({ length: Math.max(0, last - 1) }, (_, i) => i + 1);
    const candidates = last + 1 <= 6 ? [last, 0, ...inner] : [last, 0, middle];

    const ticks: ChartTick[] = [];
    const seen = new Set<string>();
    for (const index of candidates) {
        const text = shortDate(points[index].date);
        const x = xOf(index);
        if (seen.has(text)) continue;
        if (ticks.some((tick) => Math.abs(tick.x - x) < TICK_GAP)) continue;
        seen.add(text);
        ticks.push({
            x,
            text,
            anchor: index === last ? 'end' : index === 0 ? 'start' : 'middle',
        });
    }

    return ticks.sort((a, b) => a.x - b.x);
}

/**
 * 卡片上那根迷你走势线（46 × 14）。返回 `M…L…` 路径，空数据返回空串。
 *
 * 这里**可以**用固定 `viewBox` + `preserveAspectRatio="none"`：图上只有一条描边，
 * 宽度靠 `vector-effect="non-scaling-stroke"` 兜住，没有圆点，也就不存在
 * 「圆被拉成椭圆」的问题（大图那边不行，见文件头）。
 *
 * **价格一直没变时画在正中，不贴底**：`span` 为 0 时若拿 1 当分母，`(value-min)/span`
 * 恒为 0，线会贴在最下沿，读起来像「现在处于区间最低」——而事实是「一条水平的心电图」。
 * 大图那边（`buildPriceChart`）用假跨度把平线放在中线，两处必须是同一种读法。
 */
export function buildSparkline(values: number[], width: number, height: number): string {
    if (values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const pad = 1.5;
    const innerWidth = Math.max(1, width - pad * 2);
    const innerHeight = Math.max(1, height - pad * 2);

    return values
        .map((value, index) => {
            const x = pad + (index / (values.length - 1)) * innerWidth;
            const y = span === 0 ? height / 2 : height - pad - ((value - min) / span) * innerHeight;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
}
