<script setup lang="ts">
import { useRouteAction } from '../../composables/use-route-action';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import SaveNotice from '../../components/SaveNotice.vue';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import type { QuickItemEntry } from '../../services/game-data';
import { daysAgo, parseDay, toWan } from '../../services/format';
import { amountText, entriesOn, factsOf, recordSummary, statRowsOf, totalsOf } from './income';
import { useIncome } from './income-store';
import IncomeHistoryDialog from './IncomeHistoryDialog.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import OnlineBar from './OnlineBar.vue';
import OnlineDialog from './OnlineDialog.vue';
import OnlinePanel from './OnlinePanel.vue';
import OnlineRecords from './OnlineRecords.vue';
import QuickPanel from './QuickPanel.vue';
import TodayDump from './TodayDump.vue';
import { type OnlineSession } from './online';
import { useOnline } from './online-store';
import { useDailySync } from '../accounts/daily-sync';
import { useRoster } from '../characters/roster';

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
} = useIncome();
const { roster } = useRoster();

const today = useToday();

const scoped = computed(() => entriesOn(entries.value, today.value));

const previousTotals = computed(() =>
    totalsOf(entriesOn(entries.value, daysAgo(1, parseDay(today.value)))),
);

const totals = computed(() => totalsOf(scoped.value));

const statItems = computed<StatItem[]>(() =>
    statRowsOf(totals.value, previousTotals.value, factsOf(scoped.value)),
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
const editTarget = ref<OnlineSession | null>(null);
const recordsOpen = ref(false);
const onlineCharacterIds = ref<string[]>([]);

function editOnline(one: OnlineSession) {
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
        if (ask.thenAdd) {
            const result = recordEntry({ item: ask.item.name, amount });
            if (!result.ok) {
                notify.error(result.error);
                return false;
            }
            priceMessage = recordSummary(ask.item.name, result.entries);
        } else {
            if (!setPrice(ask.item.id, toWan(amount))) {
                notify.error('单价未修改，请检查金额和账本读取状态');
                return false;
            }
            priceMessage = '「' + ask.item.name + '」的单价已记为 ' + amountText(amount);
        }
        if (ask.mode === 'fixed' && ask.thenAdd) setPrice(ask.item.id, toWan(amount));
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
        clearPrice(ask.item.id);
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
        historyOpen.value = true;
    },
    start(query) {
        onlineCharacterIds.value = typeof query.character === 'string' ? [query.character] : [];
        onlineDialog.value = 'start';
    },
    backfill(query) {
        onlineCharacterIds.value = typeof query.character === 'string' ? [query.character] : [];
        onlineDialog.value = 'backfill';
    },
    records() {
        recordsOpen.value = true;
    },
});
</script>

<template>
    <PageShell title="收益" desc="物品速记 · 按天分账">
        <template #actions>
            <PressButton
                icon="history"
                text="历史"
                label="查看历史收益，按角色与按天"
                @click="historyOpen = true"
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

        <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <p v-if="onlineLoadError" class="note error" role="alert">{{ onlineLoadError }}</p>
        <SaveNotice :error="onlineWriteError" :pending="onlinePending" @retry="retryOnline" />
        <SaveNotice :error="syncError" :pending="syncPending" @retry="retrySync" />

        <div class="income-stack">
            <StatStrip :items="statItems" />

            <OnlineBar @records="recordsOpen = true" @backfill="onlineDialog = 'backfill'" />

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

        <IncomeHistoryDialog v-if="historyOpen" @close="historyOpen = false" />

        <OnlineDialog
            v-if="onlineDialog"
            :mode="onlineDialog"
            :character-ids="onlineCharacterIds"
            :session="editTarget ?? undefined"
            @close="closeOnlineDialog"
        />

        <OnlineRecords v-if="recordsOpen" @close="recordsOpen = false" @edit="editOnline" />
    </PageShell>
</template>

<style scoped>
.income-stack {
    display: flex;
    flex-direction: column;

    gap: 16px;
}

.income-stack :deep(.board) {
    background-image: var(--income-board-texture);
}

.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
    align-items: stretch;
}
</style>
