import { defineComponent, h, onBeforeUnmount, provide, ref, shallowRef, type Component } from 'vue';
import { MODAL_HANDOFF } from '../composables/use-modal-motion';
import ModalShell from './ModalShell.vue';
import PressButton from './PressButton.vue';

/** 弹窗代码首次打开才加载；同一弹窗共享请求与成功缓存，失败后可重试。 */
export function lazyDialog<T extends Component>(loader: () => Promise<{ default: T }>): T {
    let cached: T | undefined;
    let pending: Promise<T> | undefined;

    function load(): Promise<T> {
        if (cached) return Promise.resolve(cached);
        pending ??= loader()
            .then((module) => (cached = module.default))
            .finally(() => {
                pending = undefined;
            });
        return pending;
    }

    const wrapper = defineComponent({
        name: 'LazyDialog',
        inheritAttrs: false,
        setup(_, { attrs, slots }) {
            const component = shallowRef(cached);
            const failed = ref(false);
            const showLoading = ref(false);
            const trigger = document.activeElement;
            const handoff = {
                pending: false,
                origin: trigger && trigger instanceof HTMLElement ? trigger : null,
            };
            provide(MODAL_HANDOFF, handoff);
            const status = ref<HTMLElement | null>(null);
            // 缓存和本地快速加载不闪现小窗；慢请求仍保留取消与失败重试。
            const loadingTimer = cached
                ? undefined
                : setTimeout(() => {
                      showLoading.value = true;
                  }, 180);
            let active = true;
            onBeforeUnmount(() => {
                active = false;
                clearTimeout(loadingTimer);
            });

            async function open() {
                failed.value = false;
                try {
                    const loaded = await load();
                    if (!active) return;
                    clearTimeout(loadingTimer);
                    // 显示过占位窗时直接交接原触发点，避免聚焦仍被 inert 的父窗。
                    if (status.value) {
                        status.value?.closest('.modal-mask')?.setAttribute('data-modal-replaced', '');
                        handoff.pending = true;
                    }
                    component.value = loaded;
                } catch (error) {
                    if (!active) return;
                    console.error('弹窗加载失败', error);
                    clearTimeout(loadingTimer);
                    showLoading.value = true;
                    failed.value = true;
                }
            }

            function close() {
                const handler = attrs.onClose ?? attrs.onCancel;
                if (typeof handler === 'function') handler();
            }

            if (!component.value) void open();

            return () => {
                if (component.value) return h(component.value, attrs, slots);
                if (!showLoading.value) return null;
                return h(
                    ModalShell,
                    { title: failed.value ? '加载失败' : '加载中', width: 320, onClose: close },
                    {
                        default: () =>
                            h(
                                'p',
                                { ref: status, role: 'status' },
                                failed.value ? '未能打开，请重试。' : '正在打开…',
                            ),
                        footer: () => [
                            h(PressButton, {
                                text: failed.value ? '关闭' : '取消',
                                label: failed.value ? '关闭' : '取消',
                                onClick: close,
                            }),
                            failed.value &&
                                h(PressButton, {
                                    text: '重试',
                                    label: '重试',
                                    seal: true,
                                    onClick: open,
                                }),
                        ],
                    },
                );
            };
        },
    });

    // 透明转发原弹窗的 props、事件和插槽，调用点保留原组件的类型约束。
    return wrapper as unknown as T;
}
