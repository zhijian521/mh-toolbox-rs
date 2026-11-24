<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import ToolPageShell from './ToolPageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import GroupHead from '../../components/GroupHead.vue';
import { notify } from '../../composables/use-notify';
import AppNotice from '../../components/AppNotice.vue';
import AppIcon from '../../components/AppIcon.vue';
import { GlassSwitch } from '../../components/liquid-glass';
import { glassLedger } from '../../components/glass-ledger';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import { hasDesktop } from '../../services/desktop';
import type { GhostWindow } from '../../services/ghost';
import {
    activeReminders,
    defaultReminders,
    fengyaoStatus,
    listFengyaoWindows,
    reminderLabels,
    startFengyao,
    stopFengyao,
    updateFengyao,
    readFengyaoFrame,
    readFengyaoPreferences,
    saveFengyaoPreferences,
    type FengyaoPreferences,
    type WatchStatus,
} from '../../services/fengyao';
import { timeText } from '../../services/clock';

/** 挑选聊天窗口并查看回执，持续捕获、解析和系统提醒由宿主负责。 */
const desktop = hasDesktop();
const glass = inject(glassLedger, null);
const card = glass?.card ?? PaperCard;
const cardProps = glass ? { radius: 16 } : { plain: true };
const remembered = readFengyaoPreferences();
const preferences = remembered.ok ? remembered.value : null;
const preferenceError = ref(remembered.ok ? '' : remembered.error);
const windows = ref<GhostWindow[]>([]);
const hwnd = ref('');
const windowHint = '请选择独立聊天窗口。若列表为空，请先在游戏中弹出聊天窗口，再点击“刷新”。';
type ReminderSetting = FengyaoPreferences['reminders'][number];
const reminders = ref(preferences?.reminders ?? defaultReminders());
const mapsOpen = ref(false);
const reminderDetails = {
    yaowang: '挖宝触发的妖王刷新',
    yecha: '携宝龙龟刷新',
    yiguan: '墓碑出现公告',
};
const status = ref<WatchStatus | null>(null);
const busy = ref(false);
const error = ref('');
const statusError = ref('');
const pendingWindowTitle = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;
let polling = false;
let revision = 0;
const running = computed(() => status.value?.running === true);
const windowOptions = computed(() =>
    windows.value.map((w) => ({ value: String(w.hwnd), label: w.title })),
);
const sceneRules = computed(() => status.value?.rules.scenes ?? []);
const recentAlerts = computed(() => status.value?.alerts.slice(0, 3) ?? []);
const alertTextId = useId();
const openAlertId = ref<string | null>(null);
const openAlert = computed(() => recentAlerts.value.find(({ id }) => id === openAlertId.value));
const stateText = computed(() => {
    if (!desktop) return '请在桌面应用中使用';
    if (!status.value) return statusError.value ? '读取监听状态失败' : '正在读取监听状态';
    if (status.value?.error && running.value) return status.value.error;
    if (!running.value) return '未开始';
    return status.value?.baselineReady ? '监听中 · 新公告符合条件时提醒' : '正在建立消息基线';
});

async function refreshWindows() {
    const found = await listFengyaoWindows();
    if (disposed) return;
    windows.value = found;
    if (windows.value.some((w) => String(w.hwnd) === hwnd.value)) return;
    const saved = readFengyaoPreferences();
    const title = saved.ok ? saved.value?.windowTitle : undefined;
    const rememberedWindow = windows.value.filter((w) => w.title === title);
    const selected =
        rememberedWindow.length === 1 ? rememberedWindow[0] : found.length === 1 ? found[0] : null;
    hwnd.value = selected ? String(selected.hwnd) : '';
}

async function act(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    revision += 1;
    error.value = '';
    try {
        await action();
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        busy.value = false;
    }
}

async function changeReminder(
    setting: ReminderSetting,
    patch: Partial<Omit<ReminderSetting, 'kind'>>,
) {
    const next = reminders.value.map((entry) =>
        entry.kind === setting.kind ? { ...entry, ...patch } : entry,
    );
    if (running.value) status.value = await updateFengyao(activeReminders(next));
    reminders.value = next;
    savePreferences();
}

function toggleScene(setting: ReminderSetting, name: string) {
    return act(() =>
        changeReminder(setting, {
            scenes: setting.scenes.includes(name)
                ? setting.scenes.filter((scene) => scene !== name)
                : [...setting.scenes, name],
        }),
    );
}

function selectWindow(value: string) {
    hwnd.value = value;
    savePreferences(true);
}

