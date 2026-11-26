import {
    onMounted,
    setTransitionHooks,
    type InjectionKey,
    type Ref,
    type TransitionHooks,
    type VNode,
} from 'vue';

/** 懒加载占位与正式面板只交接一次；同一提供者下的后续嵌套窗正常入场。 */
export const MODAL_HANDOFF: InjectionKey<{ pending: boolean; origin?: HTMLElement | null }> =
    Symbol('modal-handoff');

/** 保留真实面板直至退场结束；不复制表单、Canvas，也不延迟业务关闭事件。 */
export function useModalMotion(
    mask: Ref<HTMLElement | null>,
    panel: Ref<HTMLElement | null>,
    afterLeave: () => void,
    handoff = false,
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

    function animate(
        element: HTMLElement,
        frames: Keyframe[],
        ms: number,
        curve: string,
        delay = 0,
    ) {
        const style = getComputedStyle(element);
        const easing =
            style.getPropertyValue(curve).trim() ||
            style.getPropertyValue('--ease-soft').trim() ||
            'ease';
        try {
            const animation = element.animate(frames, {
                duration: ms,
                delay,
                easing,
                fill: 'both',
            });
            animations.push(animation);
            return animation.finished.catch(() => {});
        } catch (error) {
            // 动效不可用时仍要移除遮罩，并恢复滚动与焦点。
            console.warn('弹窗动画不可用', error);
            return Promise.resolve();
        }
    }

    function layersOf(face: HTMLElement) {
        return face.querySelectorAll<HTMLElement>(
            ':scope > .modal-head, :scope > .modal-body, :scope > .modal-foot',
        );
    }

    function inheritBackdrop(element: HTMLElement): string | null {
        const leaving = element.parentElement?.querySelectorAll<HTMLElement>(
            '.modal-mask[data-modal-leaving]',
        );
        for (const previous of leaving ?? []) {
            const backdrop = previous.querySelector<HTMLElement>('.modal-backdrop');
            if (!backdrop || getComputedStyle(backdrop).visibility === 'hidden') continue;
            const opacity = getComputedStyle(backdrop).opacity;
            // 同一拍换窗时接住旧遮罩，旧面板继续退场，背景不先变亮再压暗。
            element.setAttribute('data-modal-inherited', '');
            backdrop.style.visibility = 'hidden';
            return opacity;
        }
        return null;
    }

    onMounted(() => {
        const element = mask.value;
        const face = panel.value;
        if (!element || !face || !element.animate) return;
        const backdrop = element.querySelector<HTMLElement>('.modal-backdrop');
        const inheritedOpacity = inheritBackdrop(element);
        element.setAttribute('data-modal-entering', '');
        const ms = duration(element, handoff ? '--t-mid' : '--t-modal-enter');
        const motions = [
            animate(
                face,
                [
                    { opacity: handoff ? 0.7 : 0, transform: handoff ? 'none' : 'translateY(8px)' },
                    { opacity: 1, transform: 'none' },
                ],
                ms,
                '--ease-modal-enter',
            ),
        ];
        if (backdrop && !handoff) {
            motions.push(
                animate(
                    backdrop,
                    [{ opacity: inheritedOpacity ?? 0 }, { opacity: 1 }],
                    duration(element, '--t-mid'),
                    '--ease-soft',
                ),
            );
        }
        if (!handoff) {
            const step = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 0
                : duration(face, '--t-modal-stagger');
            // 分层只淡入，不移动正文，避免表格和下拉框在入场中改变定位基准。
            layersOf(face).forEach((layer, index) => {
                motions.push(
                    animate(
                        layer,
                        [{ opacity: 0 }, { opacity: 1 }],
                        duration(face, '--t-mid'),
                        '--ease-modal-enter',
                        index * step,
                    ),
                );
            });
        }
        void Promise.all(motions).then(() => {
            // 关闭可能打断入场；不能在这里取消刚开始的退场动画。
            if (!element.hasAttribute('data-modal-leaving')) {
                cancel();
                element.removeAttribute('data-modal-entering');
            }
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
                const backdrop = element.querySelector<HTMLElement>('.modal-backdrop');
                const opacity = face ? getComputedStyle(face).opacity : '1';
                const shade = backdrop ? getComputedStyle(backdrop).opacity : '1';
                const transform = face ? getComputedStyle(face).transform : 'none';
                const layers = face
                    ? [...layersOf(face)].map((layer) => ({
                          layer,
                          opacity: getComputedStyle(layer).opacity,
                      }))
                    : [];
                element.setAttribute('data-modal-leaving', '');
                const ms = duration(element, '--t-modal-leave');
                cancel();
                const finish = () => {
                    cancel();
                    remove();
                    afterLeave();
                };
                if (!element.animate || !face || element.hasAttribute('data-modal-replaced')) {
                    finish();
                    return;
                }
                // 快速关闭时冻结分层当前帧，取消入场不能先让半透明内容突然亮起来。
                for (const { layer, opacity } of layers) layer.style.opacity = opacity;
                const motions = [
                    animate(
                        face,
                        [
                            { opacity, transform },
                            { opacity: 0, transform: 'translateY(3px)' },
                        ],
                        ms,
                        '--ease-modal-leave',
                    ),
                ];
                if (backdrop) {
                    motions.push(
                        animate(backdrop, [{ opacity: shade }, { opacity: 0 }], ms, '--ease-soft'),
                    );
                }
                void Promise.all(motions).then(finish);
            },
        };
        setTransitionHooks(vnode, hooks);
    }

    return { beforeUnmount };
}
