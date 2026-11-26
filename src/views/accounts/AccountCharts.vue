<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import AccountFlowCard from './AccountFlowCard.vue';
import AccountFilterTabs from './AccountFilterTabs.vue';
import TrendChart from '../../components/TrendChart.vue';
import { CURRENCY_META, type AccountEntry, type Currency, type rangeOf } from './accounts';
import { BOOK_OPTIONS, accountTrend, accountAxisText, accountValueText } from './account-analysis';

const props = defineProps<{
    entries: readonly AccountEntry[];
    ranges: Record<Currency, ReturnType<typeof rangeOf>>;
}>();
const colors = ['var(--positive)', 'var(--negative)'];
const currency = ref<Currency>('rmb');
const trend = computed(() =>
    accountTrend(props.entries, currency.value, props.ranges[currency.value]),
);
const series = computed(() => [
    { id: 'income', name: '收入', values: trend.value.income },
    { id: 'expense', name: '支出', values: trend.value.expense },
]);
const chartDate = (value: string) =>
    value.length === 10 ? value.slice(5) : value.length === 7 ? value.slice(2) : value;
</script>

<template>
    <div class="account-charts">
        <LedgerSection title="收支走势" class="analysis-card chart-section" plain>
            <template #actions>
                <AccountFilterTabs
                    v-model="currency"
                    :options="BOOK_OPTIONS"
                    label="收支走势币种"
                />
            </template>
            <TrendChart
                :key="currency"
                class="chart-in-card"
                :labels="trend.labels"
                :series="series"
                kind="money"
                :label="CURRENCY_META[currency].label + '收支'"
                :value-text="(value) => accountValueText(value, currency)"
                :axis-text="(value) => accountAxisText(value, currency)"
                :axis-unit="currency === 'cash' ? 10000 : 1"
                :date-text="chartDate"
                :colors="colors"
            />
        </LedgerSection>

        <AccountFlowCard :entries="entries" group="character" class="character-flow" />
    </div>
</template>

<style scoped>
.account-charts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
}
.analysis-card {
    min-width: 0;
}
</style>
