<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ToolPageShell from './ToolPageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import NumberField from '../../components/NumberField.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import GroupHead from '../../components/GroupHead.vue';
import AppIcon from '../../components/AppIcon.vue';
import { GlassSwitch } from '../../components/liquid-glass';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import { hasDesktop } from '../../services/desktop';
import type { GhostWindow } from '../../services/ghost';
import {
    activeReminders,
    captureFengyaoWindow,
    defaultReminders,
    fengyaoStatus,
    fengyaoRegionMatchesFrame,
    listFengyaoWindows,
    parseReminderMaps,
    reminderLabels,
    startFengyao,
    stopFengyao,
    updateFengyao,
    isMessageRegion,
    readFengyaoPreferences,
    saveFengyaoPreferences,
    wholeFengyaoFrame,
    type FengyaoPreferences,
    type MessageRegion,
    type WatchStatus,
    type WindowShot,
} from '../../services/fengyao';
import type { ReminderKind } from '../../services/bindings';
import { timeText } from '../../services/clock';

/** 区域校准与当前回执；持续捕获、解析、去重和系统提醒均由宿主负责。 */
const desktop = hasDesktop();
const glass = inject(glassLedger, null);
const card = glass?.card ?? PaperCard;
const cardProps = glass ? { radius: 16 } : { plain: true };
const remembered = readFengyaoPreferences();
const preferences = remembered.ok ? remembered.value : null;
const preferenceError = ref(remembered.ok ? '' : remembered.error);
const windows = ref<GhostWindow[]>([]);
const hwnd = ref('');
type ReminderSetting = FengyaoPreferences['reminders'][number];
const reminders = ref(preferences?.reminders ?? defaultReminders());
const expanded = ref<ReminderKind | null>(null);
const mapInput = ref('');
const status = ref<WatchStatus | null>(null);
const shot = ref<WindowShot | null>(null);
const calibrationOpen = ref(false);
const calibrationHeading = ref<HTMLElement | null>(null);
const startAfterSelection = ref(false);
const region = ref<MessageRegion | null>(null);
const draftRegion = ref<MessageRegion | null>(null);
const busy = ref(false);
const error = ref('');
const statusError = ref('');
const preferencePending = ref<{ windowTitle: string; region: MessageRegion | null } | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;
let polling = false;
let revision = 0;
let anchor: { x: number; y: number } | null = null;
const running = computed(() => status.value?.running === true);
const windowOptions = computed(() =>
    windows.value.map((w) => ({ value: String(w.hwnd), label: w.title })),
);
const sceneRules = computed(() => status.value?.rules.scenes ?? []);
const validRegion = computed(() => isMessageRegion(region.value));
const validDraftRegion = computed(() => isMessageRegion(draftRegion.value));
const recentAlerts = computed(() => status.value?.alerts.slice(0, 3) ?? []);
const stateText = computed(() => {
    if (!desktop) return '请在桌面应用中使用';
    if (!status.value) return statusError.value ? '读取监听状态失败' : '正在读取监听状态';
    if (status.value?.error && running.value) return status.value.error;
    if (!running.value) return '未开始';
    return status.value?.baselineReady ? '监听中 · 新公告符合条件时提醒' : '正在建立消息基线';
});
const selectionStyle = computed(() => {
    const r = draftRegion.value;
    if (!r) return {};
    return {
        left: `${(r.x / r.frameWidth) * 100}%`,
        top: `${(r.y / r.frameHeight) * 100}%`,
        width: `${(r.width / r.frameWidth) * 100}%`,
        height: `${(r.height / r.frameHeight) * 100}%`,
    };
});

watch(
    hwnd,
    () => {
        closeCalibration();
        const title = windows.value.find((window) => String(window.hwnd) === hwnd.value)?.title;
        const saved = readFengyaoPreferences();
        const calibration = preferencePending.value ?? (saved.ok ? saved.value : null);
        const unique = windows.value.filter((window) => window.title === title).length === 1;
        region.value =
            unique && calibration?.windowTitle === title && calibration?.region
                ? { ...calibration.region }
                : null;
    },
    { flush: 'sync' },
);

