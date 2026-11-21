<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import MaterialCard from '../../components/MaterialCard.vue';
import { priceLabel } from '../../services/format';
import { sparkLinePoints } from './price-chart-path';
import {
    currentPoint,
    priceBadge,
    recentPrices,
    sortedPoints,
    updateSummary,
    type ReadonlyPriceItem,
} from './prices';

type Material = InstanceType<typeof MaterialCard>['$props']['material'];

const props = defineProps<{ item: ReadonlyPriceItem; material?: Material }>();
const emit = defineEmits<{ open: []; log: [] }>();

const categoryMaterial = computed(() => {
    const category = CSS.escape(props.item.category);
    return {
        '--material-tint': `var(--tint-${category}, var(--tint-其他))`,
        '--material-depth': `var(--tint-deep-${category}, var(--tint-deep-其他))`,
        '--material-hue': `var(--tint-hue-${category}, var(--tint-hue-其他))`,
    };
});
const points = computed(() => sortedPoints(props.item));
const current = computed(() => currentPoint(props.item, points.value));
const currentLabel = computed(() => priceLabel(current.value?.price ?? null));
const badge = computed(() => priceBadge(props.item, points.value));
const footText = computed(() => updateSummary(props.item, points.value));
const spark = computed(() => sparkLinePoints(recentPrices(props.item, 8, points.value), 48, 17));
const logLabel = computed(() => {
    const { value, unit } = currentLabel.value;
    return current.value
        ? `为${props.item.name}记价，现价 ${value}${unit}`
        : `为${props.item.name}记价，尚未记价`;
});
</script>

<template>
    <MaterialCard as="article" :material="material" class="price-card" :style="categoryMaterial">
        <header class="card-head">
            <h3 class="card-name" :title="item.name">{{ item.name }}</h3>
            <span
                class="chip card-tag"
                :title="item.sub ? item.category + ' · ' + item.sub : item.category"
            >
                {{ item.sub || item.category }}
            </span>
        </header>

        <div class="card-quote" :class="badge?.tone">
            <button
                type="button"
                class="card-log"
                :aria-label="logLabel"
                title="记价"
                @click="emit('log')"
            >
                <template v-if="current">
                    <b class="card-value num">{{ currentLabel.value }}</b>
                    <small class="card-unit">{{ currentLabel.unit }}</small>
                </template>
                <span v-else class="card-unpriced">未记价</span>
                <AppIcon name="add" />
            </button>
            <div v-if="badge" class="card-trend">
                <span class="card-delta num" :title="badge.title">{{ badge.text }}</span>
                <svg v-if="spark" class="card-spark" viewBox="0 0 48 17" aria-hidden="true">
                    <polyline :points="spark" />
                </svg>
            </div>
        </div>

        <footer class="card-foot">
            <span class="card-meta num" :title="current?.date">
                {{ current ? footText : '暂无记录' }}
            </span>
            <button
                type="button"
                class="card-history"
                :aria-label="'查看' + item.name + '的价格历史'"
                @click="emit('open')"
            >
                历史
            </button>
        </footer>
    </MaterialCard>
</template>

<style scoped>
.price-card {
    --material-pad: 10px 12px 6px;

    display: flex;
    flex-direction: column;
    gap: 7px;
    min-height: 106px;
    color: var(--ink);
}
.card-head,
.card-quote,
.card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}
.card-name,
.card-tag {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.card-name {
    min-width: 0;
    margin: 0;
    font-size: var(--fs-md);
}
.card-tag {
    flex: none;
    max-width: 55%;
    border-color: color-mix(in srgb, var(--material-rim) 68%, transparent);
    background: color-mix(in srgb, var(--material-face) 79%, transparent);
    color: var(--ink-2);
}
.card-quote {
    flex: 1;
    flex-wrap: wrap;
    min-height: 31px;
    color: var(--ink-2);
}
.card-log,
.card-history {
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.card-log {
    --icon-size: var(--fs-xs);

    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 3px;
    min-width: 0;
    color: var(--ink-2);
}
.card-log :deep(.app-icon) {
    align-self: center;
    margin-inline-start: 3px;
}
@media (hover: hover) {
    .card-log :deep(.app-icon) {
        opacity: 0;
    }
    .price-card:is(:hover, :focus-within) .card-log :deep(.app-icon) {
        opacity: 1;
    }
}
.card-value {
    color: var(--num);
    font-size: var(--fs-amount);
    line-height: 1.1;
    overflow-wrap: anywhere;
}
.card-log:hover,
.card-log:hover .card-value {
    color: var(--accent);
}
.card-log:focus-visible,
.card-history:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.card-unit,
.card-unpriced,
.card-trend,
.card-foot {
    font-size: var(--fs-xs);
}
.card-trend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-inline-start: auto;
    white-space: nowrap;
}
.card-spark {
    display: block;
    width: 48px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.card-quote.up {
    color: var(--cinnabar);
}
.card-quote.down {
    color: var(--moss);
}
.card-foot {
    padding-top: 4px;
    border-top: var(--w-hair) solid color-mix(in srgb, var(--material-rim) 62%, transparent);
    color: var(--ink-2);
}
.card-history {
    flex-shrink: 0;
    padding-inline: 2px;
    color: var(--accent);
}
.card-history:hover {
    text-decoration: underline;
}
</style>
