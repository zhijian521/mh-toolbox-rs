<script setup lang="ts">
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
import SaveNotice from '../../components/SaveNotice.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { notify } from '../../composables/use-notify';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { characterName, useRoster } from '../characters/roster';
import { characterOptions } from '../characters/character-options';
import AccountCharts from './AccountCharts.vue';
import AccountFlowCard from './AccountFlowCard.vue';
import AccountEditor from './AccountEditor.vue';
import AccountRecords from './AccountRecords.vue';
import {
    CURRENCY_META,
    RANGE_PRESETS,
    SHORTCUTS,
    accountStats,
    newestFirst,
    rangeOf,
    type AccountEntry,
    type RangePreset,
} from './accounts';
import { accountValueText, filterAccounts, shortcutTotal } from './account-analysis';
import { useAccounts, type EntryInput } from './accounts-store';

const { entries, loadError, writeError, addEntry, updateEntry, pending, flush, retry } =
    useAccounts();
const { roster } = useRoster();
const preset = ref<RangePreset>('month');
const who = ref(ALL_ACCOUNTS);
const whoOptions = computed(() =>
    characterOptions(
        roster.value,
        entries.value.map((one) => one.characterId),
        { all: true, unassigned: '未指定' },
    ),
);
const today = useToday();
const range = computed(() => rangeOf(preset.value, today.value));
const scoped = computed(() =>
    filterAccounts(entries.value, { ...range.value, characterId: who.value }),
);
const books = computed(() =>
    (['rmb', 'cash'] as const).map((currency) => ({
        currency,
        meta: CURRENCY_META[currency],
        stats: accountStats(scoped.value, currency),
    })),
);
const shortcuts = computed(() =>
    SHORTCUTS.map((one) => ({
        ...one,
        description: one.id === 'game-income' ? '游戏内 · 手动产出' : one.hint,
        total: shortcutTotal(scoped.value, one.preset),
    })),
);
const recent = computed(() => newestFirst(scoped.value).slice(0, 8));
const editing = ref<{ entry?: AccountEntry; seed?: Partial<EntryInput> } | null>(null);
const recordsOpen = ref(false);
const submission = usePersistedSubmit(flush, retry);
const { saving, locked, action } = submission;

function openBlank(seed?: Partial<EntryInput>) {
    submission.reset();
    editing.value = {
        seed: {
            characterId: roster.value.some((one) => one.id === who.value) ? who.value : '',
            ...seed,
        },
    };
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
        recordsOpen.value = true;
    },
});
</script>

<template>
    <PageShell title="账号" desc="人民币与梦幻币，两本独立的账">
        <template #actions>
            <PressButton
                icon="history"
                text="历史"
                label="查看账号历史记录"
                @click="recordsOpen = true"
            />
            <PressButton
                icon="add"
                text="记一笔"
                label="记一笔账号收支"
                seal
                @click="openBlank()"
            />
        </template>
        <div class="accounts-layout">
            <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
            <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
            <PaperCard class="filters">
                <SegmentedPills v-model="preset" :options="RANGE_PRESETS" label="账目时间范围" />
                <SelectField
                    v-model="who"
                    :options="whoOptions"
                    label="按角色筛选"
                    class="who-pick"
                />
                <span class="range-text">{{
                    range.from ? range.from + ' 至 ' + range.to : '全部时间'
                }}</span>
            </PaperCard>

            <div class="books">
                <PaperCard v-for="book in books" :key="book.currency" as="article" class="book">
                    <header class="book-head">
                        <h2>{{ book.meta.label }}</h2>
                        <span class="book-count">{{ book.stats.count }} 笔</span>
                    </header>
                    <div class="metrics">
                        <div>
                            <span>收入</span
                            ><b :class="{ in: book.stats.income > 0 }">{{
                                accountValueText(book.stats.income, book.currency)
                            }}</b>
                        </div>
                        <div>
                            <span>支出</span
                            ><b :class="{ out: book.stats.expense > 0 }">{{
                                accountValueText(book.stats.expense, book.currency)
                            }}</b>
                        </div>
                        <div>
                            <span>差额</span
                            ><b :class="{ out: book.stats.net < 0, in: book.stats.net > 0 }">{{
                                accountValueText(book.stats.net, book.currency)
                            }}</b>
                        </div>
                    </div>
                </PaperCard>
            </div>

            <LedgerSection title="快捷记账" hint="当前范围合计">
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
                        <PressTile class="shortcut-face" wide>
                            <span class="shortcut-body">
                                <span class="sc-icon" aria-hidden="true"
                                    ><AppIcon :name="one.icon"
                                /></span>
                                <span class="sc-copy">
                                    <span class="sc-title">{{ one.title }}</span>
                                    <small>{{ one.description }}</small>
                                </span>
                                <span
                                    class="sc-total"
                                    :title="one.preset.kind === 'income' ? '收入合计' : '支出合计'"
                                >
                                    <span>{{
                                        accountValueText(one.total.amount, one.preset.currency)
                                    }}</span>
                                    <small>{{ one.total.count }} 笔</small>
                                </span>
                            </span>
                        </PressTile>
                    </button>
                </div>
            </LedgerSection>

            <AccountCharts :entries="scoped" :range="range" />

            <div class="account-bottom">
                <AccountFlowCard :entries="scoped" group="channel" class="channel-card" />
                <LedgerSection
                    title="最近记录"
                    :hint="scoped.length + ' 笔 · 最近八笔'"
                    class="records"
                >
                    <p v-if="!recent.length" class="blank">这个范围还没有记录</p>
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
        </div>
        <AccountRecords v-if="recordsOpen" @close="recordsOpen = false" @edit="openEntry" />
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
