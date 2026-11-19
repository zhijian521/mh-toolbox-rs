import { onMounted, setTransitionHooks, type Ref, type TransitionHooks, type VNode } from 'vue';

/** 保留真实面板直至退场结束；不复制表单、Canvas，也不延迟业务关闭事件。 */
export function useModalMotion(
    mask: Ref<HTMLElement | null>,
    panel: Ref<HTMLElement | null>,
    afterLeave: () => void,
) {
    let animations: Animation[] = [];

    function cancel() {
        for (const animation of animations) animation.cancel();
        animations = [];
    }

    function duration(element: HTMLElement, token: string) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 1;
        return parseFloat(getComputedStyle(element).getPropertyValue(token)) || 0;
    }

    function animate(element: HTMLElement, frames: Keyframe[], ms: number) {
        const animation = element.animate(frames, {
            duration: ms,
            easing: getComputedStyle(element).getPropertyValue('--ease-soft').trim(),
            fill: 'both',
        });
        animations.push(animation);
        return animation.finished.catch(() => {});
    }

    onMounted(() => {
        const element = mask.value;
        const face = panel.value;
        if (!element || !face || !element.animate) return;
        const ms = duration(element, '--t-press');
        void Promise.all([
            animate(element, [{ opacity: 0 }, { opacity: 1 }], ms),
            animate(face, [{ transform: 'translateY(8px)' }, { transform: 'none' }], ms),
        ]).then(() => {
            // 关闭可能打断入场；不能在这里取消刚开始的退场动画。
            if (!element.hasAttribute('data-modal-leaving')) cancel();
        });
    });

    function beforeUnmount(vnode: VNode) {
        /* 父级 v-if 会卸载整份 ModalShell，内部 Transition 的卸载路径会跳过 leave。
         * 在遮罩 VNode 上登记 Vue 的移除钩子，仍由渲染器保留／移除原节点。 */
        const hooks: TransitionHooks<HTMLElement> = {
            mode: 'default',
            persisted: false,
            beforeEnter() {},
            enter() {},
            clone: () => hooks,
            leave(element, remove) {
                const face = element.querySelector<HTMLElement>('.modal-panel');
                const opacity = getComputedStyle(element).opacity;
                const transform = face ? getComputedStyle(face).transform : 'none';
                element.setAttribute('data-modal-leaving', '');
                const ms = duration(element, '--t-quick');
                cancel();
                const finish = () => {
                    cancel();
                    remove();
                    afterLeave();
                };
                if (!element.animate || !face) {
                    finish();
                    return;
                }
                void Promise.all([
                    animate(element, [{ opacity }, { opacity: 0 }], ms),
                    animate(face, [{ transform }, { transform: 'translateY(4px)' }], ms),
                ]).then(finish);
            },
        };
        setTransitionHooks(vnode, hooks);
    }

    return { beforeUnmount };
}
