<script setup lang="ts">
import AppNotice from '../components/AppNotice.vue';
import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { hasDesktop, openExternal } from '../services/desktop';
import { useDraftGuard } from '../composables/use-draft-guard';
import { askConfirm } from '../composables/use-confirm';
import { reloadWithDataNotice, takeDataNotice, truncationNote } from './settings/data-notice';
import { backupTime, useBackups } from './settings/use-backups';
import {
    dataClear,
    dataExport,
    dataImport,
    restoreBackup,
    type BackupEntry,
    type DataOutcome,
} from '../services/data-files';
import { checkUpdate, type UpdateResult } from '../services/updates';
import GlassDialog from '../components/liquid-glass/GlassDialog.vue';
import { GlassButton, GlassCard, GlassSegment, GlassSegmented } from '../components/liquid-glass';
import { useLiquidPreferences } from '../composables/use-liquid-preferences';
import { useAppInfo } from '../composables/use-app-info';
import { WALLPAPER_CDN } from '../services/xyq-wallpapers';
import LiquidWallpaperPicker from './settings/LiquidWallpaperPicker.vue';
import catalog from './settings/xyq-wallpapers.json';

const {
    appearance,
    wallpaper,
    systemWallpaper,
    activeImage,
    selectedWallpaper,
    loadingWallpaper,
    failedWallpaper,
    selectWallpaper,
} = useLiquidPreferences();
const { info, version } = useAppInfo();
const desktop = hasDesktop();

/* ---------- 数据：账本、备份与清除共用一份忙状态和一句回执 ----------
 * 与正式版 DataSection 同一口径：三个操作都整份动同一份账本，忙时一起停；
 * 成功后重载领域单例，回执与备份路径跨重载保留一次。 */
const busy = ref(false);
const ledgerDisabled = computed(() => !desktop || busy.value);
const message = ref('');
const warning = ref('');
const messageKind = ref<'error' | 'positive'>('positive');

async function run(action: () => Promise<DataOutcome>): Promise<DataOutcome> {
    busy.value = true;
    try {
        let outcome: DataOutcome;
        try {
            outcome = await action();
        } catch (error) {
            // 动态导入失败、IPC 通道断开等不走 DataOutcome 的错误也要落下回执，
            // 否则按钮会永远停在禁用态。
            outcome = {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            };
        }
        if (outcome.status === 'ok') {
            messageKind.value = 'positive';
            message.value = outcome.detail;
            warning.value = [outcome.warning, truncationNote(outcome.truncation)]
                .filter(Boolean)
                .join(' ');
        } else if (outcome.status === 'failed') {
            messageKind.value = 'error';
            message.value = outcome.error;
            warning.value = '';
        } else {
            message.value = '';
            warning.value = '';
        }
        return outcome;
    } finally {
        busy.value = false;
    }
}

function reloadWithNotice() {
    reloadWithDataNotice(message.value, warning.value);
}

async function exportLedger() {
    await run(dataExport);
}

async function askImport() {
    const ok = await askConfirm({
        danger: true,
        title: '替换当前账本？',
        note: '选中的备份会覆盖全部数据。',
        confirmText: '替换',
    });
    if (!ok) return;
    const outcome = await run(dataImport);
    if (outcome.status === 'ok') reloadWithNotice();
}

async function importLegacy(): Promise<DataOutcome> {
    const { importLegacyLedger } = await import('./settings/import-legacy-ledger');
    return importLegacyLedger();
}

async function doImportLegacy() {
    const outcome = await run(importLegacy);
    if (outcome.status === 'ok') reloadWithNotice();
}

async function askClear() {
    const ok = await askConfirm({
        danger: true,
        title: '清空全部账本？',
        note: '所有数据会被删除，无法撤销。',
        confirmText: '清除',
    });
    if (!ok) return;
    const outcome = await run(dataClear);
    if (outcome.status === 'ok') reloadWithNotice();
}

const {
    entries: backups,
    loading: backupsLoading,
    error: backupsError,
    warning: backupsWarning,
    refresh: refreshBackups,
} = useBackups();
const backupsOpen = ref(false);

function openBackups() {
    backupsOpen.value = true;
    void refreshBackups();
}

async function restore(entry: BackupEntry) {
    if (busy.value) return;
    const ok = await askConfirm({
        danger: true,
        title: '恢复这份备份？',
        note: `${new Date(entry.createdAt).toLocaleString('zh-CN')} 的账本会覆盖当前内容。`,
        confirmText: '恢复',
    });
    if (!ok) return;
    const outcome = await run(() => restoreBackup(entry.name));
    if (outcome.status === 'ok') reloadWithNotice();
}

useDraftGuard(() => false, () => busy.value, () => {});
onBeforeRouteLeave(() => !busy.value);
onMounted(() => {
    if (desktop) void refreshBackups();
    const saved = takeDataNotice();
    if (!saved.text) return;
    messageKind.value = 'positive';
    message.value = saved.text;
    warning.value = saved.warning;
});

