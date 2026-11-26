<script setup lang="ts">
import { useChartHover } from '../composables/use-chart-hover';
import { computed, ref, useId } from 'vue';
import ChartTooltip from './ChartTooltip.vue';
import ChartPanel from './ChartPanel.vue';
import { integerAxis } from './chart-axis';
import { CHART_AXIS_GAP, CHART_HEIGHT, CHART_INSET, chartColor } from './chart-style';

const props = defineProps<{
    rows: {
        id: string;
        name: string;
        values: number[];
        segments?: { name: string; amount: number; color: string }[][];
    }[];
    series: { name: string; color: string }[];
    valueText: (value: number) => string;
    axisUnit: number;
    label: string;
    legend?: { name: string; color: string }[];
    fit?: boolean;
}>();
const tooltipId = useId();
const host = ref<HTMLElement | null>(null);
const {
    active: hoveredId,
    point: hoverPoint,
    locate,
    leaveFocus,
} = useChartHover<string>(() => host.value);
function showRow(id: string, event: PointerEvent | FocusEvent) {
    hoveredId.value = id;
    locate(event);
}
function dismissTooltip(event: KeyboardEvent) {
    if (hovered.value) event.stopPropagation();
    hoveredId.value = null;
}
const hovered = computed(() => {
    const index = props.rows.findIndex((row) => row.id === hoveredId.value);
    if (index < 0) return null;
    const row = props.rows[index];
    return {
        title: row.name,
        rows: props.series.flatMap((one, seriesIndex) => [
            {
                label: one.name,
                value: props.valueText(row.values[seriesIndex] ?? 0),
                color: chartColor(one.color),
            },
            ...(row.segments?.[seriesIndex] ?? []).map((part) => ({
                label: one.name + ' · ' + part.name,
                value: props.valueText(part.amount),
                color: chartColor(part.color),
                detail: true,
            })),
        ]),
    };
});
const axis = computed(() =>
    integerAxis(
        props.rows.flatMap((one) => one.values),
        props.axisUnit,
    ),
);
const maximum = computed(() => axis.value.max);
const ticks = computed(() => axis.value.ticks);
const legendItems = computed(() =>
    (props.legend ?? props.series).map((item) => ({
        id: item.name,
        name: item.name,
        color: chartColor(item.color),
    })),
);
const description = (row: (typeof props.rows)[number]) =>
    row.name +
    '：' +
    props.series
        .map(
            (one, index) =>
                one.name +
                ' ' +
                props.valueText(row.values[index] ?? 0) +
                (row.segments?.[index]?.length
                    ? '（' +
                      row.segments[index]
                          .map((part) => part.name + ' ' + props.valueText(part.amount))
                          .join('，') +
                      '）'
                    : ''),
        )
        .join('，');
</script>

<template>
    <ChartPanel
        class="bar-chart"
        :legend="legendItems"
        :legend-label="label + '图例'"
        :class="{ fit, stacked: !!legend }"
        :style="{
            '--chart-height': CHART_HEIGHT + 'px',
            '--chart-inset': CHART_INSET + 'px',
            '--chart-axis-gap': CHART_AXIS_GAP + 'px',
        }"
    >
        <div
            v-if="rows.length"
            ref="host"
            class="bar-frame chart-surface"
            @pointerleave="hoveredId = null"
            @focusout="leaveFocus"
            @keydown.esc="dismissTooltip"
        >
            <div class="bar-axis" aria-hidden="true">
                <span v-for="tick in ticks" :key="tick">{{ valueText(tick) }}</span>
            </div>
            <div
                class="columns-scroll chart-scroll"
                tabindex="0"
                role="region"
                :aria-label="label + '柱状图'"
            >
                <div class="columns-plot">
                    <div class="column-guides" aria-hidden="true">
                        <span v-for="(_, index) in ticks" :key="index" />
                    </div>
                    <div
                        v-for="row in rows"
                        :key="row.id"
                        :class="{ paired: series.length > 1, hovered: hoveredId === row.id }"
                        class="column-group"
                        role="img"
                        :aria-label="description(row)"
                        :aria-describedby="hoveredId === row.id ? tooltipId : undefined"
                        tabindex="0"
                        @pointermove="showRow(row.id, $event)"
                        @focus="showRow(row.id, $event)"
                    >
                        <div class="column-stage" aria-hidden="true">
                            <div
                                v-for="(one, index) in series"
                                :key="one.name"
                                class="column"
                                :class="{
                                    'chart-bar-face': !row.segments,
                                    'has-value': (row.values[index] ?? 0) > 0,
                                }"
                                :style="{
                                    height: ((row.values[index] ?? 0) / maximum) * 100 + '%',
                                    '--chart-color': chartColor(one.color),
                                }"
                            >
                                <span
                                    v-for="(part, partIndex) in row.segments?.[index]"
                                    :key="part.name"
                                    class="column-segment chart-bar-face"
                                    :class="{
                                        'segment-top':
                                            partIndex === (row.segments?.[index]?.length ?? 0) - 1,
                                    }"
                                    :style="{
                                        height:
                                            (part.amount / (row.values[index] || 1)) * 100 + '%',
                                        '--chart-color': chartColor(part.color),
                                    }"
                                />
                                <small v-if="row.segments" class="column-kind">{{
                                    one.name
                                }}</small>
                                <span class="column-value">{{
                                    valueText(row.values[index] ?? 0)
                                }}</span>
                            </div>
                        </div>
                        <span class="column-label" aria-hidden="true">{{ row.name }}</span>
                    </div>
                </div>
            </div>
            <ChartTooltip
                v-if="hovered"
                :id="tooltipId"
                :title="hovered.title"
                :rows="hovered.rows"
                :anchor="hoverPoint"
            />
        </div>
        <p v-else class="chart-blank">这个范围还没有记录</p>
    </ChartPanel>
