<script setup lang="ts">
import { lazyDialog } from '../../components/lazy-dialog';
import { useRouteAction } from '../../composables/use-route-action';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import SaveNotice from '../../components/SaveNotice.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import { useRecordFilters } from '../../composables/use-record-filters';
import { ALL_OPTIONS } from '../../components/select-options';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import type { QuickItemEntry } from '../../services/game-data';
import { daysAgo, ledgerMoneyText, parseDay, toWan } from '../../services/format';
import { amountText, entriesOn, factsOf, recordSummary, statRowsOf, totalsOf } from './income';
import { loadIncome, useIncome } from './income-store';
import OnlineBar from './OnlineBar.vue';
import OnlinePanel from './OnlinePanel.vue';
import QuickPanel from './QuickPanel.vue';
import TodayDump from './TodayDump.vue';
import { type ReadonlyOnlineSession } from './online';
import { loadOnline, useOnline } from './online-store';
import { useDailySync } from '../accounts/daily-sync';
import { useRoster } from '../characters/roster';

const IncomeHistoryDialog = lazyDialog(() => import('./IncomeHistoryDialog.vue'));
const ItemPriceDialog = lazyDialog(() => import('./ItemPriceDialog.vue'));
const OnlineDialog = lazyDialog(() => import('./OnlineDialog.vue'));
const OnlineRecords = lazyDialog(() => import('./OnlineRecords.vue'));

const {
    entries,
    loadError,
    writeError,
    recordEntry,
    setPrice,
    clearPrice,
    prices,
    pending,
    flush,
    retry,
    setTarget,
    target,
} = useIncome();
const { roster } = useRoster();

const today = useToday();

const scoped = computed(() => entriesOn(entries.value, today.value));

const previousTotals = computed(() =>
    totalsOf(entriesOn(entries.value, daysAgo(1, parseDay(today.value)))),
);

const totals = computed(() => totalsOf(scoped.value));

const statItems = computed<StatItem[]>(() =>
    statRowsOf(totals.value, previousTotals.value, factsOf(scoped.value))
        .filter((row) => row.cap === '净额' || row.cap === '笔数')
        .map((row) => ({
            ...row,
            sub:
                row.cap === '净额'
                    ? `昨日${ledgerMoneyText(previousTotals.value.net, 'cash', {
                          sign: 'auto',
                          zero: 'dash',
                      }).replaceAll(' ', '')}`
                    : `昨日${previousTotals.value.count}笔`,
        })),
);

interface PriceAsk {
    item: QuickItemEntry;
    mode: 'fixed' | 'variable';
    thenAdd: boolean;
}
const priceAsk = ref<PriceAsk | null>(null);
const priceSubmit = usePersistedSubmit(flush, retry);
const { saving: priceSaving, action: priceAction, locked: priceLocked } = priceSubmit;
let priceMessage = '';

function closePrice() {
    if (priceSaving.value) return;
    priceAsk.value = null;
    priceSubmit.reset();
}

const historyOpen = ref(false);
const { filters: historyFilters, syncScope } = useRecordFilters(
    () => ({ from: today.value, to: today.value, who: target.value[0] || ALL_OPTIONS }),
    { page: 1, scrollTop: 0 },
);
function openHistory() {
    syncScope();
    historyOpen.value = true;
}
const { error: syncError, pending: syncPending, retry: retrySync } = useDailySync();

const {
    sessions,
    stopOnline,
    loadError: onlineLoadError,
    writeError: onlineWriteError,
    pending: onlinePending,
    flush: flushOnline,
    retry: retryOnline,
} = useOnline();

const running = computed(() => sessions.value.filter((one) => one.endAt === null));

const onlineDialog = ref<'start' | 'backfill' | 'edit' | null>(null);
const editTarget = ref<ReadonlyOnlineSession | null>(null);
const recordsOpen = ref(false);
const { filters: onlineFilters, syncScope: syncOnlineScope } = useRecordFilters(
    () => ({ from: today.value, to: today.value, who: ALL_OPTIONS }),
    { keyword: '', page: 1, scrollTop: 0 },
);
function openRecords() {
    syncOnlineScope();
    recordsOpen.value = true;
}
const onlineCharacterIds = ref<string[]>([]);

function editOnline(one: ReadonlyOnlineSession) {
    editTarget.value = one;
    onlineDialog.value = 'edit';
}

function closeOnlineDialog() {
    onlineDialog.value = null;
    editTarget.value = null;
    onlineCharacterIds.value = [];
}

async function finishOnline() {
    const result = stopOnline();
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flushOnline)) notify.success('已结束计时');
}

function askPrice(item: QuickItemEntry, mode: 'fixed' | 'variable', thenAdd: boolean) {
    priceAsk.value = { item, mode, thenAdd };
}

