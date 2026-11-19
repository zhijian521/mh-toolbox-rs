<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import TextButton from '../../components/TextButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { useMinuteNow } from '../../composables/use-minute-now';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useToday } from '../../composables/use-today';
import { ledgerMoneyText, toWan } from '../../services/format';
import { characterName, loadRoster, useRoster } from '../characters/roster';
import CardPriceDialog from './CardPriceDialog.vue';
import { clockText, ownersOf, sessionMinutes, type ReadonlyOnlineSession } from './online';
import { onlineSummaryItems } from './online-summary';
import { useOnline } from './online-store';

const emit = defineEmits<{ backfill: []; records: [] }>();

const {
    sessions,
    settings,
    setCardCost,
    setCardPrice,
    startOnline,
    stopOnline,
    flush,
    retry,
    pending,
    loadError,
    writeError,
} = useOnline();
const {
    roster,
    loadError: rosterError,
    writeError: rosterWriteError,
    pending: rosterPending,
} = useRoster();
const today = useToday();
const now = useMinuteNow();
const changing = ref(false);
const priceOpen = ref(false);
const priceSubmit = usePersistedSubmit(flush, retry);
const { saving, action, locked } = priceSubmit;
const controlsLocked = computed(
    () =>
        changing.value ||
        saving.value ||
        pending.value > 0 ||
        !!loadError.value ||
        !!writeError.value,
);

const running = computed(() => sessions.value.filter((one) => one.endAt === null));
/** 旧多人记录按完整名单判断在线状态，避免同一个角色重复开始。 */
const activeByRole = computed(() => {
    const active = new Map<string, ReadonlyOnlineSession>();
    for (const one of running.value) {
        for (const id of ownersOf(one)) active.set(id, one);
    }
    return active;
});
const roles = computed(() =>
    roster.value.map((one) => ({
        id: one.id,
        name: one.name || '未命名',
        session: activeByRole.value.get(one.id),
    })),
);
/** 名册中已删除的角色仍可结束计时，历史记录不因此丢失入口。 */
const unlisted = computed(() => {
    const ids = new Set(roster.value.map((one) => one.id));
    return running.value.filter((one) => ownersOf(one).every((id) => !ids.has(id)));
});
const onlineItems = computed<StatItem[]>(() =>
    loadError.value
        ? ['在线时长', '点卡花费'].map((cap, index) => ({
              id: index === 0 ? 'minutes' : 'cost',
              cap,
              value: '未读取',
              unavailable: true,
          }))
        : onlineSummaryItems(sessions.value, today.value, now.value),
);

const ticketsElement = ref<HTMLElement | null>(null);
const rolesElement = ref<HTMLElement | null>(null);
const roleRowHeight = ref<number>();

/** 仅并排三行时跟随收益票据高度；观察器不改宽度，行数不会因对齐反复切换。 */
watch(
    [ticketsElement, rolesElement, () => roles.value.length, rosterError, () => unlisted.value.length],
    ([tickets, list], _previous, onCleanup) => {
        roleRowHeight.value = undefined;
        if (!tickets || !list) return;
        let reference: HTMLElement | null = null;
        let frame = 0;
        const align = () => {
            frame = 0;
            const nextReference = tickets.querySelector<HTMLElement>('.income-summary') ?? tickets;
            if (reference !== nextReference) {
                if (reference && reference !== tickets) observer.unobserve(reference);
                reference = nextReference;
                observer.observe(reference);
            }
            const bounds = nextReference.getBoundingClientRect();
            const items = [...list.querySelectorAll<HTMLElement>('.role-item')].filter(
                (item) => item.getClientRects().length,
            );
            const rows = new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)));
            const beside =
                list.getBoundingClientRect().left >= tickets.getBoundingClientRect().right;
            const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
            const height =
                beside && rows.size === 3 && !rosterError.value && !unlisted.value.length
                    ? (bounds.height - gap * 2) / 3
                    : undefined;
            if (
                height === undefined ||
                roleRowHeight.value === undefined ||
                Math.abs(height - roleRowHeight.value) > 0.25
            ) {
                roleRowHeight.value = height;
            }
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(align);
        };
        schedule();
        const observer = new ResizeObserver(schedule);
        observer.observe(tickets);
        observer.observe(list);
        onCleanup(() => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        });
    },
    { flush: 'post' },
);

async function toggleCost(on: boolean) {
    if (controlsLocked.value) return;
    changing.value = true;
    try {
        const result = setCardCost(on);
        if (!result.ok) {
            notify.error(result.error);
            return;
        }
        if (await saved(flush)) {
            notify.success(on ? '之后的上线会记进账号收支' : '之后的上线不再记进账号收支');
        }
    } finally {
        changing.value = false;
    }
}

