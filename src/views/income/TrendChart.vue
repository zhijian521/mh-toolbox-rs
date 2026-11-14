<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import ChartColumn from '../../components/ChartColumn.vue';
import ChartTooltip from '../../components/ChartTooltip.vue';
import { chartColor } from '../../components/chart-style';
import { shortDate } from '../../services/format';
import {
    buildTrendChart,
    trendIndexAt,
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
        valueText?: (value: number) => string;
        axisText?: (value: number) => string;
        axisUnit?: number;
        dateText?: (label: string) => string;
        colors?: string[];
    }>(),
    { height: 192 },
);

const formatValue = (value: number) =>
    props.valueText?.(value) ?? trendValueText(value, props.kind);
const formatDate = (label: string) => props.dateText?.(label) ?? shortDate(label);
const seriesColor = (index: number) =>
    chartColor(props.colors?.[index] ?? 'var(--series-' + ((index % 6) + 1) + ')');

const host = ref<HTMLDivElement | null>(null);
const scrollHost = ref<HTMLDivElement | null>(null);
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
        width: Math.max(
            width.value,
            props.labels.length *
                Math.max(
                    22,
                    props.series.filter((one) => one.values.length === props.labels.length).length *
                        14 +
                        10,
                ) +
                100,
        ),
        height: props.height,
        labels: props.labels,
        series: props.series,
        kind: props.kind,
        valueText: props.axisText,
        axisUnit: props.axisUnit,
        dateText: formatDate,
    }),
);

/* 柱组与图例共用系列顺序及末日值，过滤无效系列后仍保留角色颜色序号。 */
const legend = computed(() => chart.value.lines);

watch(
    () => chart.value.width,
    async () => {
        await nextTick();
        const viewport = scrollHost.value;
        if (viewport) viewport.scrollLeft = viewport.scrollWidth;
    },
    { immediate: true },
);

/** 读屏提供与图形等价的末日各系列读数。 */
const summary = computed(() => {
    const lines = props.series.filter((one) => one.values.length);
    if (!lines.length) return `${props.label}：还没有数据`;
    const tail = props.labels[props.labels.length - 1] ?? '';
    const parts = lines.map(
        (one) => `${one.name} ${formatValue(one.values[one.values.length - 1])}`,
    );
    return `${props.label}：${tail} 分别为 ${parts.join('、')}`;
});

const tooltipId = useId();
const hoverIndex = ref<number | null>(null);
const hoverPoint = ref<{ x: number; y: number } | null>(null);
const hovered = computed(() => {
    const index = hoverIndex.value;
    if (index === null || chart.value.empty || index >= props.labels.length) return null;
    return {
        index,
        title: props.labels[index],
        x: chart.value.lines[0].points[index].x,
        rows: chart.value.lines.map((line) => ({
            label: line.name,
            value: formatValue(line.points[index].value),
            color: seriesColor(line.index),
        })),
    };
});
watch(
    () => [props.labels, props.series],
    () => {
        hoverIndex.value = null;
    },
);
function move(event: PointerEvent) {
    if ((event.target as Element).closest('.chart-tooltip')) return;
    const svg = host.value?.querySelector('svg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) * chart.value.width) / box.width;
    const y = ((event.clientY - box.top) * chart.value.height) / box.height;
    const plot = chart.value.plot;
    const next =
        y < plot.top || y > plot.top + plot.height
            ? null
            : trendIndexAt(plot, props.labels.length, x);
    const hostBox = host.value!.getBoundingClientRect();
    hoverPoint.value = { x: event.clientX - hostBox.left, y: event.clientY - hostBox.top };
    hoverIndex.value = next;
}
function reveal(index: number) {
    const viewport = scrollHost.value;
    const x = chart.value.lines[0]?.points[index]?.x;
    if (!viewport || x === undefined) return;
    if (
        x < viewport.scrollLeft + chart.value.plot.left ||
        x > viewport.scrollLeft + viewport.clientWidth - 18
    )
        viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 2);
}
function focusChart() {
    hoverIndex.value = props.labels.length - 1;
    hoverPoint.value = null;
    reveal(hoverIndex.value);
}
function navigate(event: KeyboardEvent) {
    if ((event.target as Element).closest('.chart-tooltip') && event.key !== 'Escape') return;
    if (event.key === 'Escape') {
        hoverIndex.value = null;
        event.stopPropagation();
        return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || chart.value.empty)
        return;
    event.preventDefault();
    hoverPoint.value = null;
    const last = props.labels.length - 1;
    hoverIndex.value =
        event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : Math.max(
                    0,
                    Math.min(
                        last,
                        (hoverIndex.value ?? last) + (event.key === 'ArrowLeft' ? -1 : 1),
                    ),
                );
    reveal(hoverIndex.value);
}
function leaveFocus(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !host.value?.contains(event.relatedTarget))
        hoverIndex.value = null;
}

