<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
    defineProps<{
        percent: number | null;
        label: string;
        shape?: 'ring' | 'ticks';
        valueText?: string;
    }>(),
    { shape: 'ticks', valueText: '' },
);
const gradientId = `goal-progress-${useId()}`;
const value = computed(() =>
    props.percent === null ? null : Math.max(0, Math.min(100, props.percent)),
);
const fills = computed(() =>
    Array.from({ length: 10 }, (_, i) =>
        Math.max(0, Math.min(100, ((value.value ?? 0) - i * 10) * 10)),
    ),
);
</script>

<template>
    <div
        class="goal-progress"
        :class="shape"
        role="progressbar"
        :aria-label="label"
        :aria-valuenow="value === null ? undefined : Math.round(value)"
        :aria-valuetext="valueText || (value === null ? '待补录' : undefined)"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <template v-if="shape === 'ring'">
            <svg viewBox="0 0 84 84" aria-hidden="true">
                <defs>
                    <linearGradient :id="gradientId" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0" class="ring-light" />
                        <stop offset="0.45" class="ring-color" />
                        <stop offset="1" class="ring-dark" />
                    </linearGradient>
                </defs>
                <circle class="ring-bed" cx="42" cy="44" r="34" />
                <circle class="ring-track" cx="42" cy="42" r="34" />
                <g v-if="value !== null && value > 0">
                    <circle
                        class="ring-depth"
                        cx="42"
                        cy="42"
                        r="34"
                        pathLength="100"
                        :stroke-dasharray="`${value} 100`"
                    />
                    <circle
                        class="ring-face"
                        cx="42"
                        cy="42"
                        r="34"
                        pathLength="100"
                        :stroke="`url(#${gradientId})`"
                        :stroke-dasharray="`${value} 100`"
                    />
                </g>
            </svg>
            <span class="ring-readout" aria-hidden="true">
                <b v-if="value !== null">{{ Math.round(value) }}<small>%</small></b>
                <b v-else>待补录</b>
                <span>总体进度</span>
            </span>
        </template>
        <template v-else>
            <span v-for="(fill, index) in fills" :key="index" class="tick" aria-hidden="true">
                <i :style="{ width: `${fill}%` }" />
            </span>
        </template>
    </div>
</template>

<style scoped>
.goal-progress {
    --progress-light: color-mix(in srgb, var(--progress-color) 65%, var(--bevel-hi));
    --progress-dark: color-mix(in srgb, var(--progress-color) 75%, var(--ink-base));
    min-width: 0;
}
.ring {
    position: relative;
    display: grid;
    place-items: center;
    width: calc(68px * var(--fs-scale));
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--well-background);
    box-shadow:
        inset 0 1px 2px var(--shadow),
        0 1px 0 var(--bevel-hi);
}
.ring svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 2px 1px var(--shadow));
}
.ring circle {
    fill: none;
    stroke-width: 6;
}
.ring-bed {
    stroke: color-mix(in srgb, var(--rule-2) 75%, var(--bevel-lo));
}
.ring-track {
    stroke: var(--well);
}
.ring-depth,
.ring-face {
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 42px 42px;
}
.ring-depth {
    stroke: var(--progress-dark);
    transform: translateY(2px) rotate(-90deg);
}
.ring-light {
    stop-color: var(--progress-light);
}
.ring-color {
    stop-color: var(--progress-color);
}
.ring-dark {
    stop-color: var(--progress-dark);
}
.ring-readout {
    position: absolute;
    display: grid;
    justify-items: center;
    gap: 3px;
    color: var(--muted);
    line-height: 1.1;
}
.ring-readout b {
    color: var(--num);
    font-size: var(--fs-amount);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.ring-readout small {
    margin-left: 1px;
    font-size: var(--fs-xs);
}
.ring-readout > span {
    font-size: var(--fs-mini);
}
.ticks {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 2px;
}
.tick {
    position: relative;
    height: calc(7px * var(--fs-scale));
    overflow: hidden;
    border-radius: 1px;
    background: var(--well);
    box-shadow:
        inset 0 1px 1px var(--shadow-lg),
        0 1px 0 var(--bevel-hi);
}
.tick i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
        180deg,
        var(--progress-light),
        var(--progress-color) 45%,
        var(--progress-dark)
    );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 0 -1px 0 var(--bevel-lo);
}
</style>
