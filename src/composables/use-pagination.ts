import { computed, ref, watch, type Ref } from 'vue';

export function usePagination<T>(
    rows: Readonly<Ref<readonly T[]>>,
    size = 20,
    selectedPage?: Ref<number>,
) {
    const page = selectedPage ?? ref(1);
    const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / size)));
    const visible = computed(() => rows.value.slice((page.value - 1) * size, page.value * size));
    watch(
        pages,
        (value) => {
            if (page.value > value) page.value = value;
        },
        { flush: 'sync', immediate: true },
    );
    return { page, pages, visible };
}
