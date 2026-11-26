<script setup lang="ts">
import { onMounted, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SlotButton from '../../components/SlotButton.vue';
import SettingsRow from './SettingsRow.vue';
import { reloadWithDataNotice, takeDataNotice, truncationNote } from './data-notice';
import { importLegacyLedger } from './import-legacy-ledger';
import BackupHistory from './BackupHistory.vue';
import { backupTime, useBackups } from './use-backups';
import { hasDesktop } from '../../services/desktop';
import { askConfirm } from '../../composables/use-confirm';
import {
    dataClear,
    dataExport,
    dataImport,
    restoreBackup,
    type BackupEntry,
    type DataOutcome,
} from '../../services/data-files';
/** 全部账本操作共用忙状态；替换前确认并备份，成功后重载领域单例。 */
const busy = defineModel<boolean>('busy', { required: true });
const backupsOpen = ref(false);
const desktop = hasDesktop();
const {
    entries,
    loading,
    loaded,
    error,
    warning: backupWarning,
    latestDaily,
    refresh,
} = useBackups();
onMounted(refresh);
function openBackups() {
    backupsOpen.value = true;
    void refresh();
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
const message = ref('');
/** 导入成功但有代价时多出来的那一句（点位被截断）。没有代价时是空串。 */
const warning = ref('');
const messageKind = ref<'error' | 'positive'>('positive');

/**
 * 三条操作的共同外壳：置忙 → 跑 → 收起忙 → 把三种结局翻成界面上的一句话。
 *
 * `busy` 是**一个** ref 而不是每个按钮一个：这三件事共用同一份数据。导入正在整份替换
 * 的时候点一下「导出」，导出来的是一份半新半旧的账，而那份账会被用户当成备份收着。
 * 所以忙是整卡的忙，按钮一起停。
 */
async function run(action: () => Promise<DataOutcome>): Promise<DataOutcome> {
    busy.value = true;
    try {
        const outcome = await action();
        if (outcome.status === 'ok') {
            messageKind.value = 'positive';
            message.value = outcome.detail;
            /* 两句话分开放：一句是「办成了」，一句是「不过有东西会丢」。拼成一串就只能
             * 整段用一种颜色，而这两件事不该看起来一样重。 */
            warning.value = [outcome.warning, truncationNote(outcome.truncation)]
                .filter(Boolean)
                .join(' ');
        } else if (outcome.status === 'failed') {
            messageKind.value = 'error';
            message.value = outcome.error;
            warning.value = '';
        } else {
            /* 取消：**清掉**上一句，不留着。上一句可能是上一次的「已导出到 C:\…」，
             * 留着会让刚取消了这一次的人以为那一次又发生了一遍。 */
            message.value = '';
            warning.value = '';
        }
        return outcome;
    } finally {
        /* 用 `finally` 而不是每条分支里各写一次：`action` 抛错（`invoke` 之外的原因，
         * 比如 IPC 通道断了）时按钮也必须能再按下去，否则这张卡就永久停在禁用态。 */
        busy.value = false;
    }
}

/** 导出没有二次确认：它不改变现有数据，选完位置还能在系统对话框里取消。 */
async function exportLedger() {
    await run(dataExport);
}

/** 导入先问：这一步整体顶掉现有账本，问句里必须写着「替换」。 */
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

async function importLegacy() {
    const outcome = await run(importLegacyLedger);
    if (outcome.status === 'ok') reloadWithNotice();
}

/**
 * 清除：确认之后才跑。
 *
 * 确认窗关掉、按钮置灰，界面在说同一件事：这一下已经按下去了。
 */
async function askClear() {
    const ok = await askConfirm({
        danger: true,
        title: '清空全部账本数据？',
        note: '角色、物价、收益流水、速记单价、上线记录与点卡口径、账号记录与目标都会清空。清除前不会自动备份，想留一份就先「导出」。主题与字号不受影响。',
        confirmText: '清除',
    });
    if (!ok) return;
    const outcome = await run(dataClear);
    if (outcome.status === 'ok') reloadWithNotice();
}

function reloadWithNotice() {
    reloadWithDataNotice(message.value, warning.value);
}

onMounted(() => {
    const saved = takeDataNotice();
    if (!saved.text) return;
    messageKind.value = 'positive';
    message.value = saved.text;
    warning.value = saved.warning;
});
</script>

<template>
    <LedgerSection title="数据" hint="备份与恢复" plain>
        <SettingsRow label="账本">
            <SlotButton
                icon="download"
                label="导出账本到文件"
                text="导出"
                :disabled="busy"
                @click="exportLedger"
            />
            <SlotButton
                icon="upload"
                label="从备份文件导入账本"
                text="导入"
                :disabled="busy"
                @click="askImport"
            />
            <SlotButton
                icon="upload"
                label="导入旧版 Electron 完整备份"
                text="导入旧版"
                :disabled="busy"
                @click="importLegacy"
            />
            <template #detail>
                <p class="note">导入将替换全部账本，替换前自动备份。</p>
            </template>
        </SettingsRow>
        <SettingsRow label="备份">
            <SlotButton
                icon="history"
                text="恢复"
                label="查看本地备份与恢复"
                :disabled="busy || !desktop"
                @click="openBackups"
            />
            <span class="hint">最近 5 份备份</span>
            <template #detail>
                <div class="backup-status" role="status">
                    <p v-if="!desktop" class="note">自动备份在桌面版可用</p>
                    <template v-else>
                        <p v-if="latestDaily" class="note">
                            最近自动备份：{{ backupTime(latestDaily.createdAt) }}
                        </p>
                        <p v-else-if="loading && !loaded" class="note">正在读取备份状态…</p>
                        <p v-else-if="loaded && !error" class="note">尚无自动备份</p>
                        <p v-if="backupWarning" class="note error">
                            自动备份未完成：{{ backupWarning }}
                        </p>
                        <p v-if="error" class="note error">备份状态读取失败：{{ error }}</p>
                        <SlotButton
                            v-if="error"
                            text="重新读取"
                            label="重新读取备份状态"
                            :disabled="loading || busy"
                            @click="refresh"
                        />
                    </template>
                </div>
            </template>
        </SettingsRow>
        <div class="danger-zone">
            <SettingsRow label="清除">
                <SlotButton
                    danger
                    seal
                    icon="trash"
                    label="清空全部账本数据"
                    text="清除"
                    :disabled="busy"
                    @click="askClear"
                />
                <template #detail>
                    <p class="note">不可撤销，不会自动备份，请先导出。</p>
                </template>
            </SettingsRow>
        </div>
        <!-- 常驻播报容器：回执可包含备份路径，成功后也必须保留截断警示。 -->
        <div role="status">
            <p v-if="message" class="note" :class="messageKind">{{ message }}</p>
            <p v-if="warning" class="note warning">{{ warning }}</p>
        </div>
    </LedgerSection>
    <BackupHistory
        v-if="backupsOpen"
        :busy="busy"
        :entries="entries"
        :loading="loading"
        :error="error"
        :warning="backupWarning"
        :restore-error="messageKind === 'error' ? message : ''"
        @refresh="refresh"
        @close="backupsOpen = false"
        @restore="restore"
    />
</template>

<style scoped>
.backup-status {
    overflow-wrap: anywhere;
}
.backup-status .note {
    margin: 6px 0 0;
}
/* 清除独立分区，保留不可撤销与不会自动备份的提示。 */
.danger-zone {
    margin-top: 14px;
    padding-top: 14px;
    border-top: var(--w-hair) solid var(--rule-2);
}
.note.warning {
    color: var(--warning);
}
</style>
