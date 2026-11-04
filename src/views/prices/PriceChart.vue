<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { moneyText } from '../../services/format';
import { buildPriceChart } from './price-chart-path';

/**
 * 一件物品的价格走势（内联 SVG，不引图表库）。
 *
 * 这个组件只管**什么时候重算**：量容器宽度、订阅尺寸变化。坐标怎么算、
 * 刻度放哪、路径怎么拼，全在 `./price-chart-path`——那一层不碰 Vue，
 * 入参进、路径出（与 `components/ghost/MapCanvas.vue` + `map-paint.ts` 同一条分工）。
 *
 * ---- 为什么宽度要实测，而不是靠 `width: 100%` ----
 * 固定 `viewBox` + 百分比缩放会让圆点变形或让曲线两侧留白，理由写在
 * `price-chart-path.ts` 的文件头。所以这里用 `ResizeObserver` 量出真实像素宽度，
 * 再把它交给纯函数；`viewBox` 与实测宽一致，1 用户单位 = 1 像素。
 *
 * 高度写死 180：图高是这一页的版式决定，不跟着字号缩放。纵轴刻度用的
 * `--fs-mini` 会自动跟着字号长，那已经够了。
 *
 * ---- 调用方的两个义务 ----
 * 1. **至少给一条价**。0 条时整块不该渲染——空框读起来像「图画砸了」，而那时真正的
 *    事实是「还没记过」，那句话该由面板抬头说，不该由一张空图说三遍。
 * 2. **超过上限时把总条数传进来**（`total`）。图只画最近 `CHART_LIMIT` 条，
 *    若不说，读屏会听到「共 40 次记录」，而同一屏的抬头写着「120 条记录」。
 */
const props = defineProps<{
    /** 时间正序的价格点。顺序由 `prices.ts` 的 `chartPrices` 保证。 */
    points: { date: string; price: number }[];
    /** 这件物品一共有多少条记录（可能多于画出来的点）。不传就按 `points.length`。 */
    total?: number;
}>();

const HEIGHT = 180;

const host = ref<HTMLDivElement | null>(null);
/* 量到之前先给一个假宽度：`buildPriceChart` 会把它抬到 160 下限，
 * 画出来比例不对但至少有东西，等挂载量到真宽度立刻重算。 */
const width = ref(420);

let observer: ResizeObserver | null = null;

onMounted(() => {
    const element = host.value;
    if (!element) return;
    const measure = () => {
        const next = Math.round(element.clientWidth);
        if (next > 0) width.value = next;
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(element);
    }
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
});

const chart = computed(() =>
    buildPriceChart({ width: width.value, height: HEIGHT, points: props.points }),
);

/**
 * 给读屏的一句话。
 *
 * 图上的折线对看不见的人是零信息，所以把「从多少到多少、几次」写成一句话挂上去——
 * 与 `MapCanvas` 把地图说成「范围 + 坐标」是同一条：图形必须有一句等价的话。
 */
const total = computed(() => Math.max(props.total ?? props.points.length, props.points.length));

/** 图只画了最近一段：既要在读屏里说，也要在图下面写一句（见模板最后那个 `.meta`）。 */
const truncated = computed(() => total.value > props.points.length);

const summary = computed(() => {
    const list = props.points;
    if (!list.length) return '还没有价格记录';
    const first = list[0];
    const last = list[list.length - 1];
    /* 「最近 N 次」与「共 M 条」必须同时出现：只报画出来的条数，读屏用户会以为
     * 这就是全部历史；只报总数，又说不出图上有几个点。 */
    const drawn = `共 ${list.length} 次记录`;
    const scope = truncated.value ? `图中最近 ${list.length} 次，共 ${total.value} 条记录` : drawn;
    if (list.length === 1) return `只有一条记录：${moneyText(last.price)}（${last.date}）`;
    return `${scope}，从 ${moneyText(first.price)} 到 ${moneyText(last.price)}`;
});
</script>

