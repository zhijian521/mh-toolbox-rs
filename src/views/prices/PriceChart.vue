<script setup lang="ts">
import { computed } from 'vue';
import { moneyText } from '../../services/format';
import TrendChart from '../../components/TrendChart.vue';

const props = defineProps<{
    /** 保留每次记价，时间正序；同一天多条也各占一柱。 */
    points: { date: string; price: number }[];
    total?: number;
}>();
const labels = computed(() => props.points.map((one) => one.date));
const series = computed(() => [
    { id: 'price', name: '价格', values: props.points.map((one) => one.price) },
]);
const total = computed(() => Math.max(props.total ?? props.points.length, props.points.length));
const colors = computed(() => {
    const first = props.points[0]?.price ?? 0;
    const last = props.points[props.points.length - 1]?.price ?? 0;
    return [last > first ? 'var(--cinnabar)' : last < first ? 'var(--moss)' : 'var(--accent)'];
});
const summary = computed(
    () => '图中最近 ' + props.points.length + ' 次记价，共 ' + total.value + ' 条记录',
);
</script>

<template>
    <section class="price-chart" :aria-label="summary">
        <TrendChart
            :labels="labels"
            :series="series"
            kind="money"
            label="价格走势"
            :height="180"
            :colors="colors"
            :value-text="moneyText"
        />
        <p v-if="total > points.length" class="meta chart-more">
            只画最近 {{ points.length }} 次，这件物品一共 {{ total }} 条记录
        </p>
    </section>
</template>

<style scoped>
.price-chart {
    min-width: 0;
}
.chart-more {
    margin: 8px 0 0;
    text-align: right;
}
</style>
