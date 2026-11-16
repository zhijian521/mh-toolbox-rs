/** 历史继承打开时的页面范围；上下文不变时保留筛选与页码，换范围或角色才重新初始化。 */
import { nextTick, onMounted, ref, type Ref } from 'vue';

export interface RecordScope {
    from: string;
    to: string;
    who: string;
}

export interface RecordFilters extends RecordScope {
    page: number;
    scrollTop: number;
}

export function useRecordFilters<T extends object>(scope: () => RecordScope, defaults: T) {
    const current = () => JSON.stringify(scope());
    let context = current();
    const initial = () => ({ ...defaults, ...scope() });
    const filters = ref(initial()) as Ref<T & RecordScope>;

    function syncScope() {
        const next = current();
        if (next === context) return;
        context = next;
        filters.value = initial();
    }

    return { filters, syncScope };
}

export function useRecordScroll(state: Ref<{ scrollTop: number }>) {
    const scroll = ref<HTMLElement | null>(null);
    onMounted(async () => {
        await nextTick();
        if (scroll.value) scroll.value.scrollTop = state.value.scrollTop;
    });
    function rememberScroll() {
        state.value.scrollTop = scroll.value?.scrollTop ?? 0;
    }
    return { scroll, rememberScroll };
}
