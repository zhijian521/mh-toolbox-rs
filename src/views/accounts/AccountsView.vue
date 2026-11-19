<script setup lang="ts">
import { lazyDialog } from '../../components/lazy-dialog';
import { useRouteAction } from '../../composables/use-route-action';
import { ALL_OPTIONS as ALL_ACCOUNTS } from '../../components/select-options';
import { computed, ref } from 'vue';
import { ledgerMoneyText } from '../../services/format';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PaperCard from '../../components/PaperCard.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import { useRecordFilters } from '../../composables/use-record-filters';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { notify } from '../../composables/use-notify';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { characterName, useRoster } from '../characters/roster';
import AccountCharts from './AccountCharts.vue';
import AccountFlowCard from './AccountFlowCard.vue';
import {
    CURRENCY_META,
    RANGE_PRESETS,
    SHORTCUTS,
    accountStatsByCurrency,
    newestFirst,
    rangeOf,
    type AccountEntry,
    type RangePreset,
} from './accounts';
import { accountValueText, filterAccounts, shortcutTotals } from './account-analysis';
import { loadAccounts, useAccounts, type EntryInput } from './accounts-store';

const AccountEditor = lazyDialog(() => import('./AccountEditor.vue'));
const AccountRecords = lazyDialog(() => import('./AccountRecords.vue'));
const WarehouseDialog = lazyDialog(() => import('../warehouse/WarehouseDialog.vue'));
const warehouseOpen = ref(false);

const { entries, loadError, writeError, addEntry, updateEntry, pending, flush, retry } =
    useAccounts();
const { roster } = useRoster();
const preset = ref<RangePreset>('month');
const today = useToday();
const range = computed(() => rangeOf(preset.value, today.value));
const scoped = computed(() => filterAccounts(entries.value, range.value));
const books = computed(() => {
    const stats = accountStatsByCurrency(scoped.value);
    return (['rmb', 'cash'] as const).map((currency) => {
        const book = stats[currency];
        return {
            currency,
            heading: CURRENCY_META[currency].label + ' · ' + book.count + ' 笔',
            items: [
                {
                    id: currency + '-income',
                    cap: '收入',
                    value: accountValueText(book.income, currency),
                    tone: book.income > 0 ? 'gain' : 'num',
                },
                {
                    id: currency + '-expense',
                    cap: '支出',
                    value: accountValueText(book.expense, currency),
                    tone: book.expense > 0 ? 'loss' : 'num',
                },
                {
                    id: currency + '-net',
                    cap: '差额',
                    value: accountValueText(book.net, currency),
                    tone: book.net < 0 ? 'loss' : book.net > 0 ? 'gain' : 'num',
                },
            ] satisfies StatItem[],
        };
    });
});
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
const recent = computed(() => newestFirst(scoped.value).slice(0, 8));
const editing = ref<{ entry?: AccountEntry; seed?: Partial<EntryInput> } | null>(null);
const recordsOpen = ref(false);
const { filters: historyFilters, syncScope } = useRecordFilters(
    () => ({ ...range.value, who: ALL_ACCOUNTS }),
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
});
</script>

<template>
    <PageShell title="账号" desc="收支记账 · 分类统计">
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
                :load="loadAccounts"
                :blocked="pending > 0 || !!writeError || !!editing"
            />
            <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
            <PaperCard class="account-overview" plain>
                <div class="filters">
                    <SegmentedPills v-model="preset" :options="RANGE_PRESETS" label="账目时间范围" />
                    <span class="range-text">{{
                        range.from ? range.from + ' 至 ' + range.to : '全部时间'
                    }}</span>
                </div>
                <div v-if="!loadError" class="books">
                    <StatStrip
                        v-for="book in books"
                        :key="book.currency"
                        class="book"
                        surface="embedded"
                        :heading="book.heading"
                        :items="book.items"
                        :data-book-currency="book.currency"
                    />
                </div>
            </PaperCard>

            <LedgerSection title="快捷记账" plain>
                <div class="shortcuts">
                    <button
                        v-for="one in shortcuts"
                        :key="one.id"
                        type="button"
                        class="shortcut"
                        :aria-label="one.title + '，' + one.hint"
                        :title="one.hint"
                        :class="one.preset.kind"
                        @click="openBlank({ ...one.preset })"
                    >
                        <PressTile class="shortcut-face" surface="side-tab" wide>
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
                        </PressTile>
                    </button>
                </div>
            </LedgerSection>

            <div class="account-bottom">
                <AccountFlowCard
                    v-if="!loadError"
                    :entries="scoped"
                    group="channel"
                    class="channel-card"
                />
                <LedgerSection title="最近记录" class="records" plain>
                    <p v-if="!recent.length" class="blank">
                        {{ loadError ? '暂时无法读取记录，请重新读取。' : '这个范围还没有记录' }}
                    </p>
                    <div v-else class="recent-list" tabindex="0" aria-label="最近八笔账号记录">
                        <button
                            v-for="one in recent"
                            :key="one.id"
                            type="button"
                            class="recent-row"
                            :aria-label="
                                one.date +
                                ' ' +
                                one.category +
                                '，' +
                                (one.source === 'auto' ? '查看详情' : '修改记录') +
                                (one.note ? '，' + one.note : '')
                            "
                            @click="openEntry(one)"
                        >
                            <span class="recent-date" :title="one.date">{{
                                one.date.slice(5)
                            }}</span>
                            <span class="recent-title"
                                >{{ one.category
                                }}<small v-if="one.source === 'auto'" class="source-tag"
                                    >自动</small
                                ></span
                            >
                            <span
                                class="recent-who"
                                :title="
                                    characterName(roster, one.characterId) +
                                    ' · ' +
                                    one.channel +
                                    (one.note ? ' · ' + one.note : '')
                                "
                                >{{ characterName(roster, one.characterId) }}</span
                            >
                            <span
                                class="recent-amount"
                                :class="one.kind === 'income' ? 'in' : 'out'"
                                >{{
                                    ledgerMoneyText(
                                        one.kind === 'expense' ? -one.amount : one.amount,
                                        one.currency,
                                        { sign: 'always' },
                                    )
                                }}</span
                            >
                        </button>
                    </div>
                </LedgerSection>
            </div>

            <AccountCharts v-if="!loadError" :entries="scoped" :range="range" />
        </div>
        <WarehouseDialog v-if="warehouseOpen" @close="warehouseOpen = false" />
        <AccountRecords
            v-if="recordsOpen"
            v-model="historyFilters"
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
    </PageShell>
</template>

<style scoped src="./accounts-page.css"></style>
