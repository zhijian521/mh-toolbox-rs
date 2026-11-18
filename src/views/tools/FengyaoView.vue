<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PageShell from '../../components/PageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import NumberField from '../../components/NumberField.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import GroupHead from '../../components/GroupHead.vue';
import AppIcon from '../../components/AppIcon.vue';
import PressTile from '../../components/PressTile.vue';
import { hasDesktop } from '../../services/desktop';
import { listGhostWindows, type GhostWindow } from '../../services/ghost';
import {
    captureFengyaoWindow, fengyaoStatus, startFengyao, stopFengyao,
    isMessageRegion, readFengyaoPreferences, saveFengyaoPreferences,
    type MessageRegion, type WatchStatus, type WindowShot,
} from '../../services/fengyao';
import { timeText } from '../../services/clock';

/** 区域校准与当前回执；持续捕获、解析、去重和系统提醒均由宿主负责。 */
const router = useRouter();
const desktop = hasDesktop();
const remembered = readFengyaoPreferences();
const preferences = remembered.ok ? remembered.value : null;
const preferenceError = ref(remembered.ok ? '' : remembered.error);
const windows = ref<GhostWindow[]>([]);
const hwnd = ref('');
const scenes = ref<string[]>(preferences?.scenes ?? []);
const status = ref<WatchStatus | null>(null);
const shot = ref<WindowShot | null>(null);
const calibrationOpen = ref(false);
const startAfterSelection = ref(false);
const region = ref<MessageRegion | null>(null);
const busy = ref(false);
const error = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;
let polling = false;
let revision = 0;
let anchor: { x: number; y: number } | null = null;
const running = computed(() => status.value?.running === true);
const windowOptions = computed(() => windows.value.map((w) => ({ value: String(w.hwnd), label: w.title })));
const sceneRules = computed(() => status.value?.rules.scenes ?? []);
const validRegion = computed(() => isMessageRegion(region.value));
const recentAlerts = computed(() => status.value?.alerts.slice(0, 3) ?? []);
const stateText = computed(() => {
    if (!desktop) return '请在桌面应用中使用';
    if (status.value?.error && running.value) return status.value.error;
    if (!running.value) return '未开始';
    return status.value?.baselineReady ? '监听中 · 新公告符合条件时提醒' : '正在建立消息基线';
});
const selectionStyle = computed(() => {
    const r = region.value;
    if (!r) return {};
    return { left: `${r.x / r.frameWidth * 100}%`, top: `${r.y / r.frameHeight * 100}%`,
        width: `${r.width / r.frameWidth * 100}%`, height: `${r.height / r.frameHeight * 100}%` };
});

watch(hwnd, () => {
    startAfterSelection.value = false;
    calibrationOpen.value = false;
    shot.value = null;
    region.value = null;
}, { flush: 'sync' });

async function refreshWindows() {
    const found = await listGhostWindows();
    windows.value = found.filter((w) => /梦幻西游|mhtab/i.test(w.title));
    if (windows.value.some((w) => String(w.hwnd) === hwnd.value)) return;
    const rememberedWindow = windows.value.filter((w) => w.title === preferences?.windowTitle);
    const chatWindows = windows.value.filter((w) => /聊天窗口/.test(w.title));
    const selected = rememberedWindow.length === 1 ? rememberedWindow[0]
        : chatWindows.length === 1 ? chatWindows[0]
        : windows.value.length === 1 ? windows.value[0] : undefined;
    hwnd.value = selected ? String(selected.hwnd) : '';
}