/* ---------- 关于：手动检查正式 Release ---------- */
const checking = ref(false);
const updateError = ref('');
const update = ref<UpdateResult | null>(null);
const updateMessage = computed(() => {
    if (checking.value) return '正在检查…';
    if (updateError.value) return updateError.value;
    if (update.value?.status === 'none') return '暂无正式版本';
    if (update.value?.status === 'current') return '暂无更新版本';
    if (update.value?.status === 'available') return `发现新版本 ${update.value.version}`;
    return '手动检查正式版本';
});

async function check() {
    if (checking.value) return;
    checking.value = true;
    updateError.value = '';
    try {
        update.value = await checkUpdate(version.value);
    } catch (cause) {
        update.value = null;
        updateError.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        checking.value = false;
    }
}

async function download() {
    if (update.value?.status !== 'available') return;
    if (!(await openExternal(update.value.url))) updateError.value = '下载页未能打开，请重试';
}

const REPO_URL = 'https://github.com/zhijian521/mh-toolbox-rs';
const LICENSE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0';

/* ---------- 外观 ---------- */
const pickerOpen = ref(false);
const wallpaperStatus = computed(() => {
    if (loadingWallpaper.value) return '正在载入壁纸…';
    if (systemWallpaper.value) return systemWallpaper.value.name;
    if (!activeImage.value) return '默认壁纸 · 随主题切换';
    return (
        catalog.find((item) => WALLPAPER_CDN + item.image === selectedWallpaper.value)?.name ??
        '官网壁纸'
    );
});

function applyWallpaper(url: string) {
    pickerOpen.value = false;
    void selectWallpaper(url);
}
</script>

