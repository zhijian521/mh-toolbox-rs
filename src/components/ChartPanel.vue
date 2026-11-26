<script setup lang="ts">
defineProps<{
    legend: { id: string; name: string; color: string; value?: string; pattern?: number }[];
    caption?: string;
    legendLabel?: string;
}>();
</script>

<template>
    <div class="chart-panel">
        <slot />
        <div v-if="legend.length" class="chart-legend-shelf" :aria-label="legendLabel" role="group">
            <span v-if="caption" class="legend-date">{{ caption }}</span>
            <span v-for="item in legend" :key="item.id" class="legend-item">
                <i
                    class="swatch"
                    :class="{ patterned: item.pattern }"
                    :style="{
                        backgroundColor: item.color,
                        '--swatch-step': item.pattern ? 4 + item.pattern * 2 + 'px' : undefined,
                    }"
                    aria-hidden="true"
                />
                <span>{{ item.name }}</span>
                <span v-if="item.value" class="legend-value">{{ item.value }}</span>
            </span>
        </div>
    </div>
</template>

<style scoped>
.chart-panel {
    --chart-hover-fill: color-mix(in srgb, var(--accent) 9%, transparent);
    --chart-hover-line: color-mix(in srgb, var(--accent) 46%, transparent);
    min-width: 0;
    margin-bottom: 5px;
}
.chart-panel.chart-in-card {
    margin-bottom: 0;
}
.chart-panel :deep(.chart-surface) {
    position: relative;
}
.chart-panel :deep(.chart-scroll) {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    scrollbar-gutter: auto;
}
.chart-panel > .chart-legend-shelf {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 18px;
    margin: 4px 0 0;
    padding: 8px 0 0;
    border: 0;
    background: transparent;
    box-shadow: none;
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
    overflow-wrap: anywhere;
}
.swatch {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
}
.swatch.patterned {
    background-image: repeating-linear-gradient(
        35deg,
        transparent 0 calc(var(--swatch-step) - 1px),
        var(--bevel-hi) calc(var(--swatch-step) - 1px) var(--swatch-step)
    );
}
.legend-value {
    color: var(--num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
</style>