async function act(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    revision += 1;
    error.value = '';
    try { await action(); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
    finally { busy.value = false; }
}

async function capture() {
    await act(async () => {
        startAfterSelection.value = false;
        const image = await captureFengyaoWindow(Number(hwnd.value));
        shot.value = image;
        if (region.value?.frameWidth !== image.width || region.value.frameHeight !== image.height) {
            region.value = null;
        }
        calibrationOpen.value = true;
    });
}

function point(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const image = shot.value;
    if (!image) return { x: 0, y: 0 };
    return {
        x: Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * image.width),
        y: Math.round(Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) * image.height),
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
    region.value = {
        x: Math.min(anchor.x, to.x), y: Math.min(anchor.y, to.y),
        width: Math.abs(to.x - anchor.x), height: Math.abs(to.y - anchor.y),
        frameWidth: shot.value.width, frameHeight: shot.value.height,
    };
}

function endSelection() { anchor = null; }

function toggleScene(name: string, enabled: boolean) {
    scenes.value = enabled ? [...scenes.value, name] : scenes.value.filter((s) => s !== name);
    savePreferences();
}

function savePreferences() {
    if (!remembered.ok) return;
    const stored = readFengyaoPreferences();
    if (!stored.ok) {
        preferenceError.value = stored.error;
        return;
    }
    const windowTitle = windows.value.find((w) => String(w.hwnd) === hwnd.value)?.title;
    const saved = saveFengyaoPreferences({
        scenes: [...scenes.value],
        windowTitle: windowTitle ?? stored.value?.windowTitle ?? '',
        // 游戏暂未打开时修改地图，仍保留上次完成的消息选区。
        region: windowTitle
            ? validRegion.value && region.value ? { ...region.value } : null
            : stored.value?.region ?? null,
    });
    preferenceError.value = saved ? '' : '地图设置保存失败，本次仍可监听；请稍后重试';
}

async function beginWatching() {
    if (!desktop) throw new Error('请在桌面应用中开始监听');
    if (!scenes.value.length) throw new Error('请先开启至少一个提醒地图');
    if (!hwnd.value) throw new Error('请先选择游戏窗口');
    if (!isMessageRegion(region.value)) throw new Error('请框选完整系统消息区域');
    status.value = await startFengyao({ hwnd: Number(hwnd.value),
        scenes: [...scenes.value], region: { ...region.value } });
    calibrationOpen.value = false;
    startAfterSelection.value = false;
    savePreferences();
}

async function completeSelection() {
    await act(async () => {
        if (!isMessageRegion(region.value)) throw new Error('请框选完整系统消息区域');
        if (startAfterSelection.value) {
            await beginWatching();
            return;
        }
        calibrationOpen.value = false;
        savePreferences();
    });
}

async function toggle() {
    await act(async () => {
        if (running.value) {
            status.value = await stopFengyao();
            return;
        }
        if (!scenes.value.length) throw new Error('请先开启至少一个提醒地图');
        await refreshWindows();
        if (!hwnd.value) throw new Error('请先选择游戏窗口，未找到时请打开游戏后刷新');
        const image = await captureFengyaoWindow(Number(hwnd.value));
        // 保存的相对选区只在同尺寸下复用，不能把旧窗口句柄或缩放带入新监听。
        if (!isMessageRegion(region.value) || region.value.frameWidth !== image.width
            || region.value.frameHeight !== image.height) {
            shot.value = image;
            region.value = null;
            startAfterSelection.value = true;
            calibrationOpen.value = true;
            return;
        }
        await beginWatching();
    });
}

async function poll() {
    if (polling || busy.value || disposed) return;
    polling = true;
    const current = revision;
    try {
        const next = await fengyaoStatus();
        if (!disposed && current === revision) status.value = next;
    } catch (cause) {
        if (!disposed && current === revision) error.value = String(cause);
    } finally { polling = false; }
}

