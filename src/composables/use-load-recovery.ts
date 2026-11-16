/** 失败重读不能覆盖待保存数据；重复点击共用一次读取，读取成功前保留原错误与写入保护。 */
import { computed, readonly, ref, type Ref } from 'vue';

const reading = new WeakMap<() => Promise<void>, Ref<boolean>>();

export function useLoadRecovery(
    load: () => Promise<void>,
    error: () => string,
    blocked: () => boolean,
) {
    // 同一数据源的提示可能同时出现在页面与历史窗，卸载其中一个不能释放另一个的读取锁。
    let loading = reading.get(load);
    if (!loading) {
        loading = ref(false);
        reading.set(load, loading);
    }
    const active = loading;
    const failure = ref('');
    const canRetry = computed(() => Boolean(error()) && !blocked() && !active.value);

    async function retryLoad(): Promise<boolean> {
        if (!canRetry.value) return false;
        active.value = true;
        failure.value = '';
        try {
            await load();
            return !error();
        } catch (cause) {
            console.error('重新读取失败', cause);
            failure.value = '仍然无法读取，请稍后重试';
            return false;
        } finally {
            active.value = false;
        }
    }

    return { loading: readonly(active), failure: readonly(failure), canRetry, retryLoad };
}
