<script setup lang="ts">
import { ALL_OPTIONS as ALL } from '../../components/select-options';
import { computed, inject, ref, toRefs, useId, watch } from 'vue';
import { useRecordScroll } from '../../composables/use-record-filters';
import LoadNotice from '../../components/LoadNotice.vue';
import { ledgerMoneyText } from '../../services/format';
import DateRangeField from '../../components/DateRangeField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import SelectField from '../../components/SelectField.vue';
import StatStrip from '../../components/StatStrip.vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSearch } from '../../components/liquid-glass';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import GlassTable from '../../components/liquid-glass/GlassTable.vue';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { notify } from '../../composables/use-notify';
import { usePagination } from '../../composables/use-pagination';
import { characterName, useRoster } from '../characters/roster';
import { characterOptions } from '../characters/character-options';
import RecordPager from '../../components/RecordPager.vue';
import {
    ACCOUNT_CATEGORIES,
    CHANNELS,
    CURRENCY_META,
    newestFirst,
    type AccountEntry,
} from './accounts';
import {
    BOOK_OPTIONS,
    accountValueText,
    filterAccounts,
    type AccountRecordFilters,
} from './account-analysis';
import { loadAccounts, useAccounts } from './accounts-store';
import { warehouseName } from '../warehouse/warehouse';
import { accountSummaryBooks } from './account-summary';

defineProps<{ reloadLedger?: () => Promise<void> }>();
const emit = defineEmits<{ close: []; edit: [entry: AccountEntry] }>();
const glass = inject(glassLedger, null);
const FilterSelect = glass ? GlassSelect : SelectField;
const filters = defineModel<AccountRecordFilters>({ required: true });
const {
    currency,
    kind,
    category,
    channel,
    who,
    source,
    from,
    to,
    keyword,
    page: selectedPage,
} = toRefs(filters.value);
const { scroll, rememberScroll } = useRecordScroll(filters);
const { entries, removeEntry, flush, retry, pending, writeError, loadError } = useAccounts();
const { roster } = useRoster();
const removal = useConfirmedRemoval(
    () => pending.value > 0 || Boolean(loadError.value || writeError.value),
    flush,
);
const { removing } = removal;
const mutationBlocked = computed(
    () => removing.value || pending.value > 0 || Boolean(loadError.value || writeError.value),
);
const categoryOptions = computed(() => [
    { value: ALL, label: '全部分类' },
    ...[...new Set([...ACCOUNT_CATEGORIES, ...entries.value.map((one) => one.category)])].map(
        (one) => ({ value: one, label: one }),
    ),
]);
const channelOptions = computed(() => [
    { value: ALL, label: '全部渠道' },
    ...[...new Set([...CHANNELS, ...entries.value.map((one) => one.channel)])].map((one) => ({
        value: one,
        label: one,
    })),
]);
const currencyOptions = [{ value: ALL, label: '全部币种' }, ...BOOK_OPTIONS];
const kindOptions = [
    { value: ALL, label: '全部方向' },
    { value: 'income', label: '收入' },
    { value: 'expense', label: '支出' },
];
const sourceOptions = [
    { value: ALL, label: '全部来源' },
    { value: 'manual', label: '手动记账' },
    { value: 'auto', label: '自动同步' },
];
const whoOptions = computed(() =>
    characterOptions(
        roster.value,
        entries.value.map((one) => one.characterId),
        { all: true, unassigned: '未指定' },
    ),
);
const moreFiltersOpen = ref(false);
const filterPanelId = useId();
const filterFields = computed(
    () =>
        [
            { key: 'currency', label: '币种筛选', options: currencyOptions },
            { key: 'kind', label: '方向筛选', options: kindOptions },
            { key: 'category', label: '分类筛选', options: categoryOptions.value },
            { key: 'channel', label: '渠道筛选', options: channelOptions.value },
            { key: 'who', label: '角色筛选', options: whoOptions.value },
            { key: 'source', label: '来源筛选', options: sourceOptions },
        ] as const,
);
const activeFilterLabels = computed(() =>
    filterFields.value.flatMap(({ key, options }) => {
        const value = filters.value[key];
        if (value === ALL) return [];
        return [options.find((option) => option.value === value)?.label ?? value];
    }),
);
const filtered = computed(() => {
    const word = keyword.value.trim().toLocaleLowerCase();
    return newestFirst(
        filterAccounts(entries.value, {
            from: from.value,
            to: to.value,
            characterId: who.value,
            currency: currency.value,
            kind: kind.value,
            category: category.value,
            channel: channel.value,
            source: source.value,
        }),
    ).filter(
        (one) =>
            !word ||
            [
                one.category,
                one.note,
                one.channel,
                characterName(roster.value, one.characterId),
                ...(one.assets ?? []).map(warehouseName),
            ]
                .join(' ')
                .toLocaleLowerCase()
                .includes(word),
    );
});
const { page, pages, visible } = usePagination(filtered, 20, selectedPage);
const sums = computed(() =>
    accountSummaryBooks(filtered.value).filter(
        (one) => currency.value === ALL || currency.value === one.currency,
    ),
);
const anyFilter = computed(
    () =>
        [currency, kind, category, channel, who, source].some((one) => one.value !== ALL) ||
        Boolean(from.value || to.value || keyword.value.trim()),
);
watch([currency, kind, category, channel, who, source, from, to, keyword], () => {
    page.value = 1;
    if (scroll.value) scroll.value.scrollTop = 0;
    filters.value.scrollTop = 0;
});
function reset() {
    for (const field of [currency, kind, category, channel, who, source]) field.value = ALL;
    from.value = '';
    to.value = '';
    keyword.value = '';
    moreFiltersOpen.value = false;
}
async function remove(one: AccountEntry) {
    if (one.source === 'auto') return;
    const ok = await removal.run(
        {
            danger: true,
            title: '删除这条记录？',
            note:
                one.date +
                ' · ' +
                one.category +
                ' · ' +
                accountValueText(one.amount, one.currency) +
                (one.kind === 'income' && one.assets?.length ? '。关联物品将返回仓库。' : ''),
            confirmText: '删除',
        },
        () => {
            const result = removeEntry(one.id);
            if (!result.ok) notify.error(result.error);
            return result.ok;
        },
    );
    if (ok) notify.success('已删除记录');
}
</script>

