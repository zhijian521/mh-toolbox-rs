<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import ChartTooltip from '../../components/ChartTooltip.vue';
import { integerAxis } from '../../components/chart-axis';
import { chartColor } from '../../components/chart-style';
import { type Currency } from './accounts';
import { accountAxisText, accountValueText } from './account-analysis';

const props = defineProps<{
    rows: {
        id: string;
        name: string;
        values: number[];
        segments?: { name: string; amount: number; color: string }[][];
    }[];
    series: { name: string; color: string }[];
    currency: Currency;
    label: string;
    legend?: { name: string; color: string }[];
    fit?: boolean;
}>();
const tooltipId = useId();
const hoveredId = ref<string | null>(null);
const host = ref<HTMLElement | null>(null);
const hoverPoint = ref<{ x: number; y: number } | null>(null);
function showRow(id: string, event: PointerEvent | FocusEvent) {
    hoveredId.value = id;
    if (!(event instanceof PointerEvent)) {
        hoverPoint.value = null;
        return;
    }
    const box = host.value!.getBoundingClientRect();
    hoverPoint.value = { x: event.clientX - box.left, y: event.clientY - box.top };
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
                value: accountValueText(row.values[seriesIndex] ?? 0, props.currency),
                color: chartColor(one.color),
            },
            ...(row.segments?.[seriesIndex] ?? []).map((part) => ({
                label: one.name + ' · ' + part.name,
                value: accountValueText(part.amount, props.currency),
                color: chartColor(part.color),
                detail: true,
            })),
        ]),
    };
});
function leaveFocus(event: FocusEvent) {
    if (
        !(event.relatedTarget instanceof Node) ||
        !(event.currentTarget as HTMLElement).contains(event.relatedTarget)
    )
        hoveredId.value = null;
}
const axis = computed(() =>
    integerAxis(
        props.rows.flatMap((one) => one.values),
        props.currency === 'cash' ? 10000 : 1,
    ),
);
const maximum = computed(() => axis.value.max);
const ticks = computed(() => axis.value.ticks);
const description = (row: (typeof props.rows)[number]) =>
    row.name +
    '：' +
    props.series
        .map(
            (one, index) =>
                one.name +
                ' ' +
                accountValueText(row.values[index] ?? 0, props.currency) +
                (row.segments?.[index]?.length
                    ? '（' +
                      row.segments[index]
                          .map(
                              (part) =>
                                  part.name + ' ' + accountValueText(part.amount, props.currency),
                          )
                          .join('，') +
                      '）'
                    : ''),
        )
        .join('，');
</script>

<template>
    <div
        ref="host"
        class="bar-chart chart-panel"
        :class="{ fit, stacked: !!legend }"
        @pointerleave="hoveredId = null"
        @focusout="leaveFocus"
        @keydown.esc.stop="hoveredId = null"
    >
        <div v-if="rows.length" class="bar-frame chart-surface">
            <div class="bar-axis" aria-hidden="true">
                <span
                    v-for="(tick, index) in ticks"
                    :key="index"
                    :style="{ top: (index / (ticks.length - 1)) * 100 + '%' }"
                    >{{ accountAxisText(tick, currency) }}</span
                >
            </div>
            <div class="columns-scroll" tabindex="0" role="region" :aria-label="label + '柱状图'">
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
                                    accountAxisText(row.values[index] ?? 0, currency)
                                }}</span>
                            </div>
                        </div>
                        <span class="column-label" aria-hidden="true">{{ row.name }}</span>
                    </div>
                </div>
            </div>
        </div>
        <p v-else class="chart-blank">这个范围还没有记录</p>
        <div class="bar-legend chart-legend-shelf" aria-hidden="true">
            <span v-for="one in legend ?? series" :key="one.name"
                ><i :style="{ background: chartColor(one.color) }" />{{ one.name }}</span
            >
        </div>
        <ChartTooltip
            v-if="hovered"
            :id="tooltipId"
            :title="hovered.title"
            :rows="hovered.rows"
            :anchor="hoverPoint"
        />
    </div>
</template>

<style scoped>
.bar-chart {
    position: relative;
    min-width: 0;
    margin-bottom: 5px;
}
.bar-legend {
    flex-wrap: wrap;
    display: flex;
    justify-content: flex-start;
    gap: 16px;
    color: var(--ink-2);
    font-size: var(--fs-xs);
}
.bar-legend > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.bar-legend i {
    width: 7px;
    height: 7px;
    border-radius: var(--r-1);
}
.bar-frame {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px;
    padding: 10px 10px 4px;
}
.bar-axis {
    position: relative;
    min-width: 58px;
    height: 176px;
    margin-top: 18px;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.bar-axis > span {
    position: absolute;
    right: 0;
    line-height: 1;
    transform: translateY(-50%);
}
.columns-scroll {
    min-width: 0;
    overflow-x: auto;
}
.columns-plot {
    position: relative;
    display: flex;
    min-width: 100%;
    width: max-content;
    padding: 18px 6px 0;
}
.column-guides {
    position: absolute;
    top: 18px;
    right: 0;
    bottom: 36px;
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
    flex: 1 0 100px;
    min-width: 100px;
    max-width: 180px;
    padding: 0 10px;
}
.column-group.paired {
    flex-basis: 132px;
    min-width: 132px;
}
.column-stage {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 22px;
    height: 176px;
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
.column-group.hovered .column,
.column-group:focus-visible .column {
    outline: var(--w-hair) solid color-mix(in srgb, var(--ink) 18%, transparent);
}
.column-label {
    display: block;
    overflow: hidden;
    max-width: 150px;
    height: 36px;
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
    min-height: 230px;
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
.stacked .column-label {
    padding-top: 26px;
    height: 52px;
}
.stacked .column-guides {
    bottom: 52px;
}
.fit .columns-scroll {
    overflow-x: hidden;
}
.fit .columns-plot {
    width: 100%;
}
.fit .column-group {
    min-width: 0;
    max-width: none;
    flex: 1 1 0;
    padding: 0 6px;
}
.fit .column-stage {
    gap: clamp(10px, 2vw, 26px);
}
.fit .column-label {
    max-width: none;
}
</style>
