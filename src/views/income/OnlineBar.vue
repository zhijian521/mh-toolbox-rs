<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import KeycapButton from '../../components/KeycapButton.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassSmallSwitch from '../../components/liquid-glass/GlassSmallSwitch.vue';
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

defineProps<{ reloadRoster?: () => Promise<void> }>();
const emit = defineEmits<{ backfill: []; records: [] }>();
const glass = inject(glassLedger, null);

const {
    sessions,
    settings,
    loaded,
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
    loadError.value || (glass && !loaded.value)
        ? ['在线时长', '点卡花费'].map((cap, index) => ({
              id: index === 0 ? 'minutes' : 'cost',
              cap,
              value: '未读取',
              unavailable: true,
          }))
        : onlineSummaryItems(sessions.value, today.value, now.value),
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

async function toggleRole(id: string) {
    if (controlsLocked.value) return;
    // 点击时读取当前会话，不使用上一拍模板状态；保存锁同步生效，连点不会反向切换。
    const session = activeByRole.value.get(id);
    if (session) await stopOne(session);
    else await startOne(id);
}

function whoText(one: ReadonlyOnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}

function roleButtonAttrs(active: boolean, label: string) {
    return glass
        ? { size: 'small', 'aria-label': label, title: label }
        : { active, indicator: true, label };
}
</script>

<template>
    <div class="online-bar" :class="{ 'online-bar-glass': glass }">
        <StatStrip
            v-if="glass"
            class="online-summary"
            :items="onlineItems"
            surface="glass"
            centered
            heading="今日在线"
            icon="play"
            aria-label="今日在线统计"
        />
        <slot v-if="glass" name="summary" />

        <LedgerSection
            :title="glass ? '角色记录' : '在线点卡'"
            plain
            class="online-role-card"
            :aria-label="glass ? '角色记录' : '在线点卡'"
        >
            <template #actions>
                <div class="online-tools">
                    <div class="online-actions" role="group" aria-label="上线记录管理">
                        <TextButton
                            text="补记"
                            label="补记一段已经过去的在线时长"
                            :disabled="controlsLocked"
                            @click="emit('backfill')"
                        />
                        <TextButton text="记录" label="查看全部上线记录" @click="emit('records')" />
                    </div>
                    <div class="card-settings" role="group" aria-label="点卡设置">
                        <component
                            :is="glass?.button ?? 'button'"
                            type="button"
                            :size="glass ? 'small' : undefined"
                            class="price-tag"
                            :title="`点卡单价 ${ledgerMoneyText(settings.cardPrice)}/点，点一下改`"
                            :aria-label="`点卡单价 ${ledgerMoneyText(settings.cardPrice)}/点，点一下改`"
                            :disabled="controlsLocked"
                            @click="priceOpen = true"
                        >
                            <span class="val">{{ ledgerMoneyText(settings.cardPrice) }}</span>
                            <span class="price-unit">/ 点</span>
                            <AppIcon name="edit" class="mark" />
                        </component>
                        <span v-if="glass" class="card-cost-control">
                            <span aria-hidden="true">计入收支</span>
                            <GlassSmallSwitch
                                :checked="settings.cardCost"
                                :disabled="controlsLocked"
                                aria-label="点卡计入账号收支"
                                @update:checked="toggleCost"
                            />
                        </span>
                        <CostSwitch
                            v-else
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

            <div :class="{ 'online-layout': !glass }">
                <div v-if="!glass" class="online-tickets">
                    <StatStrip
                        class="online-summary"
                        :items="onlineItems"
                        surface="folded"
                        spine="left"
                        heading="今日在线"
                        icon="play"
                        aria-label="今日在线统计"
                    />
                    <slot name="summary" />
                </div>

                <div class="online-roster">
                    <LoadNotice
                        :error="rosterError"
                        :load="reloadRoster ?? loadRoster"
                        :blocked="changing || rosterPending > 0 || !!rosterWriteError"
                    />
                    <div v-if="roles.length" class="role-list" aria-label="全部角色">
                        <div
                            v-for="one in roles"
                            :key="one.id"
                            class="role-item"
                            :class="{ 'is-running': one.session }"
                            :data-character-id="one.id"
                        >
                            <component
                                :is="glass?.button ?? KeycapButton"
                                class="role-start"
                                v-bind="
                                    roleButtonAttrs(
                                        !!one.session,
                                        one.session
                                            ? `结束 ${whoText(one.session)} 的计时`
                                            : `快速上线 ${one.name}`,
                                    )
                                "
                                :disabled="controlsLocked || (!one.session && !!rosterError)"
                                @click="toggleRole(one.id)"
                            >
                                <AppIcon
                                    v-if="glass"
                                    :name="one.session ? 'stop' : 'play'"
                                    class="role-icon"
                                />
                                <span class="role-copy">
                                    <span class="name" :title="one.name">{{ one.name }}</span>
                                    <span v-if="one.session" class="role-state">
                                        {{ clockText(sessionMinutes(one.session, now)) }}
                                    </span>
                                </span>
                            </component>
                        </div>
                    </div>
                    <p v-else-if="!rosterError" class="idle">添加角色后，点一下即可上线</p>
                    <div v-if="unlisted.length" class="unlisted" aria-label="名册外正在计时的记录">
                        <component
                            :is="glass?.button ?? KeycapButton"
                            v-for="one in unlisted"
                            :key="one.id"
                            class="unlisted-row"
                            :class="{ 'is-running': glass }"
                            v-bind="roleButtonAttrs(true, `结束 ${whoText(one)} 的计时`)"
                            :disabled="controlsLocked"
                            @click="stopOne(one)"
                        >
                            <AppIcon v-if="glass" name="stop" class="role-icon" />
                            <span class="role-copy">
                                <span class="name">{{ whoText(one) }}</span>
                                <span class="role-state">{{
                                    clockText(sessionMinutes(one, now))
                                }}</span>
                            </span>
                        </component>
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
    </div>
</template>

<style scoped>
.online-bar {
    min-width: 0;
}
.online-bar:not(.online-bar-glass) .online-role-card :deep(.section-head) {
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 20px;
    margin-bottom: 18px;
}
.online-role-card :deep(.section-actions) {
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
.card-cost-control {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    white-space: nowrap;
}
button.price-tag {
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
button.price-tag:hover:not(:disabled) {
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
    align-items: stretch;
    width: max-content;
    max-width: 100%;
    min-width: 0;
}
.role-start {
    --keycap-min-h: calc(34px * var(--fs-scale));
    --keycap-pad: 4px 8px;

    flex: 1;
    align-self: stretch;
    text-align: left;
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
.is-running .role-state {
    color: var(--num);
}
button.price-tag:focus-visible {
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
    --keycap-min-h: calc(34px * var(--fs-scale));
    --keycap-pad: 4px 8px;

    width: max-content;
    max-width: 100%;
    justify-self: start;
    text-align: left;
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
