<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import { listBackups, type BackupEntry } from '../../services/data-files';

defineProps<{ busy: boolean; restoreError: string }>();
const emit = defineEmits<{ close: []; restore: [entry: BackupEntry] }>();
const entries = ref<BackupEntry[]>([]),
    error = ref(''),
    warning = ref(''),
    loading = ref(false);
async function load() {
    if (loading.value) return;
    loading.value = true;
    error.value = '';
    try {
        const result = await listBackups();
        entries.value = result.entries;
        warning.value = result.error ?? '';
    } catch (cause) {
        error.value = String(cause);
    } finally {
        loading.value = false;
    }
}
onMounted(load);
function time(stamp: number) {
    return new Date(stamp).toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
    <ModalShell title="备份与恢复" :width="660" :min-height="360" @close="!busy && emit('close')">
        <p class="note">日常备份间隔至少 24 小时，保留最近 14 份；恢复前另存当前账本。</p>
        <p v-if="warning" class="note error" role="alert">自动备份未完成：{{ warning }}</p>
        <p v-if="error" class="note error" role="alert">{{ error }}</p>
        <p v-if="restoreError" class="note error" role="alert">{{ restoreError }}</p>
        <p v-if="loading" class="record-empty">正在读取…</p>
        <div v-else-if="!entries.length" class="record-empty">暂无备份</div>
        <div v-else class="backup-list">
            <div v-for="entry in entries" :key="entry.name" class="backup-row">
                <span
                    >{{ time(entry.createdAt)
                    }}<small
                        >{{ entry.kind === 'daily' ? '日常' : '替换前' }} ·
                        {{ Math.max(1, Math.round(entry.bytes / 1024)) }} KB</small
                    ></span
                >
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
                @click="load"
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
.backup-row > span {
    flex: 1;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.backup-row small {
    margin-left: 12px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