onMounted(async () => {
    if (!desktop) return;
    await act(async () => {
        const [next] = await Promise.all([fengyaoStatus(), refreshWindows()]);
        if (disposed) return;
        status.value = next;
        scenes.value = scenes.value.filter((name) => next.rules.scenes.some((s) => s.name === name));
        // 停止的任务只是历史快照，不能覆盖用户后来保存的新窗口或选区。
        if (next.running && next.config) {
            hwnd.value = String(next.config.hwnd);
            region.value = { ...next.config.region };
            scenes.value = [...next.config.scenes];
        }
        if (!region.value && preferences && preferences.windowTitle === windows.value.find((w) => String(w.hwnd) === hwnd.value)?.title) {
            region.value = preferences.region ? { ...preferences.region } : null;
        }
    });
    if (!disposed) timer = setInterval(() => void poll(), 1200);
});
onBeforeUnmount(() => {
    disposed = true;
    // 页面只销毁状态轮询；后台监听只由用户点击停止或退出应用结束。
    if (timer) clearInterval(timer);
});
</script>

<template>
    <PageShell title="封妖助手" desc="系统公告 · 按场景提醒">
        <template #actions>
            <PressButton icon="back" text="返回" label="返回工具列表" @click="router.push('/tools')" />
            <PressButton
                :icon="running ? 'stop' : 'play'"
                :text="running ? '停止监听' : '开始监听'"
                :label="running ? '停止封妖监听' : '开始封妖监听'"
                seal
                :disabled="busy || !desktop"
                @click="toggle"
            />
        </template>
        <div class="fengyao">
            <div class="fy-status-row">
                <p class="fy-status" role="status" :class="{ live: running && !status?.error }">{{ stateText }}</p>
                <p class="note">离开此页或最小化后继续提醒；关闭应用后停止。</p>
            </div>
            <p v-if="error" class="note danger-text" role="alert">{{ error }}</p>
            <p v-if="preferenceError" class="note danger-text" role="alert">{{ preferenceError }}</p>
            <p v-if="status?.notificationError" class="note danger-text" role="alert">{{ status.notificationError }}</p>

            <PaperCard class="fy-settings">
                <div class="fy-card-head">
                    <GroupHead as="h3">监听设置</GroupHead>
                    <span class="meta">已开启 {{ scenes.length }} 个场景</span>
                </div>
                <div class="fy-fields">
                    <div class="form-field">
                        <span>游戏窗口</span>
                        <div class="fy-window-control">
                            <SelectField
                                v-model="hwnd"
                                :options="windowOptions"
                                label="监听的游戏窗口"
                                :disabled="running || busy"
                                placeholder="请选择游戏窗口"
                            />
                            <PressButton text="刷新" label="重新查找游戏窗口" :disabled="running || busy || !desktop" @click="act(refreshWindows)" />
                        </div>
                    </div>
                    <div class="form-field">
                        <span>系统消息区域 <small class="meta">{{ validRegion ? '已设置' : '未设置' }}</small></span>
                        <PressButton :text="validRegion ? '重新框选' : '框选消息区域'" label="截取游戏画面并框选系统消息区域" :disabled="running || busy || !hwnd" @click="capture" />
                    </div>
                </div>
                <div class="fy-scenes" role="group" aria-label="提醒场景">
                    <div v-for="scene in sceneRules" :key="scene.name" class="fy-scene">
                        <span>{{ scene.name }}</span>
                        <CostSwitch
                            :model-value="scenes.includes(scene.name)"
                            off-label="关"
                            on-label="开"
                            :label="`${scene.name}刷妖提醒`"
                            :disabled="running || busy"
                            @update:model-value="toggleScene(scene.name, $event)"
                        />
                    </div>
                </div>
                <p class="note">已选地图自动保存。点击“开始监听”，首次使用时框选系统消息；修改设置前请先停止。</p>
            </PaperCard>

            <PaperCard v-if="calibrationOpen && shot" class="fy-calibration">
                <div class="fy-card-head">
                    <GroupHead as="h3">框选系统消息</GroupHead>
                    <PressButton :text="startAfterSelection ? '完成并开始监听' : '完成框选'" label="完成系统消息区域框选" :disabled="busy || !validRegion" @click="completeSelection" />
                </div>
                <p class="note">拖动框住最新几条公告，保留“[系统]”标记和完整正文。游戏内保持消息区展开；改变窗口尺寸后需重新框选。</p>
                <div class="fy-canvas" role="group" aria-label="拖动框选系统消息区域" @pointerdown.prevent="beginSelection" @pointermove="moveSelection" @pointerup="endSelection" @pointercancel="endSelection">
                    <img :src="shot.image" alt="用于选择系统消息区域的当前游戏画面" draggable="false" />
                    <div v-if="region" class="fy-selection" :style="selectionStyle" />
                </div>
                <details v-if="region" class="fy-details fy-adjust">
                    <summary>手动设置选区</summary>
                    <div class="fy-coordinates fy-details-body">
                        <label class="form-field">左边距<NumberField v-model="region.x" label="选区左边距" /></label>
                        <label class="form-field">上边距<NumberField v-model="region.y" label="选区上边距" /></label>
                        <label class="form-field">宽度<NumberField v-model="region.width" label="选区宽度" /></label>
                        <label class="form-field">高度<NumberField v-model="region.height" label="选区高度" /></label>
                    </div>
                </details>
            </PaperCard>

            <PaperCard class="fy-history">
                <GroupHead as="h3">最近提醒</GroupHead>
                <p v-if="!recentAlerts.length" class="note">暂无新提醒，所选场景刷妖时会弹出系统通知。</p>
                <ol v-else class="fy-alerts">
                    <li v-for="alert in recentAlerts" :key="alert.id">
                        <PressTile class="fy-alert-tile" still>
                            <AppIcon name="pin" class="fy-alert-icon" />
                            <span class="fy-alert-copy">
                                <strong>{{ alert.scene }}</strong>
                                <time :datetime="new Date(alert.at).toISOString()">{{ timeText(new Date(alert.at)) }} · 刷妖提醒</time>
                            </span>
                        </PressTile>
                    </li>
                </ol>
                <details class="fy-details fy-reading">
                    <summary>识别详情</summary>
                    <div class="fy-details-body">
                        <p v-if="status?.lastReadAt" class="meta">最近读取 {{ timeText(new Date(status.lastReadAt)) }} · {{ status.ocrMs }}ms</p>
                        <pre v-if="status?.text.length" class="fy-transcript">{{ status.text.join('\n') }}</pre>
                        <p v-else class="note">开始监听后显示识别原文，首次读取仅建立基线，不提醒旧公告。</p>
                        <p class="note">仅提醒普通放妖公告；公告不代表妖怪仍未被击败。</p>
                    </div>
                </details>
            </PaperCard>
        </div>
    </PageShell>
