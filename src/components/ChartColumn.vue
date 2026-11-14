<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ChartColumnGeometry } from './chart-columns';

const props = withDefaults(defineProps<{ column: ChartColumnGeometry; pattern?: number }>(), {
    pattern: 0,
});
const gradient = 'chart-column-' + useId();
const side = computed(() => {
    const { x, y, width, height, depth, negative } = props.column;
    const right = x + width;
    const shift = negative ? depth : -depth;
    return `${right},${y} ${right + depth},${y + shift} ${right + depth},${y + height + shift} ${right},${y + height}`;
});
const cap = computed(() => {
    const { x, y, width, height, depth, negative } = props.column;
    const edge = negative ? y + height : y;
    const shift = negative ? depth : -depth;
    return `${x},${edge} ${x + depth},${edge + shift} ${x + width + depth},${edge + shift} ${x + width},${edge}`;
});
</script>

<template>
    <g
        v-if="column.height > 0 && column.width > 0"
        class="chart-column chart-bar-face"
        aria-hidden="true"
    >
        <defs>
            <linearGradient :id="gradient">
                <stop offset="0" class="column-light" />
                <stop offset="0.38" class="column-color" />
                <stop offset="1" class="column-dark" />
            </linearGradient>
            <pattern
                v-if="pattern"
                :id="gradient + '-pattern'"
                patternUnits="userSpaceOnUse"
                :width="4 + pattern * 2"
                :height="4 + pattern * 2"
                patternTransform="rotate(35)"
            >
                <line x1="0" y1="0" x2="0" :y2="4 + pattern * 2" class="column-pattern" />
            </pattern>
        </defs>
        <polygon class="column-side" :points="side" />
        <rect
            class="column-front"
            :x="column.x"
            :y="column.y"
            :width="column.width"
            :height="column.height"
            :fill="'url(#' + gradient + ')'"
        />
        <rect
            v-if="pattern"
            :x="column.x"
            :y="column.y"
            :width="column.width"
            :height="column.height"
            :fill="'url(#' + gradient + '-pattern)'"
        />
        <polygon class="column-cap" :points="cap" />
    </g>
</template>

<style scoped>
.chart-column {
    filter: var(--chart-column-shadow);
    pointer-events: none;
}
.column-light {
    stop-color: var(--chart-front-light);
}
.column-color {
    stop-color: var(--chart-color);
}
.column-dark {
    stop-color: var(--chart-front-dark);
}
.column-side {
    fill: var(--chart-side);
}
.column-pattern {
    stroke: var(--bevel-hi);
    stroke-width: 1.5;
}
.column-cap {
    fill: var(--chart-top);
    stroke: var(--bevel-hi);
    stroke-width: 0.5;
    stroke-linejoin: round;
}
</style>