<template>
    <section class="liquid-settings" aria-labelledby="liquid-settings-title">
        <h1 id="liquid-settings-title">设置</h1>
        <div class="liquid-settings-grid">
            <div class="settings-stack">
                <GlassCard class="liquid-settings-panel" :radius="16">
                    <header class="card-heading">
                        <h2>外观</h2>
                    </header>
                    <div class="liquid-settings-row">
                        <span id="liquid-theme-label">主题</span>
                        <GlassSegmented v-model:value="appearance" aria-labelledby="liquid-theme-label">
                            <GlassSegment value="light">浅色</GlassSegment>
                            <GlassSegment value="dark">深色</GlassSegment>
                        </GlassSegmented>
                    </div>
                    <div class="liquid-settings-row background-row">
                        <div class="background-label">
                            <img :src="wallpaper" alt="" class="current-wallpaper" />
                            <div>
                                <span>应用背景</span>
                                <small aria-live="polite">{{ wallpaperStatus }}</small>
                            </div>
                        </div>
                        <div class="background-actions">
                            <GlassButton
                                v-if="systemWallpaper || selectedWallpaper || loadingWallpaper || failedWallpaper"
                                size="small"
                                variant="plain"
                                @click="applyWallpaper('')"
                                >恢复默认</GlassButton
                            >
                            <GlassButton size="small" aria-haspopup="dialog" @click="pickerOpen = true"
                                >选择壁纸</GlassButton
                            >
                        </div>
                    </div>
                    <AppNotice v-if="failedWallpaper" tone="error" role="status">
                        壁纸未能载入，请检查网络。
                        <template #action>
                            <GlassButton size="small" variant="plain" @click="selectWallpaper(failedWallpaper)">重试</GlassButton>
                        </template>
                    </AppNotice>
                </GlassCard>
                <GlassCard
                    class="liquid-settings-panel settings-about"
                    :radius="16"
                    aria-labelledby="liquid-about-title"
                >
                    <header class="card-heading">
                        <h2 id="liquid-about-title">关于</h2>
                        <span class="about-version"
                            >{{ info?.productName ?? '梦幻养老助手' }} · {{ version }}</span
                        >
                    </header>
                    <div class="liquid-settings-row">
                        <span
                            class="update-status"
                            role="status"
                            :class="{ error: !!updateError, available: update?.status === 'available' }"
                            >{{ updateMessage }}</span
                        >
                        <div class="row-actions">
                            <GlassButton
                                v-if="update?.status === 'available'"
                                size="small"
                                @click="download"
                                >下载</GlassButton
                            >
                            <GlassButton size="small" :disabled="checking" @click="check"
                                >检查更新</GlassButton
                            >
                        </div>
                    </div>
                    <!-- 不折叠：三行清单与外观／数据同构。运行信息只留找账本用得上的
                         数据目录，字体／标识／数据库／运行环境等一眼不看的信息收掉。 -->
                    <div class="liquid-settings-row">
                        <span>数据目录</span>
                        <code class="about-path">{{ info?.dataDir ?? '%APPDATA%\\mh-tool-rs' }}</code>
                    </div>
                    <div class="liquid-settings-row">
                        <span>使用许可</span>
                        <div class="row-actions">
                            <span class="about-license-note"
                                >PolyForm Noncommercial 1.0.0 · 禁止商业用途 · 非官方工具</span
                            >
                            <div class="license-links">
                                <a :href="REPO_URL" @click.prevent="openExternal(REPO_URL)"
                                    >项目源码 ↗</a
                                >
                                <a :href="LICENSE_URL" @click.prevent="openExternal(LICENSE_URL)"
                                    >许可证全文 ↗</a
                                >
                            </div>
                        </div>
                    </div>
                </GlassCard>
            </div>
            <GlassCard class="liquid-settings-panel settings-data" :radius="16">
                <header class="card-heading">
                    <h2>数据</h2>
                </header>
                <AppNotice v-if="!desktop" class="card-hint">账本与自动备份只在桌面版可用。</AppNotice>
                <div class="liquid-settings-row">
                    <span>账本</span>
                    <div class="row-actions">
                        <GlassButton size="small" :disabled="ledgerDisabled" @click="exportLedger"
                            >导出</GlassButton
                        >
                        <GlassButton size="small" :disabled="ledgerDisabled" @click="askImport"
                            >导入</GlassButton
                        >
                        <GlassButton size="small" :disabled="ledgerDisabled" @click="doImportLegacy"
                            >导入旧版</GlassButton
                        >
                    </div>
                </div>
                <div class="liquid-settings-row">
                    <span>备份</span>
                    <div class="row-actions">
                        <GlassButton
                            size="small"
                            :disabled="ledgerDisabled"
                            aria-haspopup="dialog"
                            @click="openBackups"
                            >恢复</GlassButton
                        >
                    </div>
                </div>
                <AppNotice v-if="backupsWarning" role="status" class="receipt error" tone="error">
                    自动备份未完成：{{ backupsWarning }}
                </AppNotice>
                <AppNotice v-if="backupsError" role="status" class="receipt error" tone="error">
                    备份状态读取失败：{{ backupsError }}
                </AppNotice>
                <div class="liquid-settings-row">
                    <span>清除</span>
                    <GlassButton size="small" class="danger-action" :disabled="ledgerDisabled" @click="askClear"
                        >清除</GlassButton
                    >
                </div>
                <div role="status" class="receipts">
                    <AppNotice v-if="message" class="receipt" :class="messageKind" :tone="messageKind === 'positive' ? 'success' : 'error'">{{ message }}</AppNotice>
                    <AppNotice v-if="warning" class="receipt warning" tone="warning">{{ warning }}</AppNotice>
                </div>
            </GlassCard>
        </div>

        <GlassDialog
            v-model:open="pickerOpen"
            lazy
            class="wallpaper-dialog"
            label="选择壁纸"
            detents="82% large"
        >
            <LiquidWallpaperPicker
                :active="pickerOpen"
                :selected="selectedWallpaper"
                @select="applyWallpaper"
                @close="pickerOpen = false"
            />
        </GlassDialog>

        <GlassDialog
            v-model:open="backupsOpen"
            lazy
            class="backup-dialog"
            label="备份与恢复"
            detents="82% large"
        >
            <section class="backup-history">
                <header class="card-heading">
                    <h2>备份与恢复</h2>
                    <GlassButton size="small" variant="plain" @click="backupsOpen = false"
                        >关闭</GlassButton
                    >
                </header>
                <AppNotice class="card-hint">
                    日常备份间隔至少 24 小时；日常与替换前备份合计保留最近 5 份，较早的会自动清理；恢复前另存当前账本。
                </AppNotice>
                <AppNotice v-if="backupsWarning" role="alert" class="receipt error" tone="error">
                    自动备份未完成：{{ backupsWarning }}
                </AppNotice>
                <AppNotice v-if="backupsError" role="alert" class="receipt error" tone="error">{{ backupsError }}</AppNotice>
                <AppNotice v-if="messageKind === 'error' && message" role="alert" class="receipt error" tone="error">
                    {{ message }}
                </AppNotice>
                <AppNotice v-if="backupsLoading" role="status" class="receipt">正在读取…</AppNotice>
                <AppNotice v-else-if="!backups.length && !backupsError" class="receipt">暂无备份</AppNotice>
                <div v-else class="backup-list">
                    <div v-for="entry in backups" :key="entry.name" class="backup-row">
                        <div class="backup-info">
                            <span>{{ backupTime(entry.createdAt) }}</span>
                            <small>{{ entry.kind === 'daily' ? '日常' : '替换前' }} · {{ Math.max(1, Math.round(entry.bytes / 1024)) }} KB</small>
                        </div>
                        <GlassButton size="small" :disabled="ledgerDisabled" @click="restore(entry)"
                            >恢复</GlassButton
                        >
                    </div>
                </div>
                <footer>
                    <GlassButton
                        size="small"
                        variant="plain"
                        :disabled="ledgerDisabled || backupsLoading"
                        @click="refreshBackups"
                        >刷新</GlassButton
                    >
                </footer>
            </section>
        </GlassDialog>
    </section>