<template>
    <ModalShell
        title="历史记录"
        class="account-history record-history"
        :width="960"
        min-height="min(620px, calc(100vh - 48px))"
        fill
        @close="!removing && emit('close')"
    >
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <LoadNotice
            :error="loadError"
            :load="reloadLedger ?? loadAccounts"
            :blocked="pending > 0 || !!writeError || removing"
        />
        <div class="account-record-controls" :class="{ 'lg-form-fields': glass }">
            <div class="account-record-toolbar">
                <div class="record-filters account-record-search">
                    <DateRangeField
                        v-model:from="from"
                        v-model:to="to"
                        :glass="!!glass"
                        :from-label="glass ? '开始日期' : '账号历史开始日期'"
                        :to-label="glass ? '结束日期' : '账号历史结束日期'"
                    />
                    <GlassSearch
                        v-if="glass"
                        v-model:value="keyword"
                        class="filter-search"
                        placeholder="搜索记录或物品"
                        aria-label="搜索记录"
                    />
                    <input
                        v-else
                        v-model="keyword"
                        class="field filter-search"
                        type="search"
                        placeholder="搜索记录或物品"
                        aria-label="搜索记录"
                        autocomplete="off"
                    />
                </div>
                <div class="account-record-actions">
                    <PressButton
                        v-if="anyFilter"
                        icon="refresh"
                        text="重置"
                        label="清空筛选"
                        @click="reset"
                    />
                    <PressButton
                        class="account-record-filter-toggle"
                        icon="chevron-down"
                        :text="
                            '筛选' +
                            (activeFilterLabels.length ? ' · ' + activeFilterLabels.length : '')
                        "
                        label="展开或收起账号筛选"
                        :aria-expanded="moreFiltersOpen"
                        :aria-controls="filterPanelId"
                        seal
                        @click="moreFiltersOpen = !moreFiltersOpen"
                    />
                </div>
            </div>
            <p v-if="!moreFiltersOpen && activeFilterLabels.length" class="account-record-active">
                筛选：{{ activeFilterLabels.join(' · ') }}
            </p>
            <div
                v-show="moreFiltersOpen"
                :id="filterPanelId"
                class="record-filters account-record-filter-grid"
                role="group"
                aria-label="账号记录筛选"
            >
                <FilterSelect
                    v-for="field in filterFields"
                    :key="field.key"
                    v-model="filters[field.key]"
                    :options="field.options"
                    :label="field.label"
                    :hide-label="glass ? true : undefined"
                />
            </div>
        </div>
        <div v-if="!loadError" class="record-summary account-record-summary">
            <StatStrip
                v-for="one in sums"
                :key="one.currency"
                class="account-record-total"
                :surface="glass ? 'glass' : 'folded'"
                spine="left"
                :heading="one.heading"
                :hint="one.hint"
                :icon="one.currency === 'cash' ? 'coins' : 'accounts'"
                :items="one.items"
                :data-currency="one.currency"
                :aria-label="CURRENCY_META[one.currency].label + '汇总'"
            />
        </div>
        <div class="record-table-frame" :class="{ 'is-empty': !!loadError || !entries.length }">
            <div ref="scroll" class="income-log-scroll" @scroll="rememberScroll">
                <p v-if="loadError || !filtered.length" class="record-empty">
                    {{
                        loadError
                            ? '暂时无法读取记录'
                            : entries.length
                              ? '这个筛选下没有记录'
                              : '还没有账号记录'
                    }}
                </p>
                <component
                    :is="glass ? GlassTable : 'table'"
                    v-else
                    class="rec-table"
                    :class="{ 'income-table': !glass }"
                    :sticky-header="glass ? true : undefined"
                >
                    <thead>
                        <tr>
                            <th>日期</th>
                            <th>分类 / 来源</th>
                            <th>备注</th>
                            <th>角色</th>
                            <th>渠道</th>
                            <th class="c-num">金额</th>
                            <th class="c-ops">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="one in visible" :key="one.id">
                            <td class="c-date">{{ one.date }}</td>
                            <td class="c-category">
                                {{ one.category
                                }}<small v-if="one.source === 'auto'">自动同步</small>
                            </td>
                            <td
                                class="c-note"
                                :title="
                                    [one.note, ...(one.assets ?? []).map(warehouseName)]
                                        .filter(Boolean)
                                        .join(' · ')
                                "
                            >
                                <span v-if="one.assets?.length" class="record-assets">{{
                                    one.assets.map(warehouseName).join('、')
                                }}</span>
                                {{ one.note }}
                            </td>
                            <td class="c-who">{{ characterName(roster, one.characterId) }}</td>
                            <td class="c-channel">{{ one.channel }}</td>
                            <td class="c-num" :class="one.kind === 'expense' ? 'out' : 'in'">
                                {{
                                    ledgerMoneyText(
                                        one.kind === 'expense' ? -one.amount : one.amount,
                                        one.currency,
                                        { sign: 'always' },
                                    )
                                }}
                            </td>
                            <td class="c-ops">
                                <span class="income-ops">
                                    <PressButton
                                        :icon="one.source === 'auto' ? 'search' : 'edit'"
                                        :disabled="mutationBlocked"
                                        :label="one.source === 'auto' ? '查看这一条' : '改这一条'"
                                        size="md"
                                        @click="emit('edit', one)"
                                    />
                                    <PressButton
                                        v-if="one.source !== 'auto'"
                                        danger
                                        icon="trash"
                                        label="删这一条"
                                        size="md"
                                        :disabled="mutationBlocked"
                                        @click="remove(one)"
                                    />
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </component>
            </div>
        </div>
        <template v-if="!glass || (!loadError && pages > 1)" #footer>
            <div class="account-history-footer" :class="{ 'with-close': !glass }">
                <RecordPager v-if="!loadError" v-model="page" :pages="pages" />
                <PressButton
                    v-if="!glass"
                    data-modal-cancel
                    text="关闭"
                    label="关闭账号历史记录"
                    :disabled="removing"
                    @click="emit('close')"
                />
            </div>
        </template>
    </ModalShell>