const lastDay = computed(() => props.labels[props.labels.length - 1] ?? '');
const emptyText = computed(() => '暂无' + props.label + '记录');
</script>

<template>
    <div class="trend chart-panel">
        <div
            ref="host"
            class="chart chart-surface"
            :style="{ '--trend-height': height + 'px' }"
            @pointermove="move"
            @pointerleave="hoverIndex = null"
            @keydown="navigate"
            @focusout="leaveFocus"
        >
            <div ref="scrollHost" class="chart-scroll" @scroll="hoverPoint = null">
                <svg
                    v-if="!chart.empty"
                    class="chart-svg"
                    :viewBox="`0 0 ${chart.width} ${chart.height}`"
                    :width="chart.width"
                    :height="chart.height"
                    :style="{ width: chart.width + 'px' }"
                    role="img"
                    :aria-label="summary"
                    :aria-describedby="hovered ? tooltipId : undefined"
                    tabindex="0"
                    @focus="focusChart"
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
                    <g
                        v-for="line in chart.lines"
                        :key="line.id"
                        class="chart-series"
                        :style="{ '--chart-color': seriesColor(line.index) }"
                        aria-hidden="true"
                    >
                        <ChartColumn
                            v-for="(point, index) in line.points"
                            :key="index"
                            :column="point.column"
                            :pattern="Math.floor(line.index / 6)"
                        />
                    </g>

                    <g v-if="hovered" class="chart-hover-mark" aria-hidden="true">
                        <line
                            :x1="hovered.x"
                            :x2="hovered.x"
                            :y1="chart.plot.top"
                            :y2="chart.plot.top + chart.plot.height"
                        />
                        <rect
                            v-for="line in chart.lines"
                            :key="line.id"
                            :x="line.points[hovered.index].column.x - 2"
                            :y="line.points[hovered.index].column.y - 2"
                            :width="
                                line.points[hovered.index].column.width +
                                line.points[hovered.index].column.depth +
                                4
                            "
                            :height="
                                line.points[hovered.index].column.height +
                                line.points[hovered.index].column.depth +
                                4
                            "
                            :style="{ stroke: seriesColor(line.index) }"
                        />
                    </g>

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
            </div>

            <svg
                v-if="!chart.empty"
                class="chart-fixed-axis"
                :width="chart.plot.left"
                :height="chart.height"
                aria-hidden="true"
            >
                <g class="chart-axis">
                    <text
                        v-for="(guide, index) in chart.guides"
                        :key="index"
                        :x="chart.plot.left - 8"
                        :y="guide.y + 3"
                        text-anchor="end"
                        v-text="guide.label"
                    />
                </g>
            </svg>
            <p v-if="chart.empty" class="trend-empty">{{ emptyText }}</p>
            <ChartTooltip
                v-if="hovered"
                :id="tooltipId"
                :title="hovered.title"
                :rows="hovered.rows"
                :anchor="hoverPoint"
            />
        </div>

        <div
            v-if="legend.length"
            class="trend-legend chart-legend-shelf"
            :aria-label="lastDay + ' 读数'"
        >
            <span class="legend-date">{{ formatDate(lastDay) }}</span>
            <span v-for="one in legend" :key="one.id" class="legend-item">
                <i
                    class="swatch"
                    :class="{ patterned: one.index >= 6 }"
                    :style="{
                        backgroundColor: seriesColor(one.index),
                        '--swatch-step': 4 + Math.floor(one.index / 6) * 2 + 'px',
                    }"
                    aria-hidden="true"
                />
                <span class="legend-name">{{ one.name }}</span>
                <span class="legend-value">{{ formatValue(one.lastValue) }}</span>
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
    gap: 0;
    min-width: 0;
    margin-bottom: 5px;
}

.chart {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: var(--trend-height);
}
.chart-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-gutter: stable;
}
.chart-svg {
    display: block;
    max-width: none;
    min-width: 100%;
    height: auto;
    overflow: hidden;
}
.chart-fixed-axis {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: var(--r-2) 0 0 var(--r-2);
    background: var(--chart-surface-bg);
    pointer-events: none;
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
.chart-hover-mark {
    pointer-events: none;
}
.chart-hover-mark line {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 4;
}
.chart-hover-mark rect {
    fill: none;
    stroke-width: 1;
}
.trend-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
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
    width: 9px;
    height: 9px;
    border-radius: 1px;
}
.swatch.patterned {
    background-image: repeating-linear-gradient(
        35deg,
        transparent 0 calc(var(--swatch-step) - 1px),
        var(--bevel-hi) calc(var(--swatch-step) - 1px) var(--swatch-step)
    );
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
