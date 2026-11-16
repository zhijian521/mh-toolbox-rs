import { computed, ref } from 'vue';
import { listBackups, type BackupEntry } from '../../services/data-files';

/** 设置卡与恢复弹窗共用一次读取，失败时仍保留上次成功取得的列表。 */
export function useBackups() {
    const entries = ref<BackupEntry[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref('');
    const warning = ref('');
    const latestDaily = computed(() =>
        entries.value.reduce<BackupEntry | null>(
            (latest, entry) =>
                entry.kind === 'daily' && (!latest || entry.createdAt > latest.createdAt)
                    ? entry
                    : latest,
            null,
        ),
    );
    async function refresh() {
        if (loading.value) return;
        loading.value = true;
        error.value = '';
        try {
            const result = await listBackups();
            entries.value = result.entries;
            warning.value = result.error ?? '';
            loaded.value = true;
        } catch (cause) {
            error.value = String(cause);
        } finally {
            loading.value = false;
        }
    }
    return { entries, loading, loaded, error, warning, latestDaily, refresh };
}

export function backupTime(stamp: number) {
    return new Date(stamp).toLocaleString('zh-CN', { hour12: false });
}