</template>

<style scoped>
.bar-chart {
    --column-label-h: 36px;
}
.bar-frame {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: var(--chart-height);
    gap: var(--chart-axis-gap);
    padding: var(--chart-inset);
}
.bar-axis {
    display: grid;
    grid-auto-rows: 0;
    align-content: space-between;
    align-items: center;
    justify-items: end;
    height: calc(100% - 18px - var(--column-label-h));
    margin-top: 18px;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.bar-axis > span {
    line-height: 1;
}
.columns-scroll {
    min-height: 0;
}
.columns-plot {
    position: relative;
    display: flex;
    min-width: 100%;
    width: max-content;
    height: 100%;
    padding: 18px 6px 0;
}
.column-guides {
    position: absolute;
    top: 18px;
    right: 0;
    bottom: var(--column-label-h);
    left: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
}
.column-guides > span {
    border-top: var(--w-hair) dashed var(--rule);
}
.column-guides > span:last-child {
    border-top-style: solid;
    border-color: var(--rule-2);
}
.column-group {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 0 100px;
    min-width: 100px;
    padding: 0 10px;
}
.column-group.paired {
    flex-basis: 132px;
    min-width: 132px;
}
.column-stage {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: flex-end;
    justify-content: center;
    gap: 22px;
}
.column {
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    flex: 0 1 22px;
    min-width: 10px;
    max-width: 26px;
}
.column.chart-bar-face.has-value,
.column-segment {
    background: var(--chart-front);
    box-shadow: var(--chart-bar-shadow);
}
.column.chart-bar-face.has-value::before,
.column-segment.segment-top::before {
    content: '';
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: var(--chart-depth);
    transform: skewX(-45deg);
    transform-origin: bottom;
    background: var(--chart-top);
    box-shadow: inset 0 1px 0 var(--bevel-hi);
}
.column.chart-bar-face.has-value::after,
.column-segment::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 100%;
    width: var(--chart-depth);
    transform: skewY(-45deg);
    transform-origin: left;
    background: var(--chart-side);
}
.column:not(.has-value)::before,
.column:not(.has-value)::after {
    display: none;
}
.column-value {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    color: var(--ink-2);
    font-size: var(--fs-mini);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.column-group.hovered .column-stage {
    border-radius: 4px;
    background: var(--chart-hover-fill);
}
.column-label {
    display: block;
    flex: none;
    align-self: center;
    width: 100%;
    overflow: hidden;
    max-width: 150px;
    height: var(--column-label-h);
    padding-top: 10px;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.chart-blank {
    display: grid;
    place-items: center;
    min-height: var(--chart-height);
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.column-segment {
    position: relative;
    display: block;
    flex: none;
    width: 100%;
}
.column-kind {
    position: absolute;
    top: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    color: var(--muted);
    font-size: var(--fs-mini);
    white-space: nowrap;
}
.bar-chart.stacked {
    --column-label-h: 52px;
}
.stacked .column-label {
    padding-top: 26px;
}
.fit .column-group {
    padding: 0 6px;
}
.fit .column-stage {
    gap: clamp(10px, 2vw, 26px);
}
.fit .column-label {
    max-width: none;
}
</style>
