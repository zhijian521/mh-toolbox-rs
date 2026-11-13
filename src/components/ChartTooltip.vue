<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { chartTooltipPosition } from './chart-tooltip';

/** 鼠标明细跟随指针，键盘查看使用稳定锚点；长列表可聚焦滚动。 */
const props = defineProps<{
    title: string;
    rows: { label: string; value: string; color: string; detail?: boolean }[];
    anchor: { x: number; y: number } | null;
}>();
const element = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });
const bounds = ref({ width: 0, height: 0 });
let observer: ResizeObserver | null = null;
onMounted(() => {
    const el = element.value;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => {
        size.value = { width: el.offsetWidth, height: el.offsetHeight };
        bounds.value = { width: parent.clientWidth, height: parent.clientHeight };
    };
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(parent);
});
onBeforeUnmount(() => observer?.disconnect());
const position = computed(() => {
    const point = props.anchor ?? { x: bounds.value.width - 8, y: 8 };
    const pos = chartTooltipPosition(point, size.value, bounds.value);
    return {
        left: pos.left + 'px',
        top: pos.top + 'px',
        visibility: size.value.width ? ('visible' as const) : ('hidden' as const),
    };
});
</script>

<template>
    <div ref="element" class="chart-tooltip" :style="position" role="tooltip" tabindex="0">
        <div class="tooltip-heading">{{ title }}</div>
        <div
            v-for="(row, index) in rows"
            :key="index"
            class="tooltip-row"
            :class="{ detail: row.detail }"
        >
            <i :style="{ background: row.color }" aria-hidden="true" />
            <span>{{ row.label }}</span>
            <b>{{ row.value }}</b>
        </div>
    </div>
</template>

<style scoped>
.chart-tooltip {
    position: absolute;
    z-index: 2;
    width: max-content;
    max-width: min(320px, calc(100% - 16px));
    max-height: calc(100% - 20px);
    overflow: auto;
    overscroll-behavior: contain;
    padding: 10px 12px;
    border-radius: var(--r-3);
    background: var(--tooltip-bg);
    color: var(--tooltip-ink);
    box-shadow: var(--tooltip-shadow);
    font-size: var(--fs-xs);
    line-height: 1.5;
}
.tooltip-heading {
    padding-bottom: 6px;
    margin-bottom: 4px;
    border-bottom: var(--w-hair) solid color-mix(in srgb, currentColor 18%, transparent);
    overflow-wrap: anywhere;
}
.tooltip-row {
    display: grid;
    grid-template-columns: 7px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
}
.tooltip-row i {
    width: 7px;
    height: 7px;
    border-radius: var(--r-1);
}
.tooltip-row span {
    overflow-wrap: anywhere;
}
.tooltip-row b {
    font-weight: 400;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.tooltip-row.detail {
    padding-left: 12px;
    font-size: var(--fs-mini);
}
</style>
