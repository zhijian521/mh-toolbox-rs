import { computed, ref, watch, type Ref } from 'vue';

export interface PagerItem {
    page: number;
    gap?: 'previous' | 'next';
}

const PAGER_JUMP = 5;

/** 最多七档，首尾常驻；省略号前后跳五页，不按总页数创建整张页码表。 */
export function pagerItems(page: number, pages: number): PagerItem[] {
    if (pages <= PAGER_JUMP + 2) {
        return Array.from({ length: pages }, (_, index) => ({ page: index + 1 }));
    }
    const current = Math.min(pages, Math.max(1, page));
    let start = current - 1;
    let end = current + 1;
    if (current < PAGER_JUMP) {
        start = 2;
        end = PAGER_JUMP;
    } else if (current > pages - PAGER_JUMP + 1) {
        start = pages - PAGER_JUMP + 1;
        end = pages - 1;
    }
    const items: PagerItem[] = [{ page: 1 }];
    if (start > 2) items.push({ page: Math.max(1, current - PAGER_JUMP), gap: 'previous' });
    for (let value = start; value <= end; value++) items.push({ page: value });
    if (end < pages - 1) items.push({ page: Math.min(pages, current + PAGER_JUMP), gap: 'next' });
    items.push({ page: pages });
    return items;
}

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
