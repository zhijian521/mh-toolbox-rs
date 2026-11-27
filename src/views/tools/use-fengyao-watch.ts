import { computed, onScopeDispose, readonly, ref, shallowReadonly, shallowRef } from 'vue';
import { hasDesktop } from '../../services/desktop';
import type { WatchSummary } from '../../services/bindings';
import {
    fengyaoStatus,
    fengyaoSummary,
    readFengyaoPreferences,
    saveFengyaoPreferences,
    type FengyaoPreferences,
    type WatchStatus,
} from '../../services/fengyao';

const STATUS_INTERVAL = 1200;
const status = shallowRef<WatchStatus | null>(null);
const summary = shallowRef<WatchSummary | null>(null);
const statusError = ref('');
const busy = ref(false);
const refreshing = ref(false);
const known = computed(() => summary.value !== null && !statusError.value);
const running = computed(() => summary.value?.running === true);
let users = 0;
let detailUsers = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let pendingRead: Promise<void> | undefined;
let revision = 0;

function refreshStatus(): Promise<void> | undefined {
    if (!users || busy.value) return;
    if (pendingRead) return pendingRead;

    const requestedRevision = revision;
    const summaryOnly = detailUsers === 0;
    refreshing.value = true;
    const load = async () => {
        const detail = summaryOnly ? null : await fengyaoStatus();
        const next = detail ?? (await fengyaoSummary());
        if (requestedRevision !== revision) return;
        if (detail && detailUsers) status.value = detail;
        summary.value = next;
        statusError.value = '';
    };
    pendingRead = load()
        .catch((cause: unknown) => {
            if (requestedRevision !== revision) return;
            statusError.value = String(cause) || '读取监听状态失败';
        })
        .finally(() => {
            pendingRead = undefined;
            refreshing.value = false;
            if (!busy.value && (requestedRevision !== revision || (summaryOnly && detailUsers))) {
                return refreshStatus();
            }
        });
    return pendingRead;
}

async function runAction(action: () => Promise<WatchStatus | void>) {
    if (busy.value || !known.value) return;
    busy.value = true;
    // 启停或改设置期间，操作前发出的查询不能覆盖新状态。
    revision += 1;
    try {
        const next = await action();
        if (next) {
            if (detailUsers) status.value = next;
            summary.value = next;
            statusError.value = '';
        }
    } finally {
        busy.value = false;
        if (detailUsers && !status.value) void refreshStatus();
    }
}

function rememberPreferences(
    settings: Omit<FengyaoPreferences, 'windowTitle'>,
    selected: string,
    fallback: string,
) {
    const stored = readFengyaoPreferences();
    if (!stored.ok) return stored.error;
    return saveFengyaoPreferences({
        ...settings,
        windowTitle: selected || stored.value?.windowTitle || fallback,
    })
        ? ''
        : '设置保存失败，可重试';
}

/** 总览和详情共用后台状态。监听任务由宿主管理，订阅结束只清理查询。 */
export function useFengyaoWatch(withDetails = true) {
    if (hasDesktop()) {
        if (withDetails) detailUsers += 1;
        if (users++ === 0) {
            if (!busy.value) {
                status.value = null;
                summary.value = null;
                statusError.value = '';
            }
            void refreshStatus();
            timer = setInterval(() => void refreshStatus(), STATUS_INTERVAL);
        } else if (withDetails) {
            void refreshStatus();
        }
        onScopeDispose(() => {
            if (withDetails && --detailUsers === 0) status.value = null;
            if (--users === 0) {
                revision += 1;
                clearInterval(timer);
            }
        });
    }
    return {
        status: shallowReadonly(status),
        statusError: readonly(statusError),
        busy: readonly(busy),
        refreshing: readonly(refreshing),
        known: withDetails ? computed(() => known.value && status.value !== null) : known,
        running,
        refreshStatus,
        runAction,
        rememberPreferences,
    };
}
