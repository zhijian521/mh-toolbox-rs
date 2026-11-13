<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import AccountBarChart from './AccountBarChart.vue';
import { characterName, useRoster } from '../characters/roster';
import { ACCOUNT_CATEGORIES, type AccountEntry, type Currency } from './accounts';
import { BOOK_OPTIONS, channelAccounts, characterCategoryAccounts } from './account-analysis';

const props = defineProps<{
    entries: readonly AccountEntry[];
    group: 'character' | 'channel';
}>();
const { roster } = useRoster();
const currency = ref<Currency>(props.group === 'character' ? 'cash' : 'rmb');
const title = computed(() => (props.group === 'character' ? '角色收支' : '渠道收支'));
const categoryData = computed(() => characterCategoryAccounts(props.entries, currency.value));
const palette = [
    'var(--accent)',
    'var(--ochre)',
    'var(--indigo-ink)',
    'var(--moss)',
    'var(--cinnabar)',
    'var(--muted)',
    'color-mix(in oklch, var(--ochre) 55%, var(--moss))',
    'color-mix(in oklch, var(--indigo-ink) 55%, var(--cinnabar))',
    'color-mix(in oklch, var(--accent) 60%, var(--ochre))',
    'color-mix(in oklch, var(--moss) 50%, var(--indigo-ink))',
    'color-mix(in oklch, var(--cinnabar) 55%, var(--ochre))',
];
const categoryColor = (name: string) => {
    const known = (ACCOUNT_CATEGORIES as readonly string[]).indexOf(name);
    const index =
        known >= 0
            ? known
            : ACCOUNT_CATEGORIES.length +
              categoryData.value.categories
                  .filter((one) => !(ACCOUNT_CATEGORIES as readonly string[]).includes(one))
                  .indexOf(name);
    return palette[index % palette.length];
};
const legend = computed(() =>
    categoryData.value.categories.map((name) => ({ name, color: categoryColor(name) })),
);
const chartRows = computed(() => {
    if (props.group === 'channel')
        return channelAccounts(props.entries, currency.value).map((one) => ({
            id: one.id,
            name: one.id || '其他',
            values: [one.income, one.expense],
        }));
    return categoryData.value.rows.map((one) => ({
        id: one.id,
        name: characterName(roster.value, one.id),
        values: [one.income, one.expense],
        segments: [one.incomeSegments, one.expenseSegments].map((segments) =>
            segments.map((part) => ({
                name: part.category,
                amount: part.amount,
                color: categoryColor(part.category),
            })),
        ),
    }));
});
const series = [
    { name: '收入', color: 'var(--positive)' },
    { name: '支出', color: 'var(--negative)' },
];
</script>

<template>
    <LedgerSection :title="title" class="flow-card analysis-card">
        <template #actions>
            <SegmentedPills v-model="currency" :options="BOOK_OPTIONS" :label="title + '币种'" />
        </template>
        <AccountBarChart
            :rows="chartRows"
            :series="series"
            :currency="currency"
            :label="title"
            :legend="group === 'character' ? legend : undefined"
            :fit="group === 'character'"
        />
    </LedgerSection>
</template>

<style scoped>
.flow-card {
    min-width: 0;
}
</style>
