<script setup lang="ts">
import { computed } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import AccountFlowCard from './AccountFlowCard.vue';
import TrendChart from '../../components/TrendChart.vue';
import { CURRENCY_META, type AccountEntry } from './accounts';
import { BOOK_OPTIONS, accountTrend, accountAxisText, accountValueText } from './account-analysis';

const props = defineProps<{
    entries: readonly AccountEntry[];
    range: { from: string; to: string };
}>();
const colors = ['var(--positive)', 'var(--negative)'];
const trends = computed(() =>
    BOOK_OPTIONS.map(({ value: currency }) => {
        const trend = accountTrend(props.entries, currency, props.range);
        return {
            currency,
            ...trend,
            series: [
                { id: 'income', name: '收入', values: trend.income },
                { id: 'expense', name: '支出', values: trend.expense },
            ],
            format: (value: number) => accountValueText(value, currency),
        };
    }),
);
const chartDate = (value: string) =>
    value.length === 10 ? value.slice(5) : value.length === 7 ? value.slice(2) : value;
</script>

<template>
    <div class="account-charts">
        <LedgerSection
            v-for="one in trends"
            :key="one.currency"
            class="analysis-card"
            :title="CURRENCY_META[one.currency].label + '走势'"
            :hint="'按' + one.unit + '汇总'"
        >
            <TrendChart
                :labels="one.labels"
                :series="one.series"
                kind="money"
                :label="CURRENCY_META[one.currency].label + '收支'"
                :value-text="one.format"
                :axis-text="(value) => accountAxisText(value, one.currency)"
                :axis-unit="one.currency === 'cash' ? 10000 : 1"
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}
.character-flow {
    grid-column: 1 / -1;
}
.analysis-card {
    min-width: 0;
}
@media (max-width: 760px) {
    .account-charts {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