watch(
    calibrationOpen,
    (open) => {
        if (open && glass) calibrationHeading.value?.focus();
    },
    { flush: 'post' },
);

async function refreshWindows() {
    const found = await listFengyaoWindows();
    if (disposed) return;
    windows.value = found;
    if (windows.value.some((w) => String(w.hwnd) === hwnd.value)) return;
    const saved = readFengyaoPreferences();
    const title = saved.ok ? saved.value?.windowTitle : undefined;
    const rememberedWindow = windows.value.filter((w) => w.title === title);
    const chatWindows = windows.value.filter((w) => /聊天窗口/.test(w.title));
    const selected =
        rememberedWindow.length === 1
            ? rememberedWindow[0]
            : chatWindows.length === 1
              ? chatWindows[0]
              : windows.value.length === 1
                ? windows.value[0]
                : undefined;
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

function openCalibration(image: WindowShot, start = false) {
    shot.value = image;
    draftRegion.value = fengyaoRegionMatchesFrame(region.value, image) ? { ...region.value } : null;
    startAfterSelection.value = start;
    calibrationOpen.value = true;
}

function closeCalibration() {
    calibrationOpen.value = false;
    startAfterSelection.value = false;
    shot.value = null;
    draftRegion.value = null;
    anchor = null;
}

async function capture() {
    await act(async () => {
        const image = await captureFengyaoWindow(Number(hwnd.value));
        if (!disposed) openCalibration(image);
    });
}

function point(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const image = shot.value;
    if (!image) return { x: 0, y: 0 };
    return {
        x: Math.round(
            Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * image.width,
        ),
        y: Math.round(
            Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) * image.height,
        ),
    };
}

