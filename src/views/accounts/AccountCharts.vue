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
        <LedgerSection title="收支走势" class="analysis-card chart-section" plain>
            <div class="trend-pair">
                <section v-for="one in trends" :key="one.currency" class="trend-block">
                    <header class="trend-head">
                        <h3 :title="'按' + one.unit + '汇总'">{{ CURRENCY_META[one.currency].label }}</h3>
                    </header>
                    <TrendChart
                        class="chart-in-card"
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
                </section>
            </div>
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
.trend-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}
.analysis-card,
.trend-block {
    min-width: 0;
}
.trend-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: var(--fs-xs);
}
.trend-head h3 {
    font-size: var(--fs-sm);
}
@container accounts (max-width: 760px) {
    .trend-pair {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