function savePreferences(saveWindow = false) {
    const windowTitle = windows.value.find((window) => String(window.hwnd) === hwnd.value)?.title;
    if (saveWindow && windowTitle) pendingWindowTitle.value = windowTitle;
    const stored = readFengyaoPreferences();
    if (!stored.ok) {
        preferenceError.value = stored.error;
        return;
    }
    const saved = saveFengyaoPreferences({
        reminders: reminders.value,
        windowTitle: pendingWindowTitle.value || stored.value?.windowTitle || windowTitle || '',
    });
    if (saved) pendingWindowTitle.value = '';
    preferenceError.value = saved ? '' : '设置保存失败，可重试';
}

async function toggle() {
    await act(async () => {
        if (running.value) {
            status.value = await stopFengyao();
            return;
        }
        const filters = activeReminders(reminders.value);
        if (!filters.length) throw new Error('请先开启至少一种提醒');
        await refreshWindows();
        if (disposed) return;
        const selected = windows.value.find((window) => String(window.hwnd) === hwnd.value);
        if (!selected) {
            notify.info(windowHint);
            return;
        }
        const region = await readFengyaoFrame(selected.hwnd, selected.title);
        if (disposed) return;
        status.value = await startFengyao({ hwnd: selected.hwnd, reminders: filters, region });
        savePreferences(true);
    });
}

function acceptStatus(next: WatchStatus) {
    const previous = status.value;
    status.value = next;
    statusError.value = '';
    if (!previous) {
        const allowed = new Set(next.rules.scenes.map((scene) => scene.name));
        const fengyao = reminders.value.find(({ kind }) => kind === 'fengyao');
        if (fengyao?.scenes.length) {
            fengyao.scenes = fengyao.scenes.filter((name) => allowed.has(name));
            if (!fengyao.scenes.length) fengyao.enabled = false;
        }
    }
    if (!previous?.running && next.running && next.config) {
        hwnd.value = String(next.config.hwnd);
        const active = next.config.reminders;
        reminders.value = reminders.value.map((setting) => {
            const filter = active.find(({ kind }) => kind === setting.kind);
            return {
                ...setting,
                enabled: !!filter,
                scenes: setting.kind === 'fengyao' ? (filter?.scenes ?? setting.scenes) : [],
            };
        });
    }
}

async function poll() {
    if (polling || busy.value || disposed) return;
    polling = true;
    const current = revision;
    try {
        const next = await fengyaoStatus();
        if (!disposed && current === revision) acceptStatus(next);
    } catch (cause) {
        if (!disposed && current === revision) statusError.value = String(cause);
    } finally {
        polling = false;
    }
}

onMounted(async () => {
    if (!desktop) return;
    await act(refreshWindows);
    await poll();
    if (!disposed) timer = setInterval(() => void poll(), 1200);
});
onBeforeUnmount(() => {
    disposed = true;
    // 页面只销毁状态轮询；后台监听只由用户点击停止或退出应用结束。
    if (timer !== undefined) clearInterval(timer);
});
</script>