function beginSelection(event: PointerEvent) {
    if (running.value || !shot.value || event.button !== 0) return;
    anchor = point(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    moveSelection(event);
}

function moveSelection(event: PointerEvent) {
    if (!anchor || !shot.value) return;
    const to = point(event);
    draftRegion.value = {
        x: Math.min(anchor.x, to.x),
        y: Math.min(anchor.y, to.y),
        width: Math.abs(to.x - anchor.x),
        height: Math.abs(to.y - anchor.y),
        frameWidth: shot.value.width,
        frameHeight: shot.value.height,
    };
}

function endSelection() {
    anchor = null;
}

function expandReminder(setting: ReminderSetting) {
    expanded.value = expanded.value === setting.kind ? null : setting.kind;
    mapInput.value = setting.scenes.join('、');
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

function applyMaps(setting: ReminderSetting) {
    return act(async () => {
        const scenes = parseReminderMaps(mapInput.value);
        await changeReminder(setting, { scenes });
        if (expanded.value === setting.kind) mapInput.value = scenes.join('、');
    });
}

function selectWindow(value: string) {
    hwnd.value = value;
    savePreferences(true);
}

function useWholeWindow() {
    region.value = null;
    closeCalibration();
    savePreferences(true);
}

function savePreferences(saveWindow = false) {
    const windowTitle = windows.value.find((window) => String(window.hwnd) === hwnd.value)?.title;
    if (saveWindow && windowTitle) {
        preferencePending.value = { windowTitle, region: region.value && { ...region.value } };
    }
    const stored = readFengyaoPreferences();
    if (!stored.ok) {
        preferenceError.value = stored.error;
        return;
    }
    // 自动选中的窗口仅作首选项，变更场景时保留已有窗口和确认过的选区。
    const calibration = preferencePending.value ?? stored.value;
    const initialWindow = glass && !calibrationOpen.value ? windowTitle : undefined;
    const saved = saveFengyaoPreferences({
        reminders: reminders.value,
        windowTitle: calibration?.windowTitle || initialWindow || '',
        region: calibration?.region ?? null,
    });
    if (saved) preferencePending.value = null;
    preferenceError.value = saved ? '' : '设置保存失败，可重试';
}

async function beginWatching(frame: MessageRegion, customRegion: MessageRegion | null) {
    status.value = await startFengyao({
        hwnd: Number(hwnd.value),
        reminders: activeReminders(reminders.value),
        region: frame,
    });
    region.value = customRegion;
    closeCalibration();
    savePreferences(true);
}

async function completeSelection() {
    await act(async () => {
        if (!isMessageRegion(draftRegion.value)) throw new Error('请框选完整系统消息区域');
        const selected = { ...draftRegion.value };
        if (startAfterSelection.value) {
            await beginWatching(selected, selected);
            return;
        }
        region.value = selected;
        closeCalibration();
        savePreferences(true);
    });
}

async function toggle() {
    await act(async () => {
        if (running.value) {
            status.value = await stopFengyao();
            return;
        }
        if (!activeReminders(reminders.value).length) throw new Error('请先开启至少一种提醒');
        await refreshWindows();
        if (disposed) return;
        if (!hwnd.value) throw new Error('请先选择游戏窗口，未找到时请打开游戏后刷新');
        const image = await captureFengyaoWindow(Number(hwnd.value));
        if (disposed) return;
        const selected = region.value;
        if (glass && !selected) {
            await beginWatching(wholeFengyaoFrame(image), null);
        } else if (fengyaoRegionMatchesFrame(selected, image)) {
            await beginWatching(selected, selected);
        } else {
            openCalibration(image, true);
        }
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
        const frame = next.config.region;
        const whole =
            frame.x === 0 &&
            frame.y === 0 &&
            frame.width === frame.frameWidth &&
            frame.height === frame.frameHeight;
        region.value = glass && whole ? null : { ...frame };
        const active = next.config.reminders;
        reminders.value = reminders.value.map((setting) => {
            const filter = active.find(({ kind }) => kind === setting.kind);
            return { ...setting, enabled: !!filter, scenes: filter?.scenes ?? setting.scenes };
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
        <div class="fengyao" :class="{ 'fy-glass': glass, 'fy-calibrating': calibrationOpen }">
            <div class="fy-status-row">
                <p class="fy-status" role="status" :class="{ live: running && !status?.error }">
                    {{ stateText }}
                </p>
                <p v-if="!glass" class="note">应用运行时持续监听。</p>
            </div>
            <p v-if="error" class="note danger-text" role="alert">{{ error }}</p>
            <p v-if="statusError" class="note danger-text" role="alert">{{ statusError }}</p>
            <div v-if="preferenceError" class="fy-feedback">
                <p class="note danger-text" role="alert">{{ preferenceError }}</p>
                <PressButton
                    text="重试"
                    label="重试保存监听设置"
                    size="sm"
                    @click="savePreferences()"
                />
            </div>
            <p v-if="status?.notificationError" class="note danger-text" role="alert">
                {{ status.notificationError }}
            </p>

            <component :is="card" v-bind="cardProps" class="fy-settings">
                <div class="fy-card-head">
                    <GroupHead as="h3">监听设置</GroupHead>
                </div>
                <div class="fy-fields" :class="{ 'lg-form-fields': glass }">
                    <div class="form-field">
                        <span>游戏窗口</span>
                        <div class="fy-window-control">
                            <GlassSelect
                                v-if="glass"
                                :model-value="hwnd"
                                class="fy-window-select"
                                @update:model-value="selectWindow"
                                :options="windowOptions"
                                label="监听的游戏窗口"
                                :disabled="running || busy"
                                hide-label
                            />
                            <SelectField
                                v-else
                                v-model="hwnd"
                                :options="windowOptions"
                                label="监听的游戏窗口"
                                :disabled="running || busy"
                                placeholder="请选择游戏窗口"
                            />
                            <PressButton
                                text="刷新"
                                label="重新查找游戏窗口"
                                :disabled="running || busy || !desktop"
                                @click="act(refreshWindows)"
                            />
                        </div>
                    </div>
                    <div v-if="glass" class="form-field">
                        <span>监听范围</span>
                        <div class="fy-scope-control">
                            <span>{{ validRegion ? '自定义选区' : '整个窗口' }}</span>
                            <PressButton
                                :text="validRegion ? '重新框选' : '框选区域'"
                                label="截取游戏画面并框选系统消息区域"
                                :disabled="running || busy || !hwnd"
                                @click="capture"
                            />
                            <PressButton
                                v-if="validRegion"
                                text="用整个窗口"
                                label="改用整个游戏窗口"
                                :disabled="running || busy"
                                @click="useWholeWindow"
                            />
                        </div>
                    </div>
                    <div v-else class="form-field">
                        <span
                            >系统消息区域
                            <small class="meta">{{
                                validRegion ? '已设置' : '未设置'
                            }}</small></span
                        >
                        <PressButton
                            :text="validRegion ? '重新框选' : '框选消息区域'"
                            label="截取游戏画面并框选系统消息区域"
                            :disabled="running || busy || !hwnd"
                            @click="capture"
                        />
                    </div>
                </div>
                <section class="fy-types" aria-label="提醒类型">
                    <div v-for="setting in reminders" :key="setting.kind" class="fy-type">
                        <div class="fy-type-row">
                            <button
                                type="button"
                                class="fy-type-button"
                                :aria-expanded="expanded === setting.kind"
                                :aria-controls="`fy-maps-${setting.kind}`"
                                @click="expandReminder(setting)"
                            >
                                <span>{{ reminderLabels[setting.kind] }}</span>
                                <span class="meta">{{
                                    setting.scenes.length
                                        ? `已选 ${setting.scenes.length} 个地图`
                                        : '全部地图'
                                }}</span>
                                <AppIcon
                                    :name="
                                        expanded === setting.kind ? 'chevron-down' : 'chevron-right'
                                    "
                                />
                            </button>
                            <GlassSwitch
                                v-if="glass"
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
                        <div
                            v-show="expanded === setting.kind"
                            :id="`fy-maps-${setting.kind}`"
                            class="fy-map-settings"
                        >
                            <div
                                v-if="expanded === setting.kind && setting.kind === 'fengyao'"
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
                                    :disabled="busy"
                                    @click="toggleScene(setting, scene.name)"
                                >
                                    {{ scene.name }}
                                </button>
                            </div>
                            <form
                                v-else-if="expanded === setting.kind"
                                class="fy-map-form"
                                @submit.prevent="applyMaps(setting)"
                            >
                                <GlassInput
                                    v-if="glass"
                                    v-model="mapInput"
                                    :aria-label="`${reminderLabels[setting.kind]}地图`"
                                    placeholder="留空为全部地图，多个地图用逗号分隔"
                                    maxlength="512"
                                    :disabled="busy || !status"
                                />
                                <input
                                    v-else
                                    v-model="mapInput"
                                    :aria-label="`${reminderLabels[setting.kind]}地图`"
                                    placeholder="留空为全部地图，多个地图用逗号分隔"
                                    maxlength="512"
                                    :disabled="busy || !status"
                                />
                                <button
                                    type="submit"
                                    class="fy-type-button"
                                    :disabled="busy || !status"
                                >
                                    应用
                                </button>
                            </form>
                            <p
                                v-if="expanded === 'yecha' && setting.kind === 'yecha'"
                                class="meta fy-map-note"
                            >
                                当前识别携宝龙龟的夜叉刷新公告
                            </p>
                        </div>
                    </div>
                </section>
            </component>

            <component
                v-if="calibrationOpen && shot"
                :is="card"
                v-bind="cardProps"
                class="fy-calibration"
            >
                <div class="fy-card-head">
                    <h3 v-if="glass" ref="calibrationHeading" tabindex="-1">框选系统消息</h3>
                    <GroupHead v-else as="h3">框选系统消息</GroupHead>
                    <div class="fy-calibration-actions">
                        <PressButton
                            v-if="glass"
                            text="取消"
                            label="取消框选"
                            :disabled="busy"
                            @click="closeCalibration"
                        />
                        <PressButton
                            :text="startAfterSelection ? '完成并开始监听' : '完成框选'"
                            label="完成系统消息区域框选"
                            :disabled="busy || !validDraftRegion"
                            @click="completeSelection"
                        />
                    </div>
                </div>
                <p class="note">
                    拖动框住最新几条公告，保留“[系统]”标记和完整正文。游戏内保持消息区展开；改变窗口尺寸后需重新框选。
                </p>
                <div
                    class="fy-canvas"
                    :style="glass ? { '--fy-frame-ratio': shot.width / shot.height } : undefined"
                    role="group"
                    aria-label="拖动框选系统消息区域"
                    @pointerdown.prevent="beginSelection"
                    @pointermove="moveSelection"
                    @pointerup="endSelection"
                    @pointercancel="endSelection"
                >
                    <img
                        :src="shot.image"
                        alt="用于选择系统消息区域的当前游戏画面"
                        draggable="false"
                    />
                    <div v-if="draftRegion" class="fy-selection" :style="selectionStyle" />
                </div>
                <details v-if="draftRegion" class="fy-details fy-adjust">
                    <summary>手动设置选区</summary>
                    <div class="fy-coordinates fy-details-body">
                        <label class="form-field"
                            >左边距<NumberField v-model="draftRegion.x" label="选区左边距"
                        /></label>
                        <label class="form-field"
                            >上边距<NumberField v-model="draftRegion.y" label="选区上边距"
                        /></label>
                        <label class="form-field"
                            >宽度<NumberField v-model="draftRegion.width" label="选区宽度"
                        /></label>
                        <label class="form-field"
                            >高度<NumberField v-model="draftRegion.height" label="选区高度"
                        /></label>
                    </div>
                </details>
            </component>

            <component :is="card" v-bind="cardProps" class="fy-history">
                <GroupHead as="h3">最近提醒</GroupHead>
                <p v-if="!recentAlerts.length" class="note" :class="{ 'fy-empty-alerts': glass }">
                    暂无提醒
                </p>
                <ol v-else class="fy-reminders">
                    <li v-for="alert in recentAlerts" :key="alert.id">
                        <details class="fy-reminder">
                            <summary>
                                <span class="fy-reminder-kind">{{
                                    reminderLabels[alert.kind]
                                }}</span>
                                <span class="fy-reminder-place">
                                    {{ alert.scene
                                    }}<small v-if="alert.coordinates">
                                        · {{ alert.coordinates }}</small
                                    >
                                </span>
                                <time :datetime="new Date(alert.at).toISOString()">{{
                                    timeText(new Date(alert.at))
                                }}</time>
                                <AppIcon name="chevron-right" aria-hidden="true" />
                            </summary>
                            <p class="fy-transcript">{{ alert.text }}</p>
                        </details>
                    </li>
                </ol>
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
    gap: 12px;
    max-width: 1000px;
}
.fy-status-row,
.fy-card-head,
.fy-feedback {
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
.fy-calibration {
    display: grid;
    gap: 14px;
    padding: 16px;
    min-width: 0;
}
.fengyao .group-head {
    margin: 0;
}
.fy-fields {
    display: grid;
    grid-template-columns: minmax(0, 360px) minmax(150px, 180px);
    gap: 20px;
    align-items: start;
}
.fy-fields .form-field {
    min-width: 0;
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
.fy-canvas {
    position: relative;
    width: 100%;
    max-width: 680px;
    justify-self: center;
    touch-action: none;
    user-select: none;
    cursor: crosshair;
}
.fy-canvas img {
    width: 100%;
    height: auto;
    display: block;
    pointer-events: none;
}
.fy-selection {
    position: absolute;
    border: 2px solid var(--seal);
    background: color-mix(in srgb, var(--seal) 15%, transparent);
    pointer-events: none;
    box-sizing: border-box;
}
.fy-coordinates {
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
.fy-glass > :not(.fy-settings, .fy-history) {
    grid-column: 1 / -1;
}
.fy-glass :is(.fy-settings, .fy-history, .fy-calibration) {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    gap: 12px;
    padding: 12px 14px;
}
.fy-glass .fy-fields {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
}
.fy-window-select {
    flex: 1;
    min-width: 0;
}
.fy-scope-control,
.fy-calibration-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}
.fy-scope-control > span {
    color: var(--liquid-muted);
    font-size: var(--fs-sm);
}
.fy-types {
    border-top: 1px solid var(--liquid-outline, var(--rule));
}
.fy-type + .fy-type,
.fy-reminders li + li {
    border-top: 1px solid var(--liquid-outline, var(--rule));
}
.fy-type-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding-block: 4px;
}
.fy-type-button,
.fy-map-grid button {
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
}
.fy-type-button {
    --icon-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 4px 7px;
    text-align: start;
}
.fy-type-button .meta {
    margin-inline-start: auto;
}
.fy-map-settings {
    padding: 3px 0 9px;
}
.fy-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 106px), 1fr));
    gap: 3px 6px;
}
.fy-map-grid button {
    min-height: 29px;
    padding: 4px 8px;
    text-align: start;
}
.fy-type-button:hover:not(:disabled),
.fy-map-grid button:hover:not(:disabled) {
    background: var(--ledger-surface, var(--paper-2));
}
.fy-map-grid button[aria-pressed='true'] {
    background: var(--ledger-selected, var(--paper-2));
    color: var(--liquid-focus, var(--accent));
}
.fy-map-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
}
.fy-map-note {
    margin: 5px 0 0;
}
.fy-map-form :deep(.glass-input) {
    font-size: var(--fs-sm);
}
.fy-reminders {
    margin: 0;
    padding: 0;
    list-style: none;
}
.fy-reminder summary {
    --icon-size: 11px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: baseline;
    gap: 6px;
    padding: 7px 1px;
    cursor: pointer;
    font-size: var(--fs-sm);
}
.fy-reminder summary::-webkit-details-marker {
    display: none;
}
.fy-reminder[open] summary .app-icon {
    transform: rotate(90deg);
}
.fy-reminder-kind {
    padding: 2px 5px;
    border-radius: var(--r-1);
    background: var(--ledger-surface, var(--paper-2));
    font-size: var(--fs-mini);
}
.fy-reminder-place {
    overflow-wrap: anywhere;
}
.fy-reminder time,
.fy-reminder-place small {
    color: var(--liquid-muted, var(--muted));
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.fy-reminder .fy-transcript {
    padding: 2px 1px 8px;
}
.fy-glass .fy-empty-alerts {
    padding: 8px;
    border-radius: var(--r-1);
    background: var(--ledger-surface);
    text-align: center;
}
.fy-glass .fy-canvas {
    max-width: min(680px, max(220px, calc((100dvh - 230px) * var(--fy-frame-ratio))));
}
.fy-calibration h3[tabindex] {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 400;
}
@media (min-width: 840px) {
    .fy-glass:not(.fy-calibrating) {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
}
@media (max-width: 620px) {
    .fy-glass .fy-fields {
        grid-template-columns: minmax(0, 1fr);
    }
}
@media (max-width: 760px) {
    .fy-fields {
        grid-template-columns: minmax(0, 360px);
    }
    .fy-coordinates {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