async function priceSaved(amount: number) {
    const ask = priceAsk.value;
    if (!ask) return;
    const ok = await priceSubmit.run('save', () => {
        if (ask.mode === 'fixed' && !setPrice(ask.item.id, toWan(amount))) {
            notify.error(writeError.value || '单价未修改，请检查金额和账本读取状态');
            return false;
        }
        if (ask.thenAdd) {
            const result = recordEntry({ item: ask.item.name, amount });
            if (!result.ok) {
                notify.error(result.error);
                return false;
            }
            priceMessage = recordSummary(ask.item.name, result.entries);
        } else {
            priceMessage = '「' + ask.item.name + '」的单价已记为 ' + amountText(amount);
        }
        return true;
    });
    if (!ok) return;
    notify.success(priceMessage);
    closePrice();
}

async function priceCleared() {
    const ask = priceAsk.value;
    if (!ask) return;
    const ok = await priceSubmit.run('clear', () => {
        if (!clearPrice(ask.item.id)) {
            notify.error('单价未清除，请检查账本状态后重试');
            return false;
        }
        return true;
    });
    if (!ok) return;
    notify.success('「' + ask.item.name + '」的单价已清除');
    closePrice();
}
useRouteAction('/income', {
    quick(query) {
        const character = roster.value.find((one) => one.id === query.character);
        if (character) setTarget([character.id]);
    },
    history() {
        openHistory();
    },
    start(query) {
        onlineCharacterIds.value = typeof query.character === 'string' ? [query.character] : [];
        onlineDialog.value = 'start';
    },
    backfill(query) {
        onlineCharacterIds.value = typeof query.character === 'string' ? [query.character] : [];
        onlineDialog.value = 'backfill';
    },
    records: openRecords,
});
</script>

<template>
    <PageShell title="收益" desc="物品速记 · 按天分账">
        <template #actions>
            <PressButton
                icon="history"
                text="历史"
                label="查看历史收益，按角色与按天"
                @click="openHistory"
            />

            <PressButton
                v-if="running.length"
                icon="stop"
                text="结束"
                :label="`结束全部计时（${running.length} 个号在线）`"
                @click="finishOnline"
            />

            <PressButton
                icon="play"
                text="上线"
                label="开始计时（可以随时再加号）"
                seal
                @click="onlineDialog = 'start'"
            />
        </template>

        <LoadNotice
            :error="loadError"
            :load="loadIncome"
            :blocked="pending > 0 || !!writeError || !!priceAsk"
        />
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <LoadNotice
            :error="onlineLoadError"
            :load="loadOnline"
            :blocked="onlinePending > 0 || !!onlineWriteError || !!onlineDialog"
        />
        <SaveNotice :error="onlineWriteError" :pending="onlinePending" @retry="retryOnline" />
        <SaveNotice :error="syncError" :pending="syncPending" @retry="retrySync" />

        <div class="income-stack">
            <OnlineBar @records="openRecords" @backfill="onlineDialog = 'backfill'">
                <template v-if="!loadError" #summary>
                    <StatStrip
                        class="income-summary"
                        :items="statItems"
                        surface="embedded"
                        heading="今日收益"
                        icon="coins"
                        aria-label="今日收益统计"
                    />
                </template>
            </OnlineBar>

            <div class="split">
                <QuickPanel @need-price="askPrice" />
                <TodayDump />
            </div>

            <OnlinePanel />
        </div>

        <ItemPriceDialog
            v-if="priceAsk"
            :item="priceAsk.item"
            :mode="priceAsk.mode"
            :then-add="priceAsk.thenAdd"
            :current="prices[priceAsk.item.id] ?? 0"
            :saving="priceSaving"
            :locked="priceLocked"
            :retry-action="priceAction"
            :save-error="writeError"
            @save="priceSaved"
            @clear="priceCleared"
            @close="closePrice"
        />

        <IncomeHistoryDialog
            v-if="historyOpen"
            v-model="historyFilters"
            @close="historyOpen = false"
        />

        <OnlineDialog
            v-if="onlineDialog"
            :mode="onlineDialog"
            :character-ids="onlineCharacterIds"
            :session="editTarget ?? undefined"
            @close="closeOnlineDialog"
        />

        <OnlineRecords
            v-if="recordsOpen"
            v-model="onlineFilters"
            @close="recordsOpen = false"
            @edit="editOnline"
        />
    </PageShell>
</template>

<style scoped>
.income-stack {
    container: income / inline-size;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}

.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
    gap: 16px;
    align-items: stretch;
}

/* 按内容区宽度收列，侧栏和窗口宽度变化使用同一条边界。 */
@container income (max-width: 760px) {
    .split {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