</template>

<style scoped>
.account-history-footer {
    display: grid;
    align-items: center;
    justify-items: center;
    width: 100%;
}
.account-history-footer.with-close {
    grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(0, 1fr);
}
.with-close .record-pager {
    grid-column: 2;
}
.with-close [data-modal-cancel] {
    grid-column: 3;
    justify-self: end;
}
@media (max-width: 540px) {
    .account-history-footer.with-close {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
    }
    .with-close :is(.record-pager, [data-modal-cancel]) {
        grid-column: 1;
    }
}
.account-record-controls {
    --record-field-w: calc(148px * var(--fs-scale));

    flex: none;
    min-width: 0;
}
.account-record-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 16px;
    margin-bottom: 12px;
}
.account-record-search {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    margin-bottom: 0;
}
.account-record-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}
.account-record-search .filter-search {
    flex: 0 1 calc(210px * var(--fs-scale));
    width: calc(210px * var(--fs-scale));
    min-width: 0;
    max-width: 100%;
}
.account-record-search .date-range-field {
    --range-date-width: var(--record-field-w);
}
.account-record-filter-toggle[aria-expanded='true'] :deep(.app-icon) {
    transform: rotate(180deg);
}
.account-record-active {
    margin: -2px 0 12px;
    color: var(--muted);
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
}
.account-record-filter-grid {
    display: flex;
    flex-wrap: wrap;
}
.account-record-filter-grid > :is(.select-field, .glass-select) {
    flex: 0 1 var(--record-field-w);
    width: var(--record-field-w);
    min-width: 0;
    max-width: 100%;
}
.account-record-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    align-items: start;
    gap: 12px;
}
.account-record-total {
    --stat-columns: 3;
    --block-pad: 18px;
    --folded-pad-block: var(--block-pad);
    --folded-pad-inline: var(--block-pad);
    --stats-ink: var(--accent);

    min-width: 0;
}
.account-record-total[data-currency='cash'] {
    --stats-ink: var(--moss);
}
.in {
    color: var(--positive);
}
.out {
    color: var(--negative);
}
.rec-table {
    min-width: 740px;
}
.c-date {
    width: 88px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-category {
    width: 108px;
}
.c-category small {
    display: block;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.c-note {
    overflow: hidden;
    max-width: 0;
    min-width: 80px;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.record-assets {
    display: block;
    overflow: hidden;
    color: var(--ink-2);
    text-overflow: ellipsis;
}
.c-who {
    width: 100px;
    overflow-wrap: anywhere;
}
.c-channel {
    width: 78px;
    color: var(--muted);
}
.rec-table .c-num {
    width: 115px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-ops {
    width: 74px;
}
</style>
