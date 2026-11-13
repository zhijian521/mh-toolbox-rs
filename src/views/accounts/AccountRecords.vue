<script setup lang="ts">
import { ALL_OPTIONS as ALL } from '../../components/select-options';
import { computed, ref, watch } from 'vue';
import { ledgerMoneyText } from '../../services/format';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import SelectField from '../../components/SelectField.vue';
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
    accountStats,
    newestFirst,
    type AccountEntry,
} from './accounts';
import { BOOK_OPTIONS, accountValueText, filterAccounts } from './account-analysis';
import { useAccounts } from './accounts-store';

const emit = defineEmits<{ close: []; edit: [entry: AccountEntry] }>();
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
const currency = ref(ALL);
const kind = ref(ALL);
const category = ref(ALL);
const channel = ref(ALL);
const who = ref(ALL);
const source = ref(ALL);
const from = ref('');
const to = ref('');
const keyword = ref('');
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
            [one.category, one.note, one.channel, characterName(roster.value, one.characterId)]
                .join(' ')
                .toLocaleLowerCase()
                .includes(word),
    );
});
const { page, pages, visible } = usePagination(filtered);
const sums = computed(() =>
    BOOK_OPTIONS.filter((one) => currency.value === ALL || currency.value === one.value).map(
        (one) => ({
            currency: one.value,
            stats: accountStats(filtered.value, one.value),
        }),
    ),
);
const anyFilter = computed(
    () =>
        [currency, kind, category, channel, who, source].some((one) => one.value !== ALL) ||
        Boolean(from.value || to.value || keyword.value.trim()),
);
watch([currency, kind, category, channel, who, source, from, to, keyword], () => {
    page.value = 1;
});
function reset() {
    for (const field of [currency, kind, category, channel, who, source]) field.value = ALL;
    from.value = '';
    to.value = '';
    keyword.value = '';
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
                accountValueText(one.amount, one.currency),
            confirmText: '删除',
        },
        () => removeEntry(one.id),
    );
    if (ok) notify.success('已删除记录');
}
</script>

<template>
    <ModalShell
        title="历史记录"
        :width="960"
        min-height="min(620px, calc(100vh - 48px))"
        fill
        @close="!removing && emit('close')"
    >
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <div class="record-filters">
            <DateField v-model="from" label="账号历史开始日期" :max="to" />
            <span class="date-separator">至</span>
            <DateField v-model="to" label="账号历史结束日期" :min="from" />
            <SelectField
                v-model="source"
                :options="sourceOptions"
                label="来源筛选"
                class="f-pick"
            />
            <input
                v-model="keyword"
                class="field f-search"
                type="search"
                placeholder="搜索备注、分类、角色"
                aria-label="搜索记录"
                autocomplete="off"
            />
            <PressButton v-if="anyFilter" text="重置" label="清空筛选" @click="reset" />
        </div>
        <div class="record-filters">
            <SelectField
                v-model="currency"
                :options="currencyOptions"
                label="币种筛选"
                class="f-pick"
            />
            <SelectField v-model="kind" :options="kindOptions" label="方向筛选" class="f-pick" />
            <SelectField
                v-model="category"
                :options="categoryOptions"
                label="分类筛选"
                class="f-pick"
            />
            <SelectField
                v-model="channel"
                :options="channelOptions"
                label="渠道筛选"
                class="f-pick"
            />
            <SelectField v-model="who" :options="whoOptions" label="角色筛选" class="f-pick" />
        </div>
        <div class="record-summary">
            <div v-for="one in sums" :key="one.currency" class="sum">
                <span>{{ CURRENCY_META[one.currency].label }}</span>
                <span :class="{ in: one.stats.income > 0 }"
                    >收 {{ accountValueText(one.stats.income, one.currency) }}</span
                >
                <span :class="{ out: one.stats.expense > 0 }"
                    >支 {{ accountValueText(one.stats.expense, one.currency) }}</span
                >
                <span :class="{ out: one.stats.net < 0, in: one.stats.net > 0 }"
                    >差额 {{ accountValueText(one.stats.net, one.currency) }}</span
                >
            </div>
        </div>
        <div class="income-log-scroll">
            <p v-if="!filtered.length" class="record-empty">
                {{ loadError || (entries.length ? '这个筛选下没有记录' : '还没有账号记录') }}
            </p>
            <table v-else class="income-table rec-table">
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
                            {{ one.category }}<small v-if="one.source === 'auto'">自动同步</small>
                        </td>
                        <td class="c-note" :title="one.note">{{ one.note }}</td>
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
            </table>
        </div>
        <template #footer>
            <span class="record-foot-note"
                >{{ filtered.length }} 笔{{ anyFilter ? ' · 已筛选' : '' }}</span
            >
            <RecordPager v-model="page" :pages="pages" />
            <PressButton
                data-modal-cancel
                text="关闭"
                label="关闭账号历史记录"
                :disabled="removing"
                @click="emit('close')"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.f-pick {
    flex: 1 1 120px;
    min-width: 110px;
}
.f-search {
    flex: 2 1 180px;
    min-width: 120px;
}
.date-separator {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.sum {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-variant-numeric: tabular-nums;
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