async function savePrice(amount: number) {
    const ok = await priceSubmit.run('save', () => {
        const result = setCardPrice(toWan(amount));
        if (!result.ok) notify.error(result.error);
        return result.ok;
    });
    if (!ok) return;
    notify.success('点卡按 ' + ledgerMoneyText(amount) + '/点 计');
    closePrice();
}

function closePrice() {
    if (saving.value) return;
    priceOpen.value = false;
    priceSubmit.reset();
}

async function startOne(id: string) {
    if (controlsLocked.value || rosterError.value || activeByRole.value.has(id)) return;
    if (!roster.value.some((one) => one.id === id)) return;
    changing.value = true;
    try {
        const result = startOnline({ characterIds: [id] });
        if (!result.ok) {
            notify.error(result.error);
            return;
        }
        if (await saved(flush)) notify.success(`${characterName(roster.value, id)} 已开始计时`);
    } finally {
        changing.value = false;
    }
}

async function stopOne(one: ReadonlyOnlineSession) {
    if (controlsLocked.value) return;
    changing.value = true;
    try {
        const result = stopOnline(ownersOf(one));
        if (!result.ok) {
            notify.error(result.error);
            return;
        }
        if (await saved(flush)) notify.success(`${whoText(one)} 的计时已结束`);
    } finally {
        changing.value = false;
    }
}

function whoText(one: ReadonlyOnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}
</script>

<template>
    <LedgerSection title="在线与点卡" plain class="online-bar" aria-label="在线与点卡">
        <template #actions>
            <div class="online-tools">
                <div class="online-actions" role="group" aria-label="上线记录管理">
                    <TextButton
                        text="补记"
                        label="补记一段已经过去的在线时长"
                        :disabled="controlsLocked"
                        @click="emit('backfill')"
                    />
                    <TextButton
                        text="记录"
                        label="查看全部上线记录"
                        @click="emit('records')"
                    />
                </div>
                <div class="card-settings" role="group" aria-label="点卡设置">
                    <button
                        type="button"
                        class="price-tag"
                        :title="`点卡单价 ${ledgerMoneyText(settings.cardPrice)}/点，点一下改`"
                        :aria-label="`点卡单价 ${ledgerMoneyText(settings.cardPrice)}/点，点一下改`"
                        :disabled="controlsLocked"
                        @click="priceOpen = true"
                    >
                        <span class="val">{{ ledgerMoneyText(settings.cardPrice) }}</span>
                        <span class="price-unit">/ 点</span>
                        <AppIcon name="edit" class="mark" />
                    </button>
                    <CostSwitch
                        :model-value="settings.cardCost"
                        off-label="不计入"
                        on-label="计入"
                        label="点卡计入账号收支"
                        :disabled="controlsLocked"
                        @update:model-value="toggleCost"
                    />
                </div>
            </div>
        </template>

        <div class="online-layout">
            <div ref="ticketsElement" class="online-tickets">
                <StatStrip
                    class="online-summary"
                    :items="onlineItems"
                    surface="embedded"
                    heading="今日在线"
                    icon="play"
                    aria-label="今日在线统计"
                />
                <slot name="summary" />
            </div>

            <div class="online-roster">
                <LoadNotice
                    :error="rosterError"
                    :load="loadRoster"
                    :blocked="changing || rosterPending > 0 || !!rosterWriteError"
                />
                <div
                    v-if="roles.length"
                    ref="rolesElement"
                    class="role-list"
                    :style="roleRowHeight ? { '--online-role-row-h': `${roleRowHeight}px` } : undefined"
                    aria-label="全部角色"
                >
                    <div
                        v-for="one in roles"
                        :key="one.id"
                        class="role-item"
                        :class="{ 'is-running': one.session }"
                        :data-character-id="one.id"
                    >
                        <button
                            type="button"
                            class="role-start"
                            :disabled="!!one.session || controlsLocked || !!rosterError"
                            :title="one.session ? `${one.name} 正在计时` : `点击上线 ${one.name}`"
                            :aria-label="
                                one.session ? `${one.name} 正在计时` : `快速上线 ${one.name}`
                            "
                            @click="startOne(one.id)"
                        >
                            <span class="role-copy">
                                <span class="name">{{ one.name }}</span>
                                <span v-if="one.session" class="role-state">
                                    {{ clockText(sessionMinutes(one.session, now)) }}
                                </span>
                            </span>
                        </button>
                        <button
                            v-if="one.session"
                            type="button"
                            class="role-stop"
                            :disabled="controlsLocked"
                            :title="`结束 ${whoText(one.session)} 的计时`"
                            :aria-label="`结束 ${whoText(one.session)} 的计时`"
                            @click="stopOne(one.session)"
                        >
                            <AppIcon name="stop" />
                        </button>
                    </div>
                </div>
                <p v-else-if="!rosterError" class="idle">添加角色后，点一下即可上线</p>
                <div v-if="unlisted.length" class="unlisted" aria-label="名册外正在计时的记录">
                    <div v-for="one in unlisted" :key="one.id" class="unlisted-row">
                        <span class="name">{{ whoText(one) }}</span>
                        <span class="role-state">{{ clockText(sessionMinutes(one, now)) }}</span>
                        <button
                            type="button"
                            class="role-stop"
                            :disabled="controlsLocked"
                            :title="`结束 ${whoText(one)} 的计时`"
                            :aria-label="`结束 ${whoText(one)} 的计时`"
                            @click="stopOne(one)"
                        >
                            <AppIcon name="stop" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <CardPriceDialog
            v-if="priceOpen"
            :current="settings.cardPrice"
            :card-cost="settings.cardCost"
            :saving="saving"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="savePrice"
            @close="closePrice"
        />
    </LedgerSection>
