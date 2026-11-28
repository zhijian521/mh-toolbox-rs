<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import ToolPageShell from './ToolPageShell.vue';
import WatchStatusTag from './WatchStatusTag.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import GroupHead from '../../components/GroupHead.vue';
import { notify } from '../../composables/use-notify';
import AppNotice from '../../components/AppNotice.vue';
import AppIcon from '../../components/AppIcon.vue';
import GlassSmallSwitch from '../../components/liquid-glass/GlassSmallSwitch.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import GlassMultiSelect from '../../components/liquid-glass/GlassMultiSelect.vue';
import { hasDesktop } from '../../services/desktop';
import type { GhostWindow } from '../../services/ghost';
import {
    activeReminders,
    defaultReminders,
    listFengyaoWindows,
    reminderLabels,
    setFengyaoSpeech,
    previewFengyaoSpeech,
    startFengyao,
    stopFengyao,
    updateFengyao,
    readFengyaoConfig,
    readFengyaoPreferences,
    type FengyaoPreferences,
    type WatchStatus,
} from '../../services/fengyao';
import { timeText } from '../../services/clock';
import { useFengyaoWatch } from './use-fengyao-watch';

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
const speechEnabled = ref(preferences?.speechEnabled ?? false);
const previewing = ref(false);
const mapsOpen = ref(false);
const pendingScenes = ref<string[] | null>(null);
const reminderDetails = {
    fengyao: '按所选地图提醒封妖公告',
    yaowang: '挖宝触发的妖王刷新',
    yecha: '携宝龙龟刷新',
    yiguan: '墓碑出现公告',
    stars: '星宿现身公告',
    nursery: '挖宝放出的宝宝及所在地图',
};
const {
    status,
    statusError,
    busy,
    known,
    running,
    refreshing,
    refreshStatus,
    runAction,
    rememberPreferences,
} = useFengyaoWatch();
const error = ref('');
const windowError = ref('');
const refreshingWindows = ref(false);
const pendingWindowTitle = ref('');
let disposed = false;
const windowOptions = computed(() =>
    windows.value.map((w) => ({ value: String(w.hwnd), label: w.title })),
);
const sceneRules = computed(() => status.value?.rules.scenes ?? []);
const sceneOptions = computed(() =>
    sceneRules.value.map(({ name }) => ({ value: name, label: name })),
);
const recentAlerts = computed(() => status.value?.alerts.slice(0, 3) ?? []);
const alertTextId = useId();
const openAlertId = ref<string | null>(null);
const portraitRoot = import.meta.env.BASE_URL + 'game/icons/pet-portrait/';
const reminderPortraits = {
    fengyao: import.meta.env.BASE_URL + 'game/icons/reminder/reminder-fengyao.webp', // 狂豹（人形）
    yaowang: portraitRoot + 'pet-2087.webp', // 净瓶女娲
    yecha: portraitRoot + 'pet-2107.webp', // 携宝龙龟
    yiguan: portraitRoot + 'pet-2076.webp', // 鬼将
    stars: portraitRoot + 'pet-2061.webp', // 天兵
    nursery: portraitRoot + 'pet-2041.webp', // 古代瑞兽
} satisfies Record<ReminderSetting['kind'], string>;
const stateText = computed(() => {
    if (!desktop) return '请在桌面应用中使用';
    if (statusError.value) return '监听状态暂未确认';
    if (!status.value) return '正在读取监听状态';
    if (status.value?.error && running.value) return status.value.error;
    if (!running.value) return '未开始';
    return status.value?.baselineReady ? '监听中 · 新公告符合条件时提醒' : '正在建立消息基线';
});

async function refreshWindows() {
    const found = await listFengyaoWindows();
    if (disposed) return;
    windows.value = found;
    const current = status.value;
    if (current?.running && current.config) {
        hwnd.value = String(current.config.hwnd);
        return;
    }
    if (found.some((w) => String(w.hwnd) === hwnd.value)) return;
    const saved = readFengyaoPreferences();
    const title = saved.ok ? saved.value?.windowTitle : undefined;
    const rememberedWindow = windows.value.filter((w) => w.title === title);
    const selected =
        rememberedWindow.length === 1 ? rememberedWindow[0] : found.length === 1 ? found[0] : null;
    hwnd.value = selected ? String(selected.hwnd) : '';
}

async function refreshWindowList() {
    if (refreshingWindows.value) return;
    refreshingWindows.value = true;
    windowError.value = '';
    error.value = '';
    try {
        await refreshWindows();
    } catch (cause) {
        windowError.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        refreshingWindows.value = false;
    }
}

