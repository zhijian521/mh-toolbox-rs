import { computed, ref, watchEffect, type Ref } from 'vue';

/** 先挂载首屏卡片，其余分帧补齐。找回滚动位置或筛选结果时可直接展示完整列表。 */
export function useProgressiveList<T>(
    items: Readonly<Ref<readonly T[]>>,
    batchSize: number,
    showAll: () => boolean,
) {
    const limit = ref(batchSize);
    watchEffect(
        (onCleanup) => {
            if (showAll()) {
                limit.value = Number.POSITIVE_INFINITY;
                return;
            }
            if (items.value.length <= limit.value) return;
            let task: number | undefined;
            const frame = requestAnimationFrame(() => {
                task = window.setTimeout(() => {
                    limit.value += batchSize;
                }, 0);
            });
            onCleanup(() => {
                cancelAnimationFrame(frame);
                window.clearTimeout(task);
            });
        },
        { flush: 'post' },
    );
    return computed(() =>
        showAll() || items.value.length <= limit.value
            ? items.value
            : items.value.slice(0, limit.value),
    );
}
