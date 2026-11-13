<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { shortDate } from '../../services/format';
import {
    buildTrendChart,
    trendDash,
    trendValueText,
    type TrendKind,
    type TrendSeries,
} from './trend-chart';

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
    { height: 192 },
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

/* 图例与曲线共用系列、样式序号和末日值，过滤无效系列时不会错位。 */
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

const lastDay = computed(() => props.labels[props.labels.length - 1] ?? '');
const emptyText = computed(() => '暂无' + props.label + '记录');
</script>

<template>
    <div ref="host" class="trend">
        <div class="chart" :style="{ '--trend-height': height + 'px' }">
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
                        :class="{ zero: guide.zero }"
                        :x1="chart.plot.left"
                        :x2="chart.plot.left + chart.plot.width"
                        :y1="guide.y"
                        :y2="guide.y"
                    />
                </g>

                <line
                    class="chart-latest"
                    :x1="chart.lines[0].last.x"
                    :x2="chart.lines[0].last.x"
                    :y1="chart.plot.top"
                    :y2="chart.plot.top + chart.plot.height"
                    aria-hidden="true"
                />

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
                    :style="{ stroke: `var(--series-${(line.index % 6) + 1})` }"
                    :d="line.path"
                    :stroke-dasharray="trendDash(line.index)"
                />

                <!-- 每条线的末端一个空心圈：它是「今天」。只有一个点时也靠它把线看见。 -->
                <circle
                    v-for="line in chart.lines"
                    :key="`dot-${line.id}`"
                    class="chart-dot"
                    :style="{ stroke: `var(--series-${(line.index % 6) + 1})` }"
                    :cx="line.last.x"
                    :cy="line.last.y"
                    r="3"
                />

                <g class="chart-axis chart-dates" aria-hidden="true">
                    <text
                        v-for="tick in chart.ticks"
                        :key="`x-${tick.x}`"
                        :x="tick.x"
                        :y="chart.height - 9"
                        :text-anchor="tick.anchor"
                        v-text="tick.text"
                    />
                </g>
            </svg>

            <p v-else class="trend-empty">{{ emptyText }}</p>
        </div>

        <div v-if="legend.length" class="trend-legend" :aria-label="lastDay + ' 各角色读数'">
            <span class="legend-date">{{ shortDate(lastDay) }}</span>
            <span v-for="one in legend" :key="one.id" class="legend-item">
                <svg class="swatch" viewBox="0 0 24 4" aria-hidden="true">
                    <line
                        x1="0"
                        y1="2"
                        x2="24"
                        y2="2"
                        :stroke="'var(--series-' + ((one.index % 6) + 1) + ')'"
                        :stroke-dasharray="trendDash(one.index)"
                    />
                </svg>
                <span class="legend-name">{{ one.name }}</span>
                <span class="legend-value">{{ trendValueText(one.lastValue, kind) }}</span>
            </span>
        </div>
    </div>
</template>

<style scoped>
/* 角色色保留区别，首色随主题；两张图使用同一角色序号。 */
.trend {
    --series-1: var(--accent);
    --series-2: var(--ochre);
    --series-3: var(--indigo-ink);
    --series-4: var(--moss);
    --series-5: color-mix(in oklch, var(--cinnabar) 55%, var(--indigo-ink));
    --series-6: color-mix(in oklch, var(--moss) 45%, var(--indigo-ink));

    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}

.chart {
    width: 100%;
    min-width: 0;
    min-height: var(--trend-height);
    border-radius: var(--r-3);
    background: color-mix(in srgb, var(--paper) 82%, var(--well));
    box-shadow: inset 0 0 0 var(--w-hair) var(--rule);
}
.chart-svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: hidden;
}
.chart-guides line {
    stroke: var(--rule);
    stroke-width: 1;
    stroke-dasharray: 2 5;
}
.chart-guides line.zero {
    stroke: var(--rule-2);
    stroke-dasharray: none;
}
.chart-latest {
    stroke: var(--rule);
    stroke-width: 1;
    stroke-dasharray: 2 5;
}
.chart-axis text {
    fill: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.chart-dates text:last-child {
    fill: var(--ink-2);
}
.chart-line {
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
}
.chart-dot {
    fill: none;
    stroke-width: 1.8;
}

.trend-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    padding: 0 2px;
    font-size: var(--fs-mini);
}
.legend-date {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--ink-2);
}
.swatch {
    flex: none;
    width: 20px;
    height: 4px;
    stroke-width: 2;
}
.legend-name {
    overflow-wrap: anywhere;
}
.legend-value {
    color: var(--num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.trend-empty {
    display: grid;
    place-items: center;
    min-height: var(--trend-height);
    margin: 0;
    padding: 20px;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
