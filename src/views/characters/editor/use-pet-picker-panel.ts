import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue';
import { pickerPlacement, type PickerBounds } from './picker-placement';

/** 头像与技能共用定位；监听外层滚动、缩放和内容变化，浮层内部滚动不触发重定位。 */
export function usePetPickerPanel(
    anchor: Ref<HTMLElement | null>,
    panel: Ref<HTMLElement | null>,
    search: Ref<HTMLInputElement | null>,
    open: Ref<boolean>,
) {
    const panelStyle = ref<Record<string, string>>({});
    const flipUp = ref(false);

    function place() {
        if (!open.value || !anchor.value || !panel.value) return;
        const bounds: PickerBounds = {
            left: 0,
            right: document.documentElement.clientWidth,
            top: 0,
            bottom: document.documentElement.clientHeight,
        };
        for (let node = anchor.value.parentElement; node; node = node.parentElement) {
            const css = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            const left = box.left + node.clientLeft;
            const top = box.top + node.clientTop;
            if (css.overflowX !== 'visible') {
                bounds.left = Math.max(bounds.left, left);
                bounds.right = Math.min(bounds.right, left + node.clientWidth);
            }
            if (css.overflowY !== 'visible') {
                bounds.top = Math.max(bounds.top, top);
                bounds.bottom = Math.min(bounds.bottom, top + node.clientHeight);
            }
        }
        const placement = pickerPlacement(
            anchor.value.getBoundingClientRect(),
            bounds,
            Math.max(panel.value.offsetHeight, panel.value.scrollHeight),
        );
        flipUp.value = placement.up;
        panelStyle.value = {
            left: `${placement.left}px`,
            width: `${placement.width}px`,
            maxHeight: `${placement.maxHeight}px`,
        };
    }

    let frame = 0;
    function schedule(event?: Event) {
        if (event?.target instanceof Node && panel.value?.contains(event.target)) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(place);
    }

    const stop = watch(open, async (value, _old, cleanup) => {
        if (!value) return;
        let active = true;
        panelStyle.value = {};
        flipUp.value = false;
        const observer = new ResizeObserver(() => schedule());
        cleanup(() => {
            active = false;
            observer.disconnect();
            window.removeEventListener('resize', schedule);
            document.removeEventListener('scroll', schedule, true);
            cancelAnimationFrame(frame);
        });
        await nextTick();
        if (!active || !open.value || !panel.value || !anchor.value) return;
        place();
        search.value?.focus({ preventScroll: true });
        observer.observe(panel.value);
        observer.observe(anchor.value);
        const content = anchor.value.closest('.pet-content');
        if (content) observer.observe(content);
        window.addEventListener('resize', schedule);
        document.addEventListener('scroll', schedule, true);
    });
    onScopeDispose(stop);
    return { panelStyle, flipUp };
}
