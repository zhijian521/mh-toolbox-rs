<script setup lang="ts">
import { computed } from 'vue';
import { GlassButton } from '../../components/liquid-glass';
import TrendChart from '../../components/TrendChart.vue';
import { changeText, moneyText } from '../../services/format';
import { chartPrices, pointDelta, sortedPoints, type PricePoint, type ReadonlyPriceItem } from './prices';

const props = defineProps<{ item: ReadonlyPriceItem; editDisabled: boolean }>();
const emit = defineEmits<{ edit: [point: PricePoint] }>();
const points = computed(() => sortedPoints(props.item));
const rows = computed(() =>
    points.value.map((point, index) => {
        const delta = pointDelta(points.value, index);
        return {
            point,
            amount: moneyText(point.price),
            change: delta === null ? '—' : changeText(delta),
            tone: delta === null || delta === 0 ? '' : delta > 0 ? 'up' : 'down',
        };
    }),
);
const chart = computed(() => chartPrices(props.item, undefined, points.value));
const labels = computed(() => chart.value.map((point) => point.date));
const series = computed(() => [
    { id: 'price', name: '价格', values: chart.value.map((point) => point.price) },
]);
</script>

<template>
    <div class="liquid-price-history">
        <template v-if="rows.length">
            <section aria-labelledby="liquid-price-trend-title">
                <h3 id="liquid-price-trend-title">
                    价格走势
                    <small v-if="chart.length < rows.length">最近 {{ chart.length }} 笔</small>
                </h3>
                <TrendChart
                    :labels="labels"
                    :series="series"
                    kind="money"
                    label="价格走势"
                    :value-text="moneyText"
                    :height="176"
                />
            </section>
            <div class="price-history-records">
                <table class="price-history-table">
                    <caption>
                        价格记录（{{ rows.length }} 笔）
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">日期</th>
                            <th scope="col">价格</th>
                            <th scope="col">较上笔</th>
                            <th scope="col">备注</th>
                            <th scope="col">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in rows" :key="row.point.id">
                            <td><time :datetime="row.point.date">{{ row.point.date }}</time></td>
                            <td>{{ row.amount }}</td>
                            <td :data-tone="row.tone">{{ row.change }}</td>
                            <td class="price-history-note">{{ row.point.note || '—' }}</td>
                            <td class="price-history-action">
                                <GlassButton
                                    size="small"
                                    variant="plain"
                                    :aria-label="`编辑 ${row.point.date} 的价格记录`"
                                    :disabled="editDisabled"
                                    @click="emit('edit', row.point)"
                                >
                                    编辑
                                </GlassButton>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
        <p v-else class="price-history-empty">这个物品还没有价格记录。</p>
    </div>
</template>

<style scoped>
.liquid-price-history {
    --accent: var(--lg-accent);
    --muted: var(--price-muted);
    --ink-2: var(--liquid-ink);
    --rule: var(--liquid-outline);
    --rule-2: var(--liquid-outline);
    --num: var(--liquid-ink);
    --bevel-hi: light-dark(#ffffff98, #e2f7e585);
    --chart-surface-bg: light-dark(#edf8f346, #13282050);
    --r-2: 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.liquid-price-history h3,
.price-history-table caption {
    margin: 0 0 7px;
    font-size: var(--fs-base);
    font-weight: 400;
    text-align: left;
}

.liquid-price-history h3 small {
    margin-inline-start: 5px;
    color: var(--muted);
}

.price-history-records {
    overflow-x: auto;
}

.price-history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}

.price-history-table :is(th, td) {
    padding: 7px 6px;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    vertical-align: top;
}

.price-history-table th {
    color: var(--muted);
    font-weight: 400;
}

.price-history-table :is(th, td):nth-child(-n + 3) {
    white-space: nowrap;
}

.price-history-table .price-history-note {
    overflow-wrap: anywhere;
}

.price-history-table .price-history-action {
    width: 1%;
    padding-block: 2px;
}

.price-history-action glass-button {
    --glass-button-height: 26px;
    --glass-button-padding: 7px;
    white-space: nowrap;
}

.price-history-table [data-tone='up'] {
    color: var(--price-up);
}

.price-history-table [data-tone='down'] {
    color: var(--price-down);
}

.price-history-empty {
    margin: 0;
    padding: 12px 0;
    color: var(--muted);
}
</style>