<template>
    <div ref="host" class="chart well" :class="chart.tone">
        <svg
            v-if="!chart.empty"
            class="chart-svg"
            :viewBox="`0 0 ${chart.width} ${chart.height}`"
            :width="chart.width"
            :height="chart.height"
            role="img"
            :aria-label="summary"
        >
            <!-- 横向参考线：最高 / 中间 / 最低。三条就够了，账线的密度再高会把曲线压没。 -->
            <g class="chart-guides" aria-hidden="true">
                <line
                    v-for="(guide, index) in chart.guides"
                    :key="`g-${index}`"
                    :x1="chart.plot.left"
                    :x2="chart.plot.left + chart.plot.width"
                    :y1="guide.y"
                    :y2="guide.y"
                />
            </g>

            <!-- 纵轴读数。`+3` 是把字从「以基线对齐」抬到「以中线对齐」——
                 不抬的话数字会整体坐在参考线上，读起来像标注的是线下面那一格。
                 内容走 `v-text` 而不是插值：多行属性让 Prettier 把 `{{ }}` 挪到单独一行，
                 那个换行在 SVG 里是**真的空白**，`text-anchor="end"` 的刻度会整体右移一个字宽。 -->
            <g class="chart-axis" aria-hidden="true">
                <text
                    v-for="(guide, index) in chart.guides"
                    :key="`y-${index}`"
                    :x="chart.plot.left - 8"
                    :y="guide.y + 3"
                    text-anchor="end"
                    v-text="guide.label"
                />
            </g>

            <path class="chart-line" :d="chart.line" />

            <!-- 每个点都画：只有折线时读者数不出「记过几次」。
                 最新那点是空心大圈——它是这一屏唯一的「现在」，但它不该靠第二种颜色来说话。 -->
            <circle
                v-for="dot in chart.dots"
                :key="`${dot.date}-${dot.price}-${dot.x}`"
                class="chart-dot"
                :class="{ latest: dot.latest }"
                :cx="dot.x"
                :cy="dot.y"
                :r="dot.latest ? 4 : 2.4"
            />

            <g class="chart-axis chart-dates" aria-hidden="true">
                <text
                    v-for="tick in chart.ticks"
                    :key="`x-${tick.x}`"
                    :x="tick.x"
                    :y="chart.height - 6"
                    :text-anchor="tick.anchor"
                    v-text="tick.text"
                />
            </g>
        </svg>

        <!-- 图只画了最近一段时，图下面要说清「这不是全史」：抬头写「120 条记录」、
             图上有 40 个点，中间不解释的话会读成「图画丢了 80 条」。
             没有截断时整块不渲染（§2.4-28：标签只是容器就不渲染）。 -->
        <p v-if="truncated" class="meta chart-more">
            只画最近 {{ points.length }} 次，这件物品一共 {{ total }} 条记录
        </p>
    </div>
</template>

<style scoped>
.chart {
    /* 线色跟着整体方向走。这一枚是本组件唯一的配色入口：曲线与圆点都读它，
     * 改方向只改这一行。 */
    --chart-line: var(--muted);

    width: 100%;
    min-width: 0;
    /* 图底是一道**凹槽**（模板上的 `.well`）：账本里「刻在纸上的读数」都长这样，
     * 与输入格、槽按钮同一套深度。纯纸底时那三条 1px 参考线会浮在纸上，
     * 看起来像三根漂浮的横线，而不是图上的刻度。 */
    border-radius: var(--r-2);
    /* `.well` 的顶壁渐变按元素高度的 62% 解析：180 高的图上那是 112px 的一大片灰，
     * 上半张图会被糊掉。压到 18px（与 `.field` 处理同一个问题的手法），
     * 凹的感觉留住、脏影去掉。 */
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 18px);
}
/* 涨红跌绿（国内读法，与欧美相反）：涨取朱砂，跌取墨苔。
 * 朱在这套语言里只当**线**用，不当填充——见 `.chart-dot` 的说明。 */
.chart.up {
    --chart-line: var(--cinnabar);
}
.chart.down {
    --chart-line: var(--moss);
}
/* 宽高都跟着量出来的尺寸走：`viewBox` 用的是**纯函数抬升之后**的宽高，所以
 * `width: 100%; height: auto` 反算出来正好是 `chart.height`。不写 `overflow: visible`：
 * 图已经是槽里的一层，让内容溢出槽沿只会读成「图画出去了」——而图上每一处
 * （横轴日期、纵轴刻度）都在留白里。 */
.chart-svg {
    display: block;
    width: 100%;
    height: auto;
}
.chart-guides line {
    stroke: var(--rule);
    stroke-width: 1;
}
/* SVG 的 `<text>` 继承父级的字族（与 canvas 不同，那里必须显式拼字体串），
 * 所以这里不写 `font-family`——全站只有一处声明它的地方（`body`）。
 * 字号必须显式给：不写的话 SVG 文字按浏览器默认的 16px 排。 */
.chart-axis text {
    fill: var(--muted);
    font-size: var(--fs-mini);
}
.chart-dates text {
    letter-spacing: 0.02em;
}
.chart-line {
    fill: none;
    stroke: var(--chart-line);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
}
/* 圆点是**真空心**：`fill: none`，颜色只落在那圈描边上。
 *
 * 这里曾经写 `fill: var(--paper)`，本意是「挖空」，实际画出来是个**比图底更亮**的实心圆盘
 * （`--paper` 比 `.well` 的 `--well` 亮一档），而且每个点都把穿过的折线咬掉一个缺口。
 * `fill: none` 之后折线从圈里穿过去，才是「线上的标记」。
 *
 * 不灌朱的理由与线色同一条：「灌朱的面」在这套语言里只表示主操作 / 选中，
 * 图上的点没有主次；一旦灌成实心，涨跌两色就要各配一档填充色，线与点立刻变成两套配色。 */
.chart-dot {
    fill: none;
    stroke: var(--chart-line);
    stroke-width: 1.4;
}
/* 最新那一点：圈更大、线更粗，但仍不填色——它是「现在」，不是「选中」。 */
.chart-dot.latest {
    stroke-width: 2;
}
/* 截断说明贴在槽底的右下角：它是脚注，不参与图的排版，也不该把图往下推。 */
.chart-more {
    margin: 0;
    padding: 0 8px 5px;
    text-align: right;
}
</style>
