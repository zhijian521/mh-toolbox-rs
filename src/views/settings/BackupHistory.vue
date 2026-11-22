<script setup lang="ts">
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import type { BackupEntry } from '../../services/data-files';
import { backupTime } from './use-backups';

defineProps<{
    busy: boolean;
    restoreError: string;
    entries: BackupEntry[];
    error: string;
    warning: string;
    loading: boolean;
}>();
const emit = defineEmits<{ close: []; restore: [entry: BackupEntry]; refresh: [] }>();
</script>

<template>
    <ModalShell title="备份与恢复" :width="660" :min-height="360" @close="!busy && emit('close')">
        <p class="note">日常备份间隔至少 24 小时；日常与替换前备份合计保留最近 5 份，较早的会自动清理；恢复前另存当前账本。</p>
        <p v-if="warning" class="note error" role="alert">自动备份未完成：{{ warning }}</p>
        <p v-if="error" class="note error" role="alert">{{ error }}</p>
        <p v-if="restoreError" class="note error" role="alert">{{ restoreError }}</p>
        <p v-if="loading" class="record-empty">正在读取…</p>
        <div v-else-if="!entries.length && !error" class="record-empty">暂无备份</div>
        <div v-else class="backup-list">
            <div v-for="entry in entries" :key="entry.name" class="backup-row">
                <div class="backup-info">
                    <span>{{ backupTime(entry.createdAt) }}</span>
                    <small>
                        {{ entry.kind === 'daily' ? '日常' : '替换前' }} ·
                        {{ Math.max(1, Math.round(entry.bytes / 1024)) }} KB
                    </small>
                </div>
                <PressButton
                    text="恢复"
                    :label="`恢复备份 ${entry.name}`"
                    :disabled="busy"
                    @click="emit('restore', entry)"
                />
            </div>
        </div>
        <template #footer>
            <PressButton
                text="刷新"
                label="刷新备份列表"
                icon="refresh"
                :disabled="busy || loading"
                @click="emit('refresh')"
            />
            <PressButton text="关闭" label="关闭备份列表" :disabled="busy" @click="emit('close')" />
        </template>
    </ModalShell>
</template>

<style scoped>
.backup-list {
    display: grid;
    gap: 6px;
}
.backup-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    background: var(--well);
    border-radius: var(--r-2);
}
.backup-info {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    flex: 1;
    min-width: 0;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}
.backup-row small {
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
