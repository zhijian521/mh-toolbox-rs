<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { buildTrendChart, trendValueText, type TrendKind, type TrendSeries } from './trend-chart';

/**
 * 每日趋势线（内联 SVG，不引图表库）。
 *
 * 与 `prices/PriceChart.vue` 同一条分工：组件只管**什么时候重算**（量容器宽度、
 * 订阅尺寸变化），坐标与路径全在 `./trend-chart`。
 *
 * ---- 为什么线色写在样式表里而不是算出来 ----
 * 每个角色一条线，颜色按序号取 `--series-N`。这是一套**只在图里出现**的色，
 * 它不表达语义（不是「支出朱 / 达成苔」），所以不能借用 `--cinnabar` 那一族
 * 在别处的意思——于是这里另起六枚 `--series-`，值仍从令牌混出来（见 `.trend` 的注释），
 * 不新造色号族。
 *
 * ---- 为什么图例是必须的 ----
 * 价格图只有一条线，颜色本身就在说涨跌；这里三五个号各一条线，没有图例时
 * 读者只能猜哪条是自己。图例放在图**外面**（图内放不下，且会压掉最上面那条线）。
 */
const props = withDefaults(
    defineProps<{
        /** 横轴日期，旧的在前、今天在最后。 */
        labels: string[];
        series: TrendSeries[];
        kind: TrendKind;
        /** 读屏与空态里说的「这张图画的是什么」，比如「每日在线时长」。 */
        label: string;
        height?: number;
    }>(),
    { height: 168 },
);

const host = ref<HTMLDivElement | null>(null);
/* 量到之前先给一个假宽度：`buildTrendChart` 会把它抬到 160 下限，
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
    buildTrendChart({
        width: width.value,
        height: props.height,
        labels: props.labels,
        series: props.series,
        kind: props.kind,
    }),
);

/* 图例直接从画出来的线取：`buildTrendChart` 会滤掉长度对不上的系列，
 * 那时候颜色序号也跟着重排，两边各算一份就会「图例第三枚、图上第二色」。 */
const legend = computed(() => chart.value.lines);

/**
 * 给读屏的一句话。
 *
 * 折线对看不见的人是零信息，所以把「哪几个号、最近一天各是多少」写成一句话挂上去
 * ——与 `PriceChart`、`MapCanvas` 同一条：图形必须有一句等价的话。
 */
const summary = computed(() => {
    const lines = props.series.filter((one) => one.values.length);
    if (!lines.length) return `${props.label}：还没有数据`;
    const tail = props.labels[props.labels.length - 1] ?? '';
    const parts = lines.map(
        (one) => `${one.name} ${trendValueText(one.values[one.values.length - 1], props.kind)}`,
    );
    return `${props.label}：${tail} 各号分别为 ${parts.join('、')}`;
});

const emptyText = computed(() => `这几天的${props.label}还是空的`);
</script>

<template>
    <div ref="host" class="trend">
        <!-- 图例：每个号一枚色点 + 名字。三个以内的号一行放得下，再多就换行（`flex-wrap`），
             不截断——名字截了就没法把线和人对应起来。 -->
        <div v-if="legend.length > 1" class="trend-legend">
            <span v-for="one in legend" :key="one.id" class="legend-item">
                <span class="swatch" :style="{ background: `var(--series-${one.index + 1})` }" />
                <span class="legend-name">{{ one.name }}</span>
            </span>
        </div>

        <div class="chart well">
            <svg
                v-if="!chart.empty"
                class="chart-svg"
                :viewBox="`0 0 ${chart.width} ${chart.height}`"
                :width="chart.width"
                :height="chart.height"
                role="img"
                :aria-label="summary"
            >
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

                <!-- 纵轴读数走 `v-text` 不写插值：多行属性让 Prettier 把 `{{ }}` 挪到单独一行，
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

                <path
                    v-for="line in chart.lines"
                    :key="line.id"
                    class="chart-line"
                    :style="{ stroke: `var(--series-${line.index + 1})` }"
                    :d="line.path"
                />

                <!-- 每条线的末端一个空心圈：它是「今天」。只有一个点时也靠它把线看见。 -->
                <circle
                    v-for="line in chart.lines"
                    :key="`dot-${line.id}`"
                    class="chart-dot"
                    :style="{ stroke: `var(--series-${line.index + 1})` }"
                    :cx="line.last.x"
                    :cy="line.last.y"
                    r="3.2"
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

            <p v-else class="trend-empty">{{ emptyText }}</p>
        </div>
    </div>
</template>

<style scoped>
/* 六枚线色。**不是语义色**，只在这张图里用：从令牌里混出来，不新造色号。
 * 前四枚直接取现成的朱 / 赭 / 苔 / 靛，后两枚是它们的中间色——
 * 相邻两条线在明度上要拉开，纯靠色相区分在暗色主题下会挤到一起。 */
.trend {
    --series-1: var(--cinnabar);
    --series-2: var(--ochre);
    --series-3: var(--moss);
    --series-4: var(--indigo-ink);
    --series-5: color-mix(in srgb, var(--cinnabar) 55%, var(--ochre));
    --series-6: color-mix(in srgb, var(--indigo-ink) 45%, var(--moss));

    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.trend-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    padding: 0 2px;
}

.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    font-size: var(--fs-mini);
    color: var(--ink-2);
}

/* 色点：6px 的方点（不用圆）——圆点在这套语言里是「图上的标记」，图例是标签。 */
.swatch {
    flex: none;
    width: 8px;
    height: 2px;
    border-radius: 1px;
}

.legend-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chart {
    width: 100%;
    min-width: 0;
    border-radius: var(--r-2);
    /* 凹槽的顶壁渐变按元素高度的 62% 解析，168 高的图上那是一大片灰；
     * 压到 18px 与 `PriceChart` 处理同一个问题的手法一致。 */
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 18px);
}

.chart-svg {
    display: block;
    width: 100%;
    height: auto;
    /* 图上的字与点都在留白里，不让它溢出槽沿：让内容出槽只会读成「图画出去了」。 */
    overflow: hidden;
}

.chart-guides line {
    stroke: var(--rule);
    stroke-width: 1;
}

/* 字号必须显式给：不写的话 SVG 文字按浏览器默认的 16px 排。 */
.chart-axis text {
    fill: var(--muted);
    font-size: var(--fs-mini);
}

.chart-dates text {
    letter-spacing: 0.02em;
}

.chart-line {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
}

/* 圆点是**真空心**：填色会把穿过的线咬掉一个缺口，而实心圆盘在凹槽底上
 * 比图底更亮，看着像贴上去的贴纸（`PriceChart` 里踩过这一条）。 */
.chart-dot {
    fill: none;
    stroke-width: 1.6;
}

.trend-empty {
    margin: 0;
    padding: 26px 10px 28px;
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
}
</style>