</template>

<style scoped>
.liquid-settings {
    --liquid-danger: var(--liquid-up, light-dark(#923b3b, #ffb8ae));
    width: min(960px, calc(100% - 32px));
    margin: 0 auto;
    padding: 16px 0;
}

.liquid-settings h1 {
    margin: 0 0 12px;
}

.liquid-settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    align-items: start;
    gap: 14px;
}

.settings-stack {
    display: grid;
    min-width: 0;
    gap: inherit;
}

.liquid-settings-panel {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: block;
    padding: 10px 12px 12px;
    background-color: light-dark(#efffec45, #14241f40);
}

.card-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 10px;
    margin-bottom: 2px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--liquid-outline);
}

.card-heading h2 {
    margin: 0;
}

.about-version {
    font-size: var(--fs-xs);
    color: var(--liquid-muted);
}

.liquid-settings-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px 12px;
    min-height: 44px;
    padding-block: 6px;
    border-top: 1px solid var(--liquid-outline);
}

/* 紧跟卡标题的第一行不要线；其余每行自带顶线，
 * 说明文字插在两行之间也不会打断清单的节奏。 */
.card-heading + .liquid-settings-row {
    border-top: 0;
}

.liquid-settings-row glass-segmented {
    width: 112px;
    letter-spacing: normal;
}

.row-actions,
.background-label,
.background-actions,
.background-error {
    display: flex;
    align-items: center;
    gap: 8px;
}

.row-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
}

.row-actions small {
    opacity: 0.72;
}

.danger-action {
    --glass-foreground: var(--liquid-danger);
}

.background-label {
    flex: 1 1 160px;
    min-width: 0;
}
.background-label small {
    display: block;
    color: var(--liquid-ink);
    opacity: 0.8;
    overflow-wrap: anywhere;
}
.current-wallpaper {
    width: 48px;
    height: 32px;
    object-fit: cover;
    border: 1px solid var(--liquid-outline);
    border-radius: 7px;
}
.background-actions {
    flex-wrap: wrap;
}
.background-error {
    padding-bottom: 8px;
    font-size: var(--fs-sm);
}
.card-hint,
.receipt {
    margin: 4px 0 0;
    opacity: 0.72;
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
}
.receipts:not(:empty) {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--liquid-outline);
}
.receipt {
    opacity: 1;
}
.receipt.error {
    color: var(--liquid-danger);
}
.receipt.warning {
    color: light-dark(#8a6420, #e6c07b);
}

/* 路径写在 <code> 里：浏览器 UA 的 monospace 会直接盖掉继承自 .liquid-app 的字体。
 * 与正式版 AboutSection.vue 的 .about code、blocks.css 的 .note code 同一口径。 */
.about-path {
    min-width: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
    text-align: right;
    overflow-wrap: anywhere;
}

/* 版本状态是一行清单的左侧标签，右侧是按钮组（`.row-actions`）。 */
.update-status {
    min-width: 0;
    font-size: var(--fs-xs);
    opacity: 0.72;
    overflow-wrap: anywhere;
}
.update-status.error {
    color: var(--liquid-danger);
}
.update-status.available {
    color: var(--lg-accent);
}

.about-license-note {
    font-size: var(--fs-xs);
    color: var(--liquid-muted);
}
.license-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
}
.license-links a {
    color: var(--lg-accent);
    font-size: var(--fs-xs);
    text-underline-offset: 3px;
}

.backup-dialog {
    --glass-dialog-width: 560px;
}
/* 备份弹窗内的关闭 / 刷新 / 恢复：半透明面板上统一用页面墨色，
 * 文字阴影已在 glass-button.lg-component 全局关掉，这里补前景与字距。 */
.backup-history {
    --glass-foreground: var(--liquid-ink);
    --glass-accent-text: var(--liquid-ink);
}
.backup-history glass-button {
    letter-spacing: normal;
}
.backup-history header {
    margin-bottom: 8px;
}
.backup-list {
    display: grid;
    gap: 6px;
    margin-top: 10px;
    max-height: min(50dvh, 360px);
    overflow: auto;
}
.backup-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid var(--liquid-outline);
    border-radius: 10px;
    background: light-dark(#ffffff55, #00000026);
}
.backup-info {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    min-width: 0;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}
.backup-info small {
    opacity: 0.72;
}
.backup-history footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
}
.wallpaper-dialog {
    --glass-dialog-width: 580px;
}
</style>
