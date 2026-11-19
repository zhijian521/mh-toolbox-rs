import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue';
import { useModalMotion } from './use-modal-motion';

/** 用真实 Vue 卸载路径确认：父级 v-if 移除组件时，原遮罩仍保留至退场结束。 */
function mountMotion(reduced = false, supported = true) {
    const motions: { finish: () => void; ms: number }[] = [];
    class Node {
        parent: Node | null = null;
        children: Node[] = [];
        attrs = new Set<string>();
        constructor(public type: string) {}
        setAttribute(name: string) {
            this.attrs.add(name);
        }
        hasAttribute(name: string) {
            return this.attrs.has(name);
        }
        querySelector() {
            return this.children.find((one) => one.type === 'panel') ?? null;
        }
        animate = supported
            ? (_frames: Keyframe[], options: KeyframeAnimationOptions) => {
                  let finish!: () => void;
                  let reject!: () => void;
                  const finished = new Promise<void>((resolve, fail) => {
                      finish = resolve;
                      reject = fail;
                  });
                  motions.push({ finish, ms: Number(options.duration) });
                  return { finished, cancel: reject };
              }
            : undefined;
    }
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    vi.stubGlobal('getComputedStyle', () => ({
        opacity: '1',
        transform: 'none',
        getPropertyValue: (name: string) => (name === '--ease-soft' ? 'ease' : '180ms'),
    }));
    const renderer = createRenderer<Node, Node>({
        createElement: (type) => new Node(type),
        createText: () => new Node('text'),
        createComment: () => new Node('comment'),
        setText() {},
        setElementText() {},
        patchProp() {},
        parentNode: (one) => one.parent,
        nextSibling: () => null,
        insert(one, parent) {
            one.parent = parent;
            parent.children.push(one);
        },
        remove(one) {
            if (one.parent) one.parent.children.splice(one.parent.children.indexOf(one), 1);
            one.parent = null;
        },
    });
    const afterLeave = vi.fn();
    const open = ref(true);
    const Dialog = defineComponent({
        setup() {
            const mask = ref<HTMLElement | null>(null);
            const panel = ref<HTMLElement | null>(null);
            const { beforeUnmount } = useModalMotion(mask, panel, afterLeave);
            return () =>
                h('mask', { ref: mask, onVnodeBeforeUnmount: beforeUnmount }, [
                    h('panel', { ref: panel }),
                ]);
        },
    });
    const root = new Node('root');
    const app = renderer.createApp(
        defineComponent({ setup: () => () => (open.value ? h(Dialog) : null) }),
    );
    app.mount(root);
    return { root, motions, open, afterLeave, unmount: () => app.unmount() };
}

async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await nextTick();
}

afterEach(() => vi.unstubAllGlobals());

describe('弹窗真实节点退场', () => {
    it('快速关闭中断入场，保留同一面板，退场完毕只清理一次', async () => {
        const scene = mountMotion();
        const mask = scene.root.children[0];
        scene.open.value = false;
        await nextTick();
        expect(mask.parent).toBe(scene.root);
        expect(mask.hasAttribute('data-modal-leaving')).toBe(true);
        expect(scene.afterLeave).not.toHaveBeenCalled();
        scene.motions.slice(0, 2).forEach((motion) => motion.finish());
        await settle();
        expect(mask.parent).toBe(scene.root);
        scene.motions.slice(2).forEach((motion) => motion.finish());
        await settle();
        expect(mask.parent).toBeNull();
        expect(scene.afterLeave).toHaveBeenCalledTimes(1);
        scene.unmount();
    });

    it('降动效同时覆盖进入与退出，不保留正常时长', async () => {
        const scene = mountMotion(true);
        scene.open.value = false;
        await nextTick();
        expect(scene.motions.every((motion) => motion.ms === 1)).toBe(true);
        scene.motions.forEach((motion) => motion.finish());
        await settle();
        expect(scene.afterLeave).toHaveBeenCalledTimes(1);
        scene.unmount();
    });

    it('不支持动画时直接移除并释放弹窗行为', async () => {
        const scene = mountMotion(false, false);
        scene.open.value = false;
        await nextTick();
        expect(scene.root.children.some((one) => one.type === 'mask')).toBe(false);
        expect(scene.afterLeave).toHaveBeenCalledTimes(1);
        scene.unmount();
    });
});
