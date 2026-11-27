<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SlotButton from '../../components/SlotButton.vue';
import SettingsRow from './SettingsRow.vue';
import { importLegacyLedger } from './import-legacy-ledger';
import BackupHistory from './BackupHistory.vue';
import { backupTime, useBackups } from './use-backups';
import { useLedgerOperations } from './use-ledger-operations';
import { hasDesktop } from '../../services/desktop';
import {
    dataClear,
    dataExport,
    dataImport,
    restoreBackup,
    type BackupEntry,
} from '../../services/data-files';
/** 全部账本操作共用忙状态；替换前确认并备份，成功后重载领域单例。 */
const dataBusy = defineModel<boolean>('busy', { required: true });
const { busy: operationBusy, message, messageKind, warning, run } = useLedgerOperations();
watch(operationBusy, (value) => (dataBusy.value = value), { flush: 'sync' });
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
function restore(entry: BackupEntry) {
    return run(() => restoreBackup(entry.name), {
        reload: true,
        confirm: {
            danger: true,
            title: '恢复这份备份并替换当前账本？',
            note: `${new Date(entry.createdAt).toLocaleString('zh-CN')} 的全部账本数据将覆盖当前内容，恢复前会自动另存当前账本。`,
            confirmText: '恢复',
        },
    });
}
/** 导出没有二次确认：它不改变现有数据，选完位置还能在系统对话框里取消。 */
async function exportLedger() {
    await run(dataExport);
}

/** 导入先问：这一步整体顶掉现有账本，问句里必须写着「替换」。 */
function askImport() {
    return run(dataImport, {
        reload: true,
        confirm: {
            danger: true,
            title: '用选中的备份替换现在的账本？',
            note: '全部账本数据（角色、物价、收益流水、速记单价、账号记录与目标）会被整份替换。动手前会自动备份一份，回执里写着它的位置。',
            confirmText: '替换',
        },
    });
}

function importLegacy() {
    return run(importLegacyLedger, { reload: true });
}

/**
 * 清除：确认之后才跑。
 *
 * 确认窗关掉、按钮置灰，界面在说同一件事：这一下已经按下去了。
 */
function askClear() {
    return run(dataClear, {
        reload: true,
        confirm: {
            danger: true,
            title: '清空全部账本数据？',
            note: '角色、物价、收益流水、速记单价、上线记录与点卡口径、账号记录与目标都会清空。清除前不会自动备份，想留一份就先「导出」。主题与字号不受影响。',
            confirmText: '清除',
        },
    });
}
</script>

<template>
    <LedgerSection title="数据" hint="备份与恢复" plain>
        <SettingsRow label="账本">
            <SlotButton
                icon="download"
                label="导出账本到文件"
                text="导出"
                :disabled="operationBusy"
                @click="exportLedger"
            />
            <SlotButton
                icon="upload"
                label="从备份文件导入账本"
                text="导入"
                :disabled="operationBusy"
                @click="askImport"
            />
            <SlotButton
                icon="upload"
                label="导入旧版 Electron 完整备份"
                text="导入旧版"
                :disabled="operationBusy"
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
                :disabled="operationBusy || !desktop"
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
                            :disabled="loading || operationBusy"
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
                    :disabled="operationBusy"
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
        :busy="operationBusy"
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