</template>

<style scoped>
.online-bar {
    min-width: 0;
}
.online-bar :deep(.section-head) {
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 20px;
    margin-bottom: 18px;
}
.online-bar :deep(.section-actions) {
    min-width: 0;
}
.online-tools,
.card-settings,
.online-actions {
    display: flex;
    align-items: center;
}
.online-tools {
    --online-action-h: calc(26px * var(--fs-scale));
    --text-button-h: var(--online-action-h);

    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px 16px;
}
.card-settings,
.online-actions {
    gap: 8px;
}
.price-tag {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 7px;
    height: var(--online-action-h);
    padding: 0 9px;
    border: var(--w-hair) solid var(--rule);
    border-radius: var(--r-2);
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
.price-tag:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
    background-color: color-mix(in srgb, var(--accent) 7%, var(--paper));
}
.price-tag .val {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
.price-unit {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.mark {
    --icon-size: calc(11px * var(--fs-scale));
    color: var(--muted);
}
.online-layout {
    display: grid;
    grid-template-columns: minmax(0, 600px) minmax(220px, 1fr);
    align-items: start;
    gap: 24px;
    min-width: 0;
}
.online-tickets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 14px;
    min-width: 0;
    width: 100%;
    max-width: 600px;
}
/* 本页四个昨日对比保持短文案；窄列完整换行，不挤成省略号。 */
.online-tickets :deep(.subrow) {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 6px;
}
.online-tickets :deep(.sub) {
    flex: 0 1 auto;
    max-width: 100%;
    overflow: visible;
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
}
.online-tickets :deep(.delta) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}
.online-roster {
    min-width: 0;
}
.role-state,
.idle {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.role-list {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
}
.role-item {
    display: flex;
    flex: none;
    align-items: center;
    width: min(100%, calc(156px * var(--fs-scale)));
    min-width: 0;
    min-height: var(--online-role-row-h, auto);
    border: var(--w-hair) solid var(--rule);
    border-radius: var(--r-ticket);
    background: var(--paper);
    box-shadow: 0 2px 0 var(--rule);
    transition: border-color var(--t-quick) var(--ease-soft);
}
.role-item::before {
    content: '';
    flex: none;
    width: 3px;
    height: 12px;
    margin-left: -1px;
    border-radius: var(--r-1);
    background: var(--rule-2);
}
.role-item:has(.role-start:hover:not(:disabled)) {
    border-color: var(--rule-2);
}
.role-start {
    display: flex;
    flex: 1;
    align-self: stretch;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: calc(34px * var(--fs-scale));
    padding: 5px 8px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
.role-start:hover:not(:disabled) {
    color: var(--accent);
}
.role-copy {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px 6px;
    min-width: 0;
}
.name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--fs-xs);
}
.role-state {
    font-variant-numeric: tabular-nums;
}
.is-running {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--rule));
}
.is-running::before {
    background: var(--accent);
}
.is-running .role-start:disabled {
    opacity: 1;
    cursor: default;
}
.is-running .role-state {
    color: var(--num);
}
.role-stop {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: calc(24px * var(--fs-scale));
    height: calc(24px * var(--fs-scale));
    margin-right: 4px;
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition:
        color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
.role-stop .app-icon {
    --icon-size: calc(13px * var(--fs-scale));
}
.role-stop:hover:not(:disabled) {
    background: color-mix(in srgb, var(--negative) 8%, transparent);
    color: var(--negative);
}
.price-tag:focus-visible,
.role-start:focus-visible,
.role-stop:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.idle {
    margin: 0;
    font-size: var(--fs-sm);
}
.unlisted {
    display: grid;
    gap: 6px;
    margin-top: 10px;
}
.unlisted-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.unlisted-row .name {
    flex: 1;
}
@container income (max-width: 900px) {
    .online-layout {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
    }
}
@container income (max-width: 520px) {
    .online-tickets {
        grid-template-columns: minmax(0, 1fr);
        max-width: 340px;
    }
    .card-settings {
        flex-wrap: wrap;
    }
}
</style>
