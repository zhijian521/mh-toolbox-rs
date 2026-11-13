<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { useMinuteNow } from '../../composables/use-minute-now';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { moneyText, toWan } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import CardPriceDialog from './CardPriceDialog.vue';
import {
    clockText,
    minutesText,
    onlineTotalsOf,
    ownersOf,
    sessionMinutes,
    type OnlineSession,
} from './online';
import { useOnline } from './online-store';

const emit = defineEmits<{ backfill: []; records: [] }>();

const { sessions, settings, setCardCost, setCardPrice, stopOnline, flush, retry } = useOnline();
const { roster } = useRoster();
const today = useToday();
const now = useMinuteNow();
const priceSubmit = usePersistedSubmit(flush, retry);
const { saving, action, locked } = priceSubmit;

const running = computed(() => sessions.value.filter((one) => one.endAt === null));

const totals = computed(() => onlineTotalsOf(sessions.value, today.value, today.value, now.value));

async function toggleCost(on: boolean) {
    const result = setCardCost(on);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flush)) {
        notify.success(on ? '之后的上线会记进账号收支' : '之后的上线不再记进账号收支');
    }
}

const priceOpen = ref(false);

async function savePrice(amount: number) {
    const ok = await priceSubmit.run('save', () => {
        const result = setCardPrice(toWan(amount));
        if (!result.ok) notify.error(result.error);
        return result.ok;
    });
    if (!ok) return;
    notify.success('点卡按 ' + moneyText(amount) + '/点 计');
    closePrice();
}

function closePrice() {
    if (saving.value) return;
    priceOpen.value = false;
    priceSubmit.reset();
}

async function stopOne(one: OnlineSession) {
    const result = stopOnline([one.characterId]);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flush)) notify.success(`${whoText(one)} 的计时已结束`);
}

function whoText(one: OnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}
</script>

<template>
    <PaperCard as="section" class="online-bar" aria-label="在线与点卡">
        <div class="online-summary">
            <div class="card-settings" role="group" aria-label="点卡设置">
                <CostSwitch
                    :model-value="settings.cardCost"
                    off-label="不计"
                    on-label="计入"
                    label="点卡计入账号收支"
                    @update:model-value="toggleCost"
                />
                <button
                    type="button"
                    class="price-tag"
                    :title="`点卡单价 ${moneyText(settings.cardPrice)}/点，点一下改`"
                    :aria-label="`点卡单价 ${moneyText(settings.cardPrice)}/点，点一下改`"
                    @click="priceOpen = true"
                >
                    <span class="val">{{ moneyText(settings.cardPrice) }}</span>
                    <span class="price-unit">/ 点</span>
                    <AppIcon name="edit" class="mark" />
                </button>
            </div>

            <div class="online-totals" role="group" aria-label="今日在线合计">
                <div class="readout">
                    <span class="cap">今日在线</span>
                    <span class="val">{{
                        totals.minutes ? minutesText(totals.minutes) : '—'
                    }}</span>
                </div>
                <div class="readout">
                    <span class="cap">今日点卡</span>
                    <span class="val" :class="{ cost: totals.cost > 0 }">{{
                        totals.cost > 0 ? moneyText(totals.cost) : '—'
                    }}</span>
                </div>
            </div>
        </div>

        <div class="online-roster">
            <div v-if="running.length" class="live-list" aria-label="正在计时的角色">
                <button
                    v-for="one in running"
                    :key="one.id"
                    type="button"
                    class="live-chip"
                    :title="`结束 ${whoText(one)} 的计时`"
                    :aria-label="`结束 ${whoText(one)} 的计时`"
                    @click="stopOne(one)"
                >
                    <span class="dot" aria-hidden="true" />
                    <span class="name">{{ whoText(one) }}</span>
                    <span class="time">{{ clockText(sessionMinutes(one, now)) }}</span>
                    <AppIcon name="close" class="mark" />
                </button>
            </div>
            <p v-else class="idle">暂无在线角色</p>

            <div class="online-actions" role="group" aria-label="上线记录管理">
                <PressButton
                    icon="flask"
                    text="补记"
                    size="sm"
                    label="补记一段已经过去的在线时长"
                    @click="emit('backfill')"
                />
                <PressButton
                    icon="history"
                    text="记录"
                    size="sm"
                    label="查看全部上线记录"
                    @click="emit('records')"
                />
            </div>
        </div>

        <CardPriceDialog
            v-if="priceOpen"
            :current="settings.cardPrice"
            :card-cost="settings.cardCost"
            :saving="saving"
            :locked="locked"
            :retrying="action !== null"
            @save="savePrice"
            @close="closePrice"
        />
    </PaperCard>
</template>

<style scoped>
.online-bar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 18px;
    min-width: 0;
}

.online-summary,
.card-settings,
.online-totals,
.readout,
.online-actions {
    display: flex;
    align-items: center;
}
.online-summary {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px 24px;
}
.card-settings {
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
}
.online-totals {
    flex-wrap: wrap;
    gap: 8px 24px;
}
.readout {
    gap: 10px;
    min-height: calc(26px * var(--fs-scale));
}
.cap {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-xs);
    white-space: nowrap;
}
.val {
    color: var(--num);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.val.cost {
    color: var(--negative);
}

.price-tag,
.live-chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 7px;
    min-height: calc(26px * var(--fs-scale));
    border: var(--w-hair) solid var(--rule);
    background: color-mix(in srgb, var(--well) 24%, transparent);
    color: var(--ink-2);
    font-family: inherit;
    font-size: var(--fs-sm);
    white-space: nowrap;
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
.price-tag {
    padding: 2px 9px;
    border-radius: var(--r-2);
}
.price-unit {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.price-tag:hover,
.live-chip:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
    background-color: color-mix(in srgb, var(--accent) 7%, var(--paper));
}
.price-tag:focus-visible,
.live-chip:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.mark {
    --icon-size: calc(11px * var(--fs-scale));
    flex: none;
    color: var(--muted);
}
.price-tag:hover .mark,
.live-chip:hover .mark {
    color: var(--accent);
}

.online-roster {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    border-top: var(--w-hair) solid var(--rule);
}
/* 角色只横向滚动，操作入口始终留在右端。 */
.live-list {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 2px 2px calc(2px + var(--scrollbar-w));
    margin: -2px -2px calc(-2px - var(--scrollbar-w));
    overflow-x: auto;
    overflow-y: hidden;
}
.live-chip {
    gap: 8px;
    padding: 2px 10px;
    border-radius: var(--r-pill);
}
.dot {
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: var(--r-pill);
    background: var(--positive);
}
.name {
    flex: none;
    max-width: 10em;
    overflow: hidden;
    text-overflow: ellipsis;
}
.time {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
.online-actions {
    flex: none;
    gap: 8px;
    padding-left: 12px;
    border-left: var(--w-hair) solid var(--rule);
}
.idle {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