<template>
    <ToolPageShell title="提醒助手" desc="游戏系统公告">
        <template #actions>
            <PressButton
                class="fy-listen-action"
                :icon="running ? 'stop' : 'play'"
                :text="running ? '停止监听' : '开始监听'"
                :label="running ? '停止公告监听' : '开始公告监听'"
                seal
                :disabled="busy || !desktop || !status"
                @click="toggle"
            />
        </template>
        <div class="fengyao" :class="{ 'fy-glass': glass }">
            <AppNotice v-if="error" tone="error" role="alert">{{ error }}</AppNotice>
            <AppNotice v-if="statusError" tone="error" role="alert">{{ statusError }}</AppNotice>
            <AppNotice v-if="preferenceError" tone="error" role="alert">
                {{ preferenceError }}
                <template #action>
                    <PressButton
                        text="重试"
                        label="重试保存监听设置"
                        size="sm"
                        @click="savePreferences()"
                    />
                </template>
            </AppNotice>
            <AppNotice v-if="status?.notificationError" tone="error" role="alert">
                {{ status.notificationError }}
            </AppNotice>

            <div class="fy-setup">
                <component :is="card" v-bind="cardProps" class="fy-settings">
                    <div class="fy-card-head">
                        <GroupHead as="h3">监听设置</GroupHead>
                        <p
                            class="fy-status"
                            role="status"
                            :class="{ live: running && !status?.error }"
                        >
                            {{ stateText }}
                        </p>
                    </div>
                    <div class="fy-window-control" :class="{ 'lg-form-fields': glass }">
                        <GlassSelect
                            v-if="glass && windowOptions.length"
                            :model-value="hwnd"
                            class="fy-window-select"
                            :options="windowOptions"
                            label="监听的聊天窗口"
                            :disabled="running || busy"
                            hide-label
                            @update:model-value="selectWindow"
                        />
                        <SelectField
                            v-else-if="windowOptions.length"
                            :model-value="hwnd"
                            class="fy-window-select"
                            :options="windowOptions"
                            label="监听的聊天窗口"
                            placeholder="请选择聊天窗口"
                            :disabled="running || busy"
                            @update:model-value="selectWindow"
                        />
                        <PressButton
                            text="刷新"
                            label="重新查找聊天窗口"
                            :disabled="running || busy || !desktop"
                            @click="act(refreshWindows)"
                        />
                    </div>
                </component>
                <component :is="card" v-bind="cardProps" class="fy-guide">
                    <GroupHead as="h3">使用说明</GroupHead>
                    <AppNotice bare>
                        在游戏中将聊天区单独弹出，保持窗口可见，避免最小化或隐藏。请显示系统频道，并将聊天记录停留在最新消息。
                    </AppNotice>
                </component>
            </div>

            <section class="fy-types" aria-label="提醒类型">
                <component
                    :is="card"
                    v-for="setting in reminders"
                    :key="setting.kind"
                    v-bind="cardProps"
                    class="fy-type"
                >
                    <div class="fy-type-row">
                        <h3>{{ reminderLabels[setting.kind] }}</h3>
                        <GlassSwitch
                            v-if="glass"
                            class="fy-type-switch"
                            :checked="setting.enabled"
                            :aria-label="`${reminderLabels[setting.kind]}提醒`"
                            :disabled="busy || !status"
                            @update:checked="
                                act(() => changeReminder(setting, { enabled: $event }))
                            "
                        />
                        <CostSwitch
                            v-else
                            :model-value="setting.enabled"
                            :label="`${reminderLabels[setting.kind]}提醒`"
                            :disabled="busy || !status"
                            off-label="关"
                            on-label="开"
                            @update:model-value="
                                act(() => changeReminder(setting, { enabled: $event }))
                            "
                        />
                    </div>
                    <template v-if="setting.kind === 'fengyao'">
                        <button
                            type="button"
                            class="fy-maps-toggle"
                            :aria-expanded="mapsOpen"
                            aria-controls="fy-maps-fengyao"
                            @click="mapsOpen = !mapsOpen"
                        >
                            {{
                                setting.scenes.length
                                    ? `已选 ${setting.scenes.length} 个地图`
                                    : '全部地图'
                            }}
                            <AppIcon :name="mapsOpen ? 'chevron-down' : 'chevron-right'" />
                        </button>
                        <div
                            v-show="mapsOpen"
                            id="fy-maps-fengyao"
                            class="fy-map-grid"
                            role="group"
                            aria-label="封妖地图"
                        >
                            <button
                                type="button"
                                :aria-pressed="!setting.scenes.length"
                                :disabled="busy || !status"
                                @click="act(() => changeReminder(setting, { scenes: [] }))"
                            >
                                全部地图
                            </button>
                            <button
                                v-for="scene in sceneRules"
                                :key="scene.name"
                                type="button"
                                :aria-pressed="setting.scenes.includes(scene.name)"
                                :disabled="busy || !status"
                                @click="toggleScene(setting, scene.name)"
                            >
                                {{ scene.name }}
                            </button>
                        </div>
                    </template>
                    <p v-else class="fy-type-detail">
                        {{ reminderDetails[setting.kind] }}
                    </p>
                </component>
            </section>

            <component :is="card" v-bind="cardProps" class="fy-history">
                <GroupHead as="h3">最近提醒</GroupHead>
                <p v-if="!recentAlerts.length" class="note" :class="{ 'fy-empty-alerts': glass }">
                    暂无提醒
                </p>
                <ol v-else class="fy-reminders">
                    <li v-for="alert in recentAlerts" :key="alert.id">
                        <button
                            type="button"
                            class="fy-reminder"
                            :aria-expanded="openAlertId === alert.id"
                            :aria-controls="alertTextId"
                            @click="openAlertId = openAlertId === alert.id ? null : alert.id"
                        >
                            <span class="fy-reminder-kind">{{ reminderLabels[alert.kind] }}</span>
                            <span class="fy-reminder-place">
                                {{ alert.scene }}
                                <small v-if="alert.coordinates">· {{ alert.coordinates }}</small>
                            </span>
                            <time :datetime="new Date(alert.at).toISOString()">{{
                                timeText(new Date(alert.at))
                            }}</time>
                            <AppIcon name="chevron-down" aria-hidden="true" />
                        </button>
                    </li>
                </ol>
                <p v-show="openAlert" :id="alertTextId" class="fy-transcript fy-alert-text">
                    {{ openAlert?.text }}
                </p>
                <details class="fy-details fy-reading">
                    <summary>识别详情</summary>
                    <div class="fy-details-body">
                        <p v-if="status?.lastReadAt" class="meta">
                            最近读取 {{ timeText(new Date(status.lastReadAt)) }} ·
                            {{ status.ocrMs }}ms
                        </p>
                        <pre v-if="status?.text.length" class="fy-transcript">{{
                            status.text.join('\n')
                        }}</pre>
                        <p v-else class="note">
                            开始监听后显示识别原文，首次读取仅建立基线，不提醒旧公告。
                        </p>
                        <p class="note">提醒内容来自游戏内系统公告。</p>
                    </div>
                </details>
            </component>
        </div>
    </ToolPageShell>