</template>

<style scoped>
.fengyao {
    display: grid;
    gap: 16px;
}
.fy-status-row, .fy-card-head {
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
.fy-settings, .fy-history, .fy-calibration {
    display: grid;
    gap: 18px;
    padding: 22px;
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
.fy-scenes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px 28px;
}
.fy-scene {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--fs-sm);
}
.fy-alerts {
    list-style: none;
    padding: 2px 0 5px;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, max(calc(160px * var(--fs-scale)), calc((100% - 30px) / 4))), 1fr)
    );
    gap: 10px;
}
.fy-alerts li {
    min-width: 0;
}
.fy-alert-tile {
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-2);
    --tile-drop: 1.4;
    --tile-face: color-mix(in srgb, var(--accent) 5%, var(--paper));
    min-height: calc(76px * var(--fs-scale));
    padding: 9px 12px;
}
.fy-alert-tile :deep(.press-content) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    min-width: 0;
}
.fy-alert-icon {
    --icon-size: calc(19px * var(--fs-scale));
    color: var(--accent);
}
.fy-alert-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
}
.fy-alert-copy strong {
    color: var(--accent);
    font-size: var(--fs-sm);
    font-weight: 400;
}
.fy-alert-copy time {
    color: var(--muted);
    font-size: var(--fs-mini);
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
@media (max-width: 760px) {
    .fy-fields {
        grid-template-columns: minmax(0, 360px);
    }
    .fy-coordinates {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
