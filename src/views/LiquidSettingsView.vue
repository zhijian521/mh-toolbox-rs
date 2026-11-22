<script setup lang="ts">
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
        title: '用选中的备份替换现在的账本？',
        note: '全部账本数据（角色、物价、收益流水、速记单价、账号记录与目标）会被整份替换。动手前会自动备份一份，回执里写着它的位置。',
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
        title: '清空全部账本数据？',
        note: '角色、物价、收益流水、速记单价、上线记录与点卡口径、账号记录与目标都会清空。清除前不会自动备份，想留一份就先「导出」。',
        confirmText: '清除',
    });
    if (!ok) return;
    const outcome = await run(dataClear);
    if (outcome.status === 'ok') reloadWithNotice();
}

const {
    entries: backups,
    loading: backupsLoading,
    loaded: backupsLoaded,
    error: backupsError,
    warning: backupsWarning,
    latestDaily,
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
        title: '恢复这份备份并替换当前账本？',
        note: `${new Date(entry.createdAt).toLocaleString('zh-CN')} 的全部账本数据将覆盖当前内容，恢复前会自动另存当前账本。`,
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
const currentName = computed(
    () =>
        catalog.find((item) => WALLPAPER_CDN + item.image === selectedWallpaper.value)?.name ??
        '官网壁纸',
);

function applyWallpaper(url: string) {
    pickerOpen.value = false;
    void selectWallpaper(url);
}
</script>

<template>
    <section class="liquid-settings" aria-labelledby="liquid-settings-title">
        <h1 id="liquid-settings-title">设置</h1>
        <div class="liquid-settings-grid">
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
                            <small aria-live="polite">{{
                                loadingWallpaper
                                    ? '正在载入壁纸…'
                                    : activeImage
                                      ? currentName
                                      : '默认壁纸 · 随主题切换'
                            }}</small>
                        </div>
                    </div>
                    <div class="background-actions">
                        <GlassButton
                            v-if="selectedWallpaper || loadingWallpaper || failedWallpaper"
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
                <div v-if="failedWallpaper" role="status" class="background-error">
                    <span>壁纸未能载入，请检查网络。</span>
                    <GlassButton size="small" variant="plain" @click="selectWallpaper(failedWallpaper)"
                        >重试</GlassButton
                    >
                </div>
            </GlassCard>

            <GlassCard class="liquid-settings-panel" :radius="16">
                <header class="card-heading">
                    <h2>数据</h2>
                </header>
                <p v-if="!desktop" class="card-hint">账本与自动备份只在桌面版可用。</p>
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
                <p class="card-hint">导入将替换全部账本，替换前自动备份。</p>
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
                        <small v-if="latestDaily"
                            >最近自动备份：{{ backupTime(latestDaily.createdAt) }}</small
                        >
                        <small v-else-if="backupsLoading">正在读取备份状态…</small>
                        <small v-else-if="backupsLoaded && !backupsError">{{
                            backups.length ? '保留的快照均为替换前备份' : '尚无自动备份'
                        }}</small>
                    </div>
                </div>
                <p v-if="backupsWarning" role="status" class="receipt error">
                    自动备份未完成：{{ backupsWarning }}
                </p>
                <p v-if="backupsError" role="status" class="receipt error">
                    备份状态读取失败：{{ backupsError }}
                </p>
                <div class="liquid-settings-row">
                    <span>清除</span>
                    <GlassButton size="small" class="danger-action" :disabled="ledgerDisabled" @click="askClear"
                        >清除</GlassButton
                    >
                </div>
                <p class="card-hint">不可撤销，不会自动备份，请先导出。</p>
                <div role="status" class="receipts">
                    <p v-if="message" class="receipt" :class="messageKind">{{ message }}</p>
                    <p v-if="warning" class="receipt warning">{{ warning }}</p>
                </div>
            </GlassCard>
        </div>

        <section class="settings-about" aria-labelledby="liquid-about-title">
            <header class="about-heading">
                <h2 id="liquid-about-title">关于</h2>
                <span>{{ info?.productName ?? '梦幻养老助手' }} · {{ version }}</span>
            </header>
            <div class="update-check">
                <span
                    role="status"
                    :class="{ error: !!updateError, available: update?.status === 'available' }"
                    >{{ updateMessage }}</span
                >
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
            <details class="about-details">
                <summary>运行信息</summary>
                <dl class="about-list">
                    <dt>数据目录</dt>
                    <dd><code>{{ info?.dataDir ?? '%APPDATA%\\mh-tool-rs' }}</code></dd>
                    <dt>字体</dt>
                    <dd>资源圆体（SIL OFL 1.1，常用字子集）</dd>
                    <dt>标识</dt>
                    <dd><code>{{ info?.identifier ?? 'com.zhijian.mhtoolbox.rs' }}</code></dd>
                    <dt>数据库</dt>
                    <dd><code>mh-toolbox.db</code>（SQLite · WAL）</dd>
                    <dt>运行环境</dt>
                    <dd>{{ info?.webview ?? '系统 WebView2（Tauri 2）' }}</dd>
                </dl>
            </details>
            <details class="about-details">
                <summary>使用许可</summary>
                <p class="license-lead">本软件免费使用，源码公开。</p>
                <p class="license-notice">
                    采用 PolyForm Noncommercial 1.0.0 许可；<b>任何以营利为目的的使用均不在授权范围内</b>。
                </p>
                <dl class="license-terms">
                    <div class="allow">
                        <dt>可以</dt>
                        <dd>运行、修改、再发布</dd>
                    </div>
                    <div class="deny">
                        <dt>不可以</dt>
                        <dd>商业用途</dd>
                    </div>
                </dl>
                <div class="license-links">
                    <a :href="REPO_URL" @click.prevent="openExternal(REPO_URL)">项目源码 ↗</a>
                    <a :href="LICENSE_URL" @click.prevent="openExternal(LICENSE_URL)">许可证全文 ↗</a>
                </div>
                <p class="card-hint">
                    非官方工具，与游戏发行商无关；游戏图标与名称版权归原权利人。
                </p>
            </details>
        </section>

        <GlassDialog
            v-model:open="pickerOpen"
            lazy
            class="wallpaper-dialog"
            label="选择官网壁纸"
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
                <p class="card-hint">
                    日常备份间隔至少 24 小时；日常与替换前备份合计保留最近 5 份，较早的会自动清理；恢复前另存当前账本。
                </p>
                <p v-if="backupsWarning" role="alert" class="receipt error">
                    自动备份未完成：{{ backupsWarning }}
                </p>
                <p v-if="backupsError" role="alert" class="receipt error">{{ backupsError }}</p>
                <p v-if="messageKind === 'error' && message" role="alert" class="receipt error">
                    {{ message }}
                </p>
                <p v-if="backupsLoading" role="status" class="receipt">正在读取…</p>
                <p v-else-if="!backups.length && !backupsError" class="receipt">暂无备份</p>
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

.settings-about {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 16px;
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    background: light-dark(rgb(249 251 249 / 0.76), rgb(27 37 35 / 0.8));
}
.about-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 10px;
}
.about-heading h2 {
    margin: 0;
}
.about-heading span {
    font-size: var(--fs-xs);
    color: var(--liquid-muted);
}
@media (max-width: 640px) {
    .settings-about {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
    }
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
    --glass-segmented-height: 30px;
    --glass-segmented-track: light-dark(#d8e8dfbd, #091511bd);
    --glass-segmented-thumb: light-dark(
        color-mix(in srgb, var(--glass-tab-selection), #f6fff9 82%),
        var(--glass-tab-selection)
    );
    --glass-segmented-selected: var(--glass-tab-selected);
    letter-spacing: normal;
}

.liquid-settings-row glass-segment {
    padding-inline: 10px;
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

.about-list {
    display: grid;
    grid-template-columns: 5em minmax(0, 1fr);
    align-items: baseline;
    gap: 6px 12px;
    margin: 10px 0 0;
    font-size: var(--fs-xs);
}

.about-list dt {
    opacity: 0.72;
}

.about-list dd {
    margin: 0;
    overflow-wrap: anywhere;
}

/* 路径写在 <code> 里：浏览器 UA 的 monospace 会直接盖掉继承自 .liquid-app 的字体。
 * 与正式版 AboutSection.vue 的 .about code、blocks.css 的 .note code 同一口径。 */
.about-list code {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}

.update-check {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
}
.update-check > span {
    flex: 0 1 auto;
    min-width: 0;
    font-size: var(--fs-xs);
    opacity: 0.72;
}
.update-check > span.error {
    color: var(--liquid-danger);
}
.update-check > span.available {
    color: var(--lg-accent);
}

.about-details {
    grid-column: 1 / -1;
    margin-top: 6px;
    border-top: 1px solid var(--liquid-outline);
    font-size: var(--fs-xs);
}
.about-details summary {
    width: fit-content;
    padding-block: 5px 2px;
    cursor: pointer;
}

.license-lead {
    margin: 10px 0 2px;
    font-size: var(--fs-base);
}
.license-notice {
    margin: 8px 0 11px;
    padding: 8px 11px;
    border-left: 2px solid var(--liquid-danger);
    border-radius: 8px;
    background: color-mix(in srgb, var(--liquid-danger) 7%, transparent);
    font-size: var(--fs-xs);
}
.license-notice b {
    font-weight: 400;
    text-decoration: underline;
    text-underline-offset: 3px;
}
.license-terms {
    display: grid;
    gap: 5px;
    margin: 0 0 12px;
}
.license-terms div {
    display: grid;
    grid-template-columns: 4em minmax(0, 1fr);
    gap: 10px;
}
.license-terms dt {
    font-size: var(--fs-xs);
}
.license-terms dd {
    margin: 0;
    font-size: var(--fs-sm);
}
.license-terms .allow dt {
    color: var(--lg-accent);
}
.license-terms .deny dt {
    color: var(--liquid-danger);
}
.license-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-bottom: 8px;
}
.license-links a {
    color: var(--lg-accent);
    font-size: var(--fs-sm);
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
