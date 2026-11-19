/** 自然高度弹窗共用尺寸过渡，固定高度窗口仍由各自的滚动区承载内容。 */
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useModalSize(panel: Ref<HTMLElement | null>, fixed: () => boolean) {
    let resizeObserver: ResizeObserver;
    let mutationObserver: MutationObserver;
    let motion: MediaQueryList;
    let animation: Animation | null = null;
    let lastHeight = 0;
    let frame = 0;

    function finish() {
        if (animation) {
            animation.onfinish = null;
            animation.cancel();
        }
        animation = null;
        panel.value?.classList.remove('modal-panel-sizing');
    }

    function resize() {
        cancelAnimationFrame(frame);
        frame = 0;
        const element = panel.value;
        if (!element) return;
        if (fixed()) {
            finish();
            return;
        }
        // 不读包围盒：入场的 scale 会把高度也缩小，造成两段动效互相干扰。
        const from = animation ? parseFloat(getComputedStyle(element).height) : lastHeight;
        finish();
        const style = getComputedStyle(element);
        const to = parseFloat(style.height);
        lastHeight = to;
        if (motion.matches || Math.abs(from - to) < 1) return;

        element.classList.add('modal-panel-sizing');
        animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
            duration: parseFloat(style.getPropertyValue('--t-slide')),
            easing: style.getPropertyValue('--ease-soft').trim(),
        });
        animation.onfinish = finish;
    }

    onMounted(() => {
        const element = panel.value;
        if (!element) return;
        motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        lastHeight = parseFloat(getComputedStyle(element).height);
        // 不追踪动画自身的逐帧高度；内容再次变化时从当前高度接续。
        resizeObserver = new ResizeObserver(() => {
            // 图片、字体等非 DOM 更新延后到下一帧，避免观察回调内改尺寸形成循环通知。
            if (!animation && !frame) frame = requestAnimationFrame(resize);
        });
        resizeObserver.observe(element);
        mutationObserver = new MutationObserver(resize);
        mutationObserver.observe(element, { childList: true, characterData: true, subtree: true });
        window.addEventListener('resize', resize);
        motion.addEventListener('change', resize);
    });

    onBeforeUnmount(() => {
        const element = panel.value;
        const height = animation && element ? getComputedStyle(element).height : null;
        cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        window.removeEventListener('resize', resize);
        motion?.removeEventListener('change', resize);
        finish();
        // 关闭中断尺寸过渡时，从眼前高度退场，避免先跳到内容的最终高度。
        if (height && element) element.style.height = height;
    });
}