async function act(action: () => Promise<WatchStatus | void>) {
    if (busy.value || !known.value) return;
    error.value = '';
    try {
        await runAction(action);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function changeReminder(
    setting: ReminderSetting,
    patch: Partial<Omit<ReminderSetting, 'kind'>>,
) {
    const next = reminders.value.map((entry) =>
        entry.kind === setting.kind ? { ...entry, ...patch } : entry,
    );
    const updated = running.value ? await updateFengyao(activeReminders(next)) : undefined;
    reminders.value = next;
    savePreferences();
    return updated;
}

async function changeSpeech(enabled: boolean) {
    await act(async () => {
        await setFengyaoSpeech(enabled);
        speechEnabled.value = enabled;
        savePreferences();
    });
}

async function previewSpeech() {
    if (previewing.value) return;
    previewing.value = true;
    try {
        await previewFengyaoSpeech();
    } catch (cause) {
        notify.error(String(cause));
    } finally {
        previewing.value = false;
    }
}

function pickScenes(setting: ReminderSetting, scenes: string[]) {
    return act(async () => {
        pendingScenes.value = scenes;
        try {
            return await changeReminder(setting, { scenes });
        } finally {
            pendingScenes.value = null;
        }
    });
}

function toggleScene(setting: ReminderSetting, name: string) {
    return pickScenes(
        setting,
        setting.scenes.includes(name)
            ? setting.scenes.filter((scene) => scene !== name)
            : [...setting.scenes, name],
    );
}

function selectWindow(value: string) {
    hwnd.value = value;
    savePreferences(true);
}

function savePreferences(saveWindow = false) {
    const windowTitle = windows.value.find((window) => String(window.hwnd) === hwnd.value)?.title;
    if (saveWindow && windowTitle) pendingWindowTitle.value = windowTitle;
    preferenceError.value = rememberPreferences(
        { reminders: reminders.value, speechEnabled: speechEnabled.value },
        pendingWindowTitle.value,
        windowTitle ?? '',
    );
    if (!preferenceError.value) pendingWindowTitle.value = '';
}

async function toggle() {
    await act(async () => {
        if (running.value) return stopFengyao();
        if (refreshingWindows.value) return;
        windowError.value = '';
        const filters = activeReminders(reminders.value);
        if (!filters.length) throw new Error('请先开启至少一种提醒');
        await refreshWindows();
        if (disposed) return;
        const selected = windows.value.find((window) => String(window.hwnd) === hwnd.value);
        if (!selected) {
            notify.info(windowHint);
            return;
        }
        const config = await readFengyaoConfig(selected, filters, speechEnabled.value);
        if (disposed) return;
        const next = await startFengyao(config);
        savePreferences(true);
        return next;
    });
}

watch(
    status,
    (next, previous) => {
        if (!next) return;
        if (!previous) {
            const allowed = new Set(next.rules.scenes.map((scene) => scene.name));
            const fengyao = reminders.value.find(({ kind }) => kind === 'fengyao');
            if (fengyao?.scenes.length) {
                fengyao.scenes = fengyao.scenes.filter((name) => allowed.has(name));
                if (!fengyao.scenes.length) fengyao.enabled = false;
            }
        }

        const config = next.config;
        if (!next.running || !config) return;
        speechEnabled.value = config.speechEnabled;
        hwnd.value = String(config.hwnd);
        if (previous?.running) return;
        reminders.value = reminders.value.map((setting) => {
            const filter = config.reminders.find(({ kind }) => kind === setting.kind);
            return {
                ...setting,
                enabled: !!filter,
                scenes: setting.kind === 'fengyao' ? (filter?.scenes ?? setting.scenes) : [],
            };
        });
    },
    { immediate: true },
);

onMounted(() => {
    if (desktop) void refreshWindowList();
});
onBeforeUnmount(() => {
    disposed = true;
});
</script>

<template>
    <ToolPageShell title="提醒助手" desc="游戏系统公告">
        <div class="fengyao" :class="{ 'fy-glass': glass }">
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
            <AppNotice v-if="status?.speechError" tone="error" role="alert">
                {{ status.speechError }}
            </AppNotice>
            <AppNotice v-if="status?.notificationError" tone="error" role="alert">
                {{ status.notificationError }}
            </AppNotice>

            <div class="fy-layout">
                <component :is="card" v-bind="cardProps" class="fy-history">
                    <div class="fy-panel">
                        <GroupHead as="h3">最近提醒</GroupHead>
                        <ol v-if="recentAlerts.length" class="fy-reminders">
                            <li v-for="alert in recentAlerts" :key="alert.id" class="fy-event">
                                <span class="fy-mark" aria-hidden="true">
                                    <img
                                        :src="reminderPortraits[alert.kind]"
                                        alt=""
                                        draggable="false"
                                    />
                                </span>
                                <div class="fy-event-body">
                                    <button
                                        type="button"
                                        class="fy-reminder"
                                        :aria-expanded="openAlertId === alert.id"
                                        :aria-controls="`${alertTextId}-${alert.id}`"
                                        @click="
                                            openAlertId = openAlertId === alert.id ? null : alert.id
                                        "
                                    >
                                        <span class="fy-kind">{{
                                            reminderLabels[alert.kind]
                                        }}</span>
                                        <time :datetime="new Date(alert.at).toISOString()">
                                            {{ timeText(new Date(alert.at)) }}
                                        </time>
                                        <span class="fy-place">
                                            {{ alert.scene || '查看公告' }}
                                            <small v-if="alert.coordinates"
                                                >坐标 {{ alert.coordinates }}</small
                                            >
                                        </span>
                                        <AppIcon name="chevron-down" aria-hidden="true" />
                                    </button>
                                    <p
                                        v-show="openAlertId === alert.id"
                                        :id="`${alertTextId}-${alert.id}`"
                                        class="fy-transcript fy-alert-text"
                                    >
                                        {{ alert.text }}
                                    </p>
                                </div>
                            </li>
                        </ol>
                        <p v-else class="fy-empty-alerts">
                            {{ running ? '等待匹配的系统公告' : '暂无提醒' }}
                        </p>
                        <details class="fy-details fy-reading">
                            <summary>识别详情</summary>
                            <div class="fy-details-body">
                                <p v-if="status?.lastReadAt" class="meta">
                                    最近读取 {{ timeText(new Date(status.lastReadAt)) }} ·
                                    {{ status.engine }} · 帧等待 {{ status.frameWaitMs }} ms · 识别
                                    {{ status.ocrMs }} ms
                                </p>
                                <p
                                    v-if="status?.engineFallback"
                                    class="note"
                                    :title="status.engineFallback"
                                >
                                    Vulkan 不可用，本次监听已切回 PP-OCRv4。
                                </p>
                                <p v-if="status?.alertTiming" class="meta">
                                    最近提醒 · 取帧到匹配 {{ status.alertTiming.matchedMs }} ms
                                    <template v-if="status.alertTiming.playbackMs != null">
                                        · 取帧到开播 {{ status.alertTiming.playbackMs }} ms
                                    </template>
                                </p>
                                <p v-if="status?.alertTiming?.playbackP95Ms != null" class="meta">
                                    开播延迟 P95 {{ status.alertTiming.playbackP95Ms }} ms （{{
                                        status.alertTiming.playbackSamples
                                    }}
                                    次）
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
                    </div>
                </component>
                <component :is="card" v-bind="cardProps" class="fy-settings">
                    <div class="fy-panel">
                        <GroupHead as="h3">监听设置</GroupHead>
                        <div class="fy-window-control" :class="{ 'lg-form-fields': glass }">
                            <GlassSelect
                                v-if="glass && windowOptions.length"
                                :model-value="hwnd"
                                class="fy-window-select"
                                :options="windowOptions"
                                label="监听的聊天窗口"
                                :disabled="running || busy || !known || refreshingWindows"
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
                                :disabled="running || busy || !known || refreshingWindows"
                                @update:model-value="selectWindow"
                            />
                            <span v-else class="fy-window-hint">请先在游戏中弹出独立聊天窗口</span>
                            <PressButton
                                text="刷新"
                                label="重新查找聊天窗口"
                                :disabled="running || busy || !desktop || refreshingWindows"
                                @click="refreshWindowList"
                            />
                        </div>
                        <div class="fy-listen-actions">
                            <WatchStatusTag
                                :tone="
                                    status?.error || statusError
                                        ? 'warn'
                                        : running
                                          ? 'live'
                                          : 'idle'
                                "
                            >
                                {{ stateText }}
                            </WatchStatusTag>
                            <PressButton
                                :icon="running ? 'stop' : 'play'"
                                :text="known ? (running ? '停止监听' : '开始监听') : '监听状态'"
                                :label="
                                    known ? (running ? '停止公告监听' : '开始公告监听') : '监听状态'
                                "
                                :disabled="busy || !known || (!running && refreshingWindows)"
                                @click="toggle"
                            />
                        </div>
                        <AppNotice v-if="error || windowError" tone="error" role="alert">
                            {{ error || windowError }}
                        </AppNotice>
                        <AppNotice v-if="statusError" tone="error" role="alert">
                            {{ statusError }}
                            <template #action>
                                <PressButton
                                    text="重试"
                                    label="重试读取监听状态"
                                    size="sm"
                                    :disabled="refreshing"
                                    @click="refreshStatus()"
                                />
                            </template>
                        </AppNotice>
                        <div class="fy-speech">
                            <span>语音播报</span>
                            <PressButton
                                :text="previewing ? '试听中' : '试听'"
                                label="试听语音提醒"
                                :disabled="!desktop || previewing || busy"
                                @click="previewSpeech"
                            />
                            <GlassSmallSwitch
                                v-if="glass"
                                :checked="speechEnabled"
                                aria-label="语音播报"
                                :disabled="busy || !known"
                                @update:checked="changeSpeech"
                            />
                            <CostSwitch
                                v-else
                                :model-value="speechEnabled"
                                label="语音播报"
                                off-label="关"
                                on-label="开"
                                :disabled="busy || !known"
                                @update:model-value="changeSpeech"
                            />
                        </div>
                        <section class="fy-types" aria-label="提醒类型">
                            <div v-for="setting in reminders" :key="setting.kind" class="fy-type">
                                <div class="fy-type-row">
                                    <span class="fy-mark" aria-hidden="true">
                                        <img
                                            :src="reminderPortraits[setting.kind]"
                                            alt=""
                                            draggable="false"
                                        />
                                    </span>
                                    <div class="fy-type-copy">
                                        <h4>{{ reminderLabels[setting.kind] }}</h4>
                                        <small>{{ reminderDetails[setting.kind] }}</small>
                                    </div>
                                    <GlassSmallSwitch
                                        v-if="glass"
                                        :checked="setting.enabled"
                                        :aria-label="`${reminderLabels[setting.kind]}提醒`"
                                        :disabled="busy || !known"
                                        @update:checked="
                                            act(() => changeReminder(setting, { enabled: $event }))
                                        "
                                    />
                                    <CostSwitch
                                        v-else
                                        :model-value="setting.enabled"
                                        :label="`${reminderLabels[setting.kind]}提醒`"
                                        :disabled="busy || !known"
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
                                                ? `封妖地图 · 已选 ${setting.scenes.length} 个`
                                                : '封妖地图 · 全部地图'
                                        }}
                                        <AppIcon
                                            :name="mapsOpen ? 'chevron-down' : 'chevron-right'"
                                        />
                                    </button>
                                    <div v-show="mapsOpen" id="fy-maps-fengyao">
                                        <div v-if="glass" class="fy-map-picker">
                                            <GlassMultiSelect
                                                :model-value="pendingScenes ?? setting.scenes"
                                                :options="sceneOptions"
                                                label="封妖地图"
                                                :disabled="busy || !known"
                                                @update:model-value="pickScenes(setting, $event)"
                                            />
                                            <PressButton
                                                size="sm"
                                                text="全部地图"
                                                label="恢复全部地图"
                                                :disabled="busy || !known || !setting.scenes.length"
                                                @click="pickScenes(setting, [])"
                                            />
                                        </div>
                                        <div
                                            v-else
                                            class="fy-map-grid"
                                            role="group"
                                            aria-label="封妖地图"
                                        >
                                            <button
                                                type="button"
                                                :aria-pressed="!setting.scenes.length"
                                                :disabled="busy || !known"
                                                @click="pickScenes(setting, [])"
                                            >
                                                全部地图
                                            </button>
                                            <button
                                                v-for="scene in sceneRules"
                                                :key="scene.name"
                                                type="button"
                                                :aria-pressed="setting.scenes.includes(scene.name)"
                                                :disabled="busy || !known"
                                                @click="toggleScene(setting, scene.name)"
                                            >
                                                {{ scene.name }}
                                            </button>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </section>
                        <details class="fy-details fy-guide">
                            <summary>使用说明</summary>
                            <p>
                                在游戏中将聊天区单独弹出，保持窗口可见，避免最小化或隐藏。请显示系统频道，并将聊天记录停留在最新消息。
                            </p>
                        </details>
                    </div>
                </component>
            </div>
        </div>
    </ToolPageShell>
