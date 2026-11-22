<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import { usePagination } from '../../composables/use-pagination';
import { GlassButton } from '../../components/liquid-glass';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import PriceActionsMenu from './PriceActionsMenu.vue';
import TrendChart from '../../components/TrendChart.vue';
import { changeText, moneyText } from '../../services/format';
import { chartPrices, pointDelta, sortedPoints, type PricePoint, type ReadonlyPriceItem } from './prices';

const props = defineProps<{ item: ReadonlyPriceItem; editDisabled: boolean }>();
const emit = defineEmits<{ edit: [point: PricePoint]; remove: [point: PricePoint] }>();
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
const selectedPage = defineModel<number>('page', { required: true });
const { page, pages, visible } = usePagination(rows, 5, selectedPage);
const chart = computed(() => chartPrices(props.item, undefined, points.value));
const labels = computed(() => chart.value.map((point) => point.date));
const series = computed(() => [
    { id: 'price', name: '价格', values: chart.value.map((point) => point.price) },
]);
</script>

<template>
    <div class="liquid-price-history" @pointerdown.stop>
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
                    :height="132"
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
                        <tr v-for="row in visible" :key="row.point.id">
                            <td><time :datetime="row.point.date">{{ row.point.date }}</time></td>
                            <td>{{ row.amount }}</td>
                            <td :data-tone="row.tone">{{ row.change }}</td>
                            <td class="price-history-note">{{ row.point.note || '—' }}</td>
                            <td class="price-history-action">
                                <div class="record-actions">
                                    <GlassButton
                                        class="lg-inline-action"
                                        size="small"
                                        variant="plain"
                                        :aria-label="`编辑 ${row.point.date} 的价格记录`"
                                        :disabled="editDisabled"
                                        @click="emit('edit', row.point)"
                                    >
                                        编辑
                                    </GlassButton>
                                    <PriceActionsMenu
                                        record
                                        :label="`${row.point.date} 的价格记录操作`"
                                        :disabled="editDisabled"
                                        @remove="emit('remove', row.point)"
                                    />
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <nav v-if="pages > 1" class="price-history-pager" aria-label="价格记录分页">
                <GlassButton class="lg-inline-action" size="small" shape="circle" aria-label="上一页" :disabled="page <= 1" @click="page--">
                    <AppIcon name="chevron-left" />
                </GlassButton>
                <span aria-live="polite">{{ page }} / {{ pages }}</span>
                <GlassButton class="lg-inline-action" size="small" shape="circle" aria-label="下一页" :disabled="page >= pages" @click="page++">
                    <AppIcon name="chevron-right" />
                </GlassButton>
            </nav>
        </template>
        <GlassEmptyState v-else />
    </div>
</template>

<style scoped>
.liquid-price-history {
    --accent: light-dark(rgb(91 165 149 / 0.72), rgb(152 216 196 / 0.70));
    --muted: var(--liquid-muted);
    --ink-2: var(--liquid-ink);
    --rule: var(--liquid-outline);
    --rule-2: var(--liquid-outline);
    --num: var(--liquid-ink);
    --bevel-hi: light-dark(#ffffff98, #e2f7e585);
    --chart-surface-bg: light-dark(rgb(248 253 250 / 0.22), rgb(24 40 38 / 0.24));
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    gap: 8px;
}

.liquid-price-history:has(.price-history-records) {
    min-height: 300px;
}
.liquid-price-history > section,
.price-history-pager {
    flex: none;
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

.liquid-price-history :deep(.chart-surface) {
    border-radius: 10px;
    background: var(--chart-surface-bg);
}
.liquid-price-history :deep(.chart-scroll) {
    overflow-x: auto;
    scrollbar-width: none;
    /* 滚动条刻意不画，轨道也就不要常驻（覆盖 style.css 的全局 stable）。 */
    scrollbar-gutter: auto;
    clip-path: inset(0 0 0 var(--trend-axis-width));
}
.liquid-price-history :deep(.chart-fixed-axis) {
    background: transparent;
}
.liquid-price-history :deep(.chart-column) {
    --chart-front-light: color-mix(in srgb, var(--chart-color) 80%, var(--bevel-hi));
    --chart-front-dark: var(--chart-color);
    --chart-side: color-mix(in srgb, var(--chart-color) 90%, var(--liquid-ink) 10%);
    --chart-top: color-mix(in srgb, var(--chart-color) 72%, var(--bevel-hi));
}
.price-history-records {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}
.price-history-pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.price-history-pager glass-button {
    --icon-size: 14px;
}
.liquid-price-history > .glass-empty-state {
    margin-block: auto;
}

.price-history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}

.price-history-table :is(th, td) {
    padding: 8px 6px;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    vertical-align: middle;
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

.record-actions {
    display: flex;
    align-items: center;
    gap: 2px;
}

.price-history-table [data-tone='up'] {
    color: var(--liquid-up);
}

.price-history-table [data-tone='down'] {
    color: var(--liquid-down);
}

</style>

