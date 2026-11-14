import { shallowRef } from 'vue';

/** 两种柱图共用指针锚点与离焦清理；日期/分类选择仍由图表自己决定。 */
export function useChartHover<T>(host: () => HTMLElement | null) {
    const active = shallowRef<T | null>(null);
    const point = shallowRef<{ x: number; y: number } | null>(null);

    function locate(event: PointerEvent | FocusEvent) {
        if (!(event instanceof PointerEvent)) {
            point.value = null;
            return;
        }
        const box = host()?.getBoundingClientRect();
        if (box) point.value = { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function leaveFocus(event: FocusEvent) {
        if (!(event.relatedTarget instanceof Node) || !host()?.contains(event.relatedTarget)) {
            active.value = null;
            point.value = null;
        }
    }

    return { active, point, locate, leaveFocus };
}