</template>

<style scoped>
/* 时间线与设置共用内容宽度，窄容器中按阅读顺序自然改为上下排列。 */
.fengyao {
    display: grid;
    gap: 12px;
    container-type: inline-size;
}
.fy-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
    align-items: start;
    gap: 12px;
}
.fy-history,
.fy-settings {
    min-width: 0;
    padding: 16px;
}
.fy-glass :is(.fy-history, .fy-settings) {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
}
.fy-panel {
    display: grid;
    gap: 14px;
    min-width: 0;
}
.fy-type-row,
.fy-window-control {
    display: flex;
    align-items: center;
    gap: 10px;
}
.fy-window-hint,
.fy-type-copy small,
.fy-reminder time,
.fy-place small {
    color: var(--muted);
    font-size: var(--fs-sm);
}
.fy-listen-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}
.fy-window-select,
.fy-window-hint,
.fy-type-copy {
    min-width: 0;
    flex: 1;
}
.fy-types,
.fy-details {
    border-top: 1px solid var(--rule);
}
.fy-type {
    --type-mark-size: calc(38px * var(--fs-scale, 1));
    padding: 8px 0;
}
.fy-type + .fy-type {
    border-top: 1px solid var(--rule);
}
.fy-type-copy {
    display: grid;
    gap: 2px;
    line-height: 1.35;
}
.fy-type-copy h4 {
    font-size: var(--fs-base);
    font-weight: 400;
    margin: 0;
}
.fy-speech {
    display: flex;
    align-items: center;
    gap: 8px;
}
.fy-speech > span:first-child {
    margin-inline-end: auto;
}
.fy-type-row :deep(.cost-opt) {
    padding: 2px 7px;
}
.fy-mark {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    align-self: start;
    width: var(--event-mark-size);
    height: var(--event-mark-size);
    border-radius: 32%;
    overflow: clip;
    background: var(--ledger-surface, var(--paper-2));
}
.fy-type-row .fy-mark {
    align-self: center;
    width: var(--type-mark-size);
    height: var(--type-mark-size);
}
.fy-mark img {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(100% - 6px);
    height: calc(100% - 6px);
    border-radius: calc(32% - 2px);
    transform: translate(-50%, -50%);
    object-fit: contain;
    object-position: center;
}
.fy-maps-toggle,
.fy-map-grid button,
.fy-reminder {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: var(--r-1);
}
.fy-maps-toggle {
    --icon-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: calc(var(--type-mark-size) + 10px);
    padding: 4px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.fy-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 78px), 1fr));
    gap: 4px;
    margin-top: 6px;
}
.fy-map-picker {
    display: grid;
    justify-items: start;
    gap: 6px;
    margin-top: 6px;
}
.fy-map-grid button {
    min-height: 28px;
    padding: 4px;
    font-size: var(--fs-sm);
}
.fy-map-grid button:hover:not(:disabled),
.fy-maps-toggle:hover,
.fy-reminder:hover {
    background: var(--ledger-surface, var(--paper-2));
}
.fy-map-grid button[aria-pressed='true'] {
    color: var(--accent);
    background: var(--ledger-selected, var(--well));
}
.fy-reminders {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
}
.fy-event {
    --event-mark-size: 32px;
    position: relative;
    display: grid;
    grid-template-columns: var(--event-mark-size) minmax(0, 1fr);
    gap: 12px;
}
.fy-event:not(:last-child) {
    padding-bottom: 16px;
}
.fy-event:not(:last-child)::before {
    position: absolute;
    inset: calc(var(--event-mark-size) + 2px) auto 2px calc(var(--event-mark-size) / 2);
    width: 1px;
    background: var(--rule-2);
    content: '';
}
.fy-reminder {
    --icon-size: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    justify-items: start;
    gap: 4px 8px;
    width: 100%;
    padding: 2px 4px;
    text-align: start;
}
.fy-kind {
    color: var(--accent);
    font-size: var(--fs-sm);
}
.fy-place {
    color: var(--ink);
    font-size: var(--fs-md);
    overflow-wrap: anywhere;
}
.fy-reminder time,
.fy-reminder .app-icon {
    justify-self: end;
    font-variant-numeric: tabular-nums;
}
.fy-reminder[aria-expanded='true'] .app-icon {
    transform: rotate(180deg);
}
.fy-empty-alerts {
    margin: 0;
    padding: 28px 8px;
    text-align: center;
    color: var(--muted);
}
.fy-details {
    min-width: 0;
    padding-top: 10px;
}
.fy-details summary {
    width: fit-content;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    cursor: pointer;
}
.fy-details-body,
.fy-guide p {
    display: grid;
    gap: 8px;
    margin: 8px 0 0;
}
.fy-guide p,
.fy-transcript {
    font: inherit;
    font-size: var(--fs-sm);
    line-height: 1.7;
}
.fy-transcript {
    margin: 0;
    max-height: 200px;
    overflow: auto;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    scrollbar-gutter: stable;
}
.fy-alert-text {
    margin-top: 6px;
    border-inline-start: 2px solid var(--rule-2);
    padding: 6px 10px;
    background: var(--ledger-surface, var(--paper-2));
}
@container (max-width: 640px) {
    .fy-layout {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