</template>

<style scoped>
.fengyao {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    max-width: 1000px;
}
.fy-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}
.fy-status {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.fy-status.live {
    color: var(--seal);
}
.fy-settings,
.fy-history,
.fy-guide,
.fy-type {
    display: grid;
    gap: 14px;
    padding: 16px;
    min-width: 0;
}
.fengyao .group-head {
    margin: 0;
}
.fy-setup {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
    gap: 10px;
}
.fy-window-control {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.fy-details > summary {
    width: fit-content;
    cursor: pointer;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.fy-details > summary:focus-visible {
    outline: var(--ring);
    outline-offset: 4px;
}
.fy-details-body {
    display: grid;
    gap: 16px;
    margin-top: 16px;
}
.fy-transcript {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: inherit;
    font-size: var(--fs-sm);
    color: var(--ink);
    line-height: 1.7;
    margin: 0;
    max-height: 200px;
    overflow: auto;
    scrollbar-gutter: stable;
}
glass-button.fy-listen-action {
    --glass-on-accent: var(--liquid-ink);
    --lg-surface-fill: var(--ledger-selected);
}
.fy-glass {
    max-width: none;
    gap: 10px;
    align-items: start;
}
.fy-glass :is(.fy-settings, .fy-history, .fy-guide, .fy-type) {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    gap: 12px;
    padding: 12px 14px;
}
.fy-window-select {
    flex: 1;
    min-width: 0;
}
.fy-types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
    align-items: start;
    gap: 10px;
}
.fy-glass .fy-type,
.fy-type {
    gap: 4px;
}
.fy-type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.fy-type-switch {
    zoom: 0.875;
}
.fy-type-row :deep(.cost-opt) {
    padding: 2px 7px;
}
.fy-type-row h3 {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 400;
}
.fy-type-detail,
.fy-maps-toggle {
    display: flex;
    align-items: center;
    min-height: 26px;
    margin: 0;
    color: var(--liquid-muted, var(--muted));
    font-size: var(--fs-sm);
}
.fy-maps-toggle,
.fy-map-grid button {
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    cursor: pointer;
}
.fy-maps-toggle {
    --icon-size: 12px;
    justify-self: start;
    gap: 6px;
    padding: 2px 4px 2px 0;
}
.fy-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 75px), 1fr));
    gap: 4px;
    padding-top: 5px;
    border-top: 1px solid var(--liquid-outline, var(--rule));
}
.fy-map-grid button {
    min-height: 29px;
    padding: 4px;
    color: inherit;
    font-size: var(--fs-sm);
}
.fy-maps-toggle:hover,
.fy-map-grid button:hover:not(:disabled) {
    background: var(--ledger-surface, var(--paper-2));
}
.fy-map-grid button[aria-pressed='true'] {
    background: var(--ledger-selected, var(--paper-2));
    color: var(--liquid-focus, var(--accent));
}
.fy-reminders {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.fy-reminders li {
    min-width: 0;
    max-width: 100%;
}
.fy-reminder {
    --icon-size: 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-height: 28px;
    padding: 3px 8px;
    border: 1px solid var(--liquid-outline, var(--rule));
    border-radius: var(--r-1);
    background: var(--ledger-surface, var(--paper-2));
    color: inherit;
    font-size: var(--fs-sm);
    text-align: start;
    cursor: pointer;
}
.fy-reminder:hover,
.fy-reminder[aria-expanded='true'] {
    background: var(--ledger-selected, var(--well));
}
.fy-reminder:focus-visible {
    outline: var(--ring);
    outline-offset: 2px;
}
.fy-reminder[aria-expanded='true'] .app-icon {
    transform: rotate(180deg);
}
.fy-reminder-kind {
    color: var(--liquid-focus, var(--accent));
    white-space: nowrap;
}
.fy-reminder-place {
    min-width: 0;
    overflow-wrap: anywhere;
}
.fy-reminder time,
.fy-reminder-place small {
    color: var(--liquid-muted, var(--muted));
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.fy-alert-text {
    padding: 6px 8px;
    border-radius: var(--r-1);
    background: var(--ledger-surface, var(--paper-2));
}
.fy-glass .fy-empty-alerts {
    padding: 8px;
    border-radius: var(--r-1);
    background: var(--ledger-surface);
    text-align: center;
}
</style>
