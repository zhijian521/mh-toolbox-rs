<script setup lang="ts">
import { lazyDialog } from '../../components/lazy-dialog';
import { useRouteAction } from '../../composables/use-route-action';
import { ALL_OPTIONS as ALL_ACCOUNTS } from '../../components/select-options';
import { computed, inject, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PageShell from '../../components/PageShell.vue';
import LiquidLedgerFrame from '../../components/LiquidLedgerFrame.vue';
import { glassLedger } from '../../components/glass-ledger';
import PressButton from '../../components/PressButton.vue';
import PaperTag from '../../components/PaperTag.vue';
import StatStrip from '../../components/StatStrip.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import { useRecordFilters } from '../../composables/use-record-filters';
import { notify } from '../../composables/use-notify';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { useRoster } from '../characters/roster';
import AccountCharts from './AccountCharts.vue';
import AccountFilterTabs from './AccountFilterTabs.vue';
import AccountFlowCard from './AccountFlowCard.vue';
import AccountRecentRecords from './AccountRecentRecords.vue';
import {
    CURRENCY_META,
    RANGE_PRESETS,
    SHORTCUTS,
    newestFirst,
    rangeOf,
    type AccountEntry,
    type Currency,
    type RangePreset,
} from './accounts';
import { accountValueText, inAccountRange, shortcutTotals } from './account-analysis';
import { accountSummaryBooks } from './account-summary';
import { loadAccounts, useAccounts, type EntryInput } from './accounts-store';
import { useDailySync } from './daily-sync';

const props = defineProps<{
    reloadLedger?: () => Promise<void>;
    reloadRoster?: () => Promise<void>;
}>();
const glass = inject(glassLedger, null);

const AccountEditor = lazyDialog(() => import('./AccountEditor.vue'));
const AccountRecords = lazyDialog(() => import('./AccountRecords.vue'));
const WarehouseDialog = lazyDialog(() => import('../warehouse/WarehouseDialog.vue'));
const warehouseOpen = ref(false);

const { entries, loadError, writeError, addEntry, updateEntry, pending, flush, retry } =
    useAccounts();
const { roster, loadError: rosterError } = useRoster();
const { error: syncError, retry: retrySync } = useDailySync();
const presets = ref<Record<Currency, RangePreset>>({ rmb: 'month', cash: 'month' });
const today = useToday();
const ranges = computed(() => ({
    rmb: rangeOf(presets.value.rmb, today.value),
    cash: rangeOf(presets.value.cash, today.value),
}));
const scoped = computed(() =>
    entries.value.filter((one) => inAccountRange(one.date, ranges.value[one.currency])),
);
const books = computed(() => accountSummaryBooks(scoped.value));
const shortcuts = computed(() => {
    const totals = shortcutTotals(
        scoped.value,
        SHORTCUTS.map((one) => one.preset),
    );
    return SHORTCUTS.map((one, index) => ({
        ...one,
        total: totals[index],
    }));
});
const recent = computed(() => newestFirst(scoped.value).slice(0, 4));
const editing = ref<{ entry?: AccountEntry; seed?: Partial<EntryInput> } | null>(null);
const recordsOpen = ref(false);
const { filters: historyFilters, syncScope } = useRecordFilters(
    () => {
        // 两个限定区间均截至今天；起点较早的区间（含“全部”）覆盖两本账。
        const { rmb, cash } = ranges.value;
        return { ...(rmb.from <= cash.from ? rmb : cash), who: ALL_ACCOUNTS };
    },
    {
        currency: ALL_ACCOUNTS,
        kind: ALL_ACCOUNTS,
        category: ALL_ACCOUNTS,
        channel: ALL_ACCOUNTS,
        source: ALL_ACCOUNTS,
        keyword: '',
        page: 1,
        scrollTop: 0,
    },
);
function openRecords() {
    syncScope();
    recordsOpen.value = true;
}
const submission = usePersistedSubmit(flush, retry);
const { saving, locked, action } = submission;

function openBlank(seed?: Partial<EntryInput>) {
    submission.reset();
    editing.value = { seed };
}
function openEntry(entry: AccountEntry) {
    submission.reset();
    editing.value = { entry };
}
function closeEditor() {
    if (saving.value) return;
    editing.value = null;
    submission.reset();
}
async function save(input: EntryInput) {
    const source = editing.value;
    if (!source) return;
    const ok = await submission.run('save', () => {
        const result = source.entry ? updateEntry(source.entry.id, input) : addEntry(input);
        if (result.ok) return true;
        notify.error(result.error);
        return false;
    });
    if (ok) {
        notify.success(source.entry ? '已保存修改' : '已记入账本');
        if (editing.value === source) editing.value = null;
    }
}
useRouteAction('/accounts', {
    new(query) {
        const characterId = roster.value.find((one) => one.id === query.character)?.id ?? '';
        openBlank({ characterId });
    },
    history() {
        openRecords();
    },
    warehouse() {
        warehouseOpen.value = true;
    },
});
</script>

<template>
    <component
        :is="glass ? LiquidLedgerFrame : PageShell"
        :class="glass ? 'liquid-accounts' : undefined"
        title="账号"
        desc="收支记账 · 分类统计"
    >
        <template #actions>
            <PressButton icon="history" text="历史" label="查看账号历史记录" @click="openRecords" />
            <PressButton
                icon="archive"
                text="仓库"
                label="打开装备和召唤兽仓库"
                seal
                @click="warehouseOpen = true"
            />
        </template>
        <div class="accounts-layout">
            <LoadNotice
                :error="loadError"
                :load="props.reloadLedger ?? loadAccounts"
                :blocked="pending > 0 || !!writeError || !!editing"
            />
            <LoadNotice
                v-if="props.reloadRoster"
                :error="rosterError"
                :load="props.reloadRoster"
                :blocked="pending > 0 || !!writeError"
            />
            <SaveNotice
                :error="writeError || (loadError ? '' : syncError)"
                :pending="pending"
                @retry="writeError ? retry() : retrySync()"
            />
            <section v-if="!loadError" class="account-overview books" aria-label="收支概览">
                <StatStrip
                    v-for="book in books"
                    :key="book.currency"
                    class="book"
                    centered
                    :surface="glass ? 'glass' : 'folded'"
                    spine="left"
                    :heading="book.heading"
                    :hint="book.hint"
                    :icon="book.currency === 'cash' ? 'coins' : 'accounts'"
                    :items="book.items"
                    :data-book-currency="book.currency"
                >
                    <template #actions>
                        <AccountFilterTabs
                            v-model="presets[book.currency]"
                            :label="book.heading + '时间范围'"
                            :options="RANGE_PRESETS"
                        />
                    </template>
                </StatStrip>
            </section>

            <LedgerSection title="快捷记账" plain>
                <div class="shortcuts">
                    <component
                        :is="glass?.button ?? 'button'"
                        v-for="one in shortcuts"
                        :key="one.id"
                        type="button"
                        :radius="glass ? 10 : undefined"
                        class="shortcut"
                        :aria-label="one.title + '，' + one.hint"
                        :title="one.hint"
                        :class="one.preset.kind"
                        @click="openBlank({ ...one.preset })"
                    >
                        <component :is="glass ? 'span' : PaperTag" class="shortcut-face">
                            <span class="shortcut-body">
                                <span class="sc-icon" aria-hidden="true"
                                    ><AppIcon :name="one.icon"
                                /></span>
                                <span class="sc-title">{{ one.title }}</span>
                                <span
                                    v-if="!loadError"
                                    class="sc-total"
                                    :title="one.preset.kind === 'income' ? '收入合计' : '支出合计'"
                                >
                                    <span
                                        v-for="currency in ['cash', 'rmb'] as const"
                                        :key="currency"
                                        class="sc-currency"
                                        :title="
                                            accountValueText(one.total[currency].amount, currency) +
                                            ' · ' +
                                            one.total[currency].count +
                                            ' 笔'
                                        "
                                    >
                                        <small>{{ CURRENCY_META[currency].label }}</small>
                                        <span class="sc-value">{{
                                            accountValueText(one.total[currency].amount, currency)
                                        }}</span>
                                    </span>
                                </span>
                            </span>
                        </component>
                    </component>
                </div>
            </LedgerSection>

            <div class="account-bottom">
                <AccountFlowCard
                    v-if="!loadError"
                    :entries="scoped"
                    group="channel"
                    class="channel-card"
                />
                <AccountRecentRecords
                    :entries="recent"
                    :roster="roster"
                    :error="loadError"
                    @edit="openEntry"
                />
            </div>

            <AccountCharts v-if="!loadError" :entries="scoped" :ranges="ranges" />
        </div>
        <WarehouseDialog v-if="warehouseOpen" @close="warehouseOpen = false" />
        <AccountRecords
            v-if="recordsOpen"
            v-model="historyFilters"
            :reload-ledger="props.reloadLedger"
            @close="recordsOpen = false"
            @edit="openEntry"
        />
        <AccountEditor
            v-if="editing"
            :entry="editing.entry"
            :seed="editing.seed"
            :saving="saving"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="save"
            @close="closeEditor"
        />
    </component>
</template>

<style scoped src="./accounts-page.css"></style>
