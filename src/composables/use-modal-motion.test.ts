import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue';
import { useModalMotion } from './use-modal-motion';

/** 用真实 Vue 卸载路径确认：父级 v-if 移除组件时，原遮罩仍保留至退场结束。 */
function mountMotion(reduced = false, supported = true, handoff = false) {
    const motions: {
        finish: () => void;
        ms: number;
        delay: number;
        target: string;
        frames: Keyframe[];
    }[] = [];
    class Node {
        parent: Node | null = null;
        children: Node[] = [];
        attrs = new Set<string>();
        style: { visibility: string; opacity?: string } = { visibility: '' };
        opacity = '1';
        constructor(public type: string) {}
        setAttribute(name: string) {
            this.attrs.add(name);
        }
        hasAttribute(name: string) {
            return this.attrs.has(name);
        }
        removeAttribute(name: string) {
            this.attrs.delete(name);
        }
        get parentElement() {
            return this.parent;
        }
        querySelectorAll(selector: string) {
            if (selector.includes('.modal-head'))
                return this.children.filter((one) => ['head', 'body', 'foot'].includes(one.type));
            return this.children.filter((one) => one.hasAttribute('data-modal-leaving'));
        }
        querySelector(selector: string) {
            const type = selector === '.modal-backdrop' ? 'backdrop' : 'panel';
            return this.children.find((one) => one.type === type) ?? null;
        }
        animate = supported
            ? (frames: Keyframe[], options: KeyframeAnimationOptions) => {
                  let finish!: () => void;
                  let reject!: () => void;
                  const finished = new Promise<void>((resolve, fail) => {
                      finish = resolve;
                      reject = fail;
                  });
                  motions.push({
                      finish,
                      ms: Number(options.duration),
                      delay: Number(options.delay ?? 0),
                      target: this.type,
                      frames,
                  });
                  return { finished, cancel: reject };
              }
            : undefined;
    }
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    vi.stubGlobal('getComputedStyle', (element: Node) => ({
        opacity: element.opacity,
        transform: 'none',
        visibility: 'visible',
        getPropertyValue: (name: string) =>
            name.startsWith('--ease-') ? 'ease' : name === '--t-modal-stagger' ? '24ms' : '180ms',
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
    const version = ref(0);
    const Dialog = defineComponent({
        setup() {
            const mask = ref<HTMLElement | null>(null);
            const panel = ref<HTMLElement | null>(null);
            const { beforeUnmount } = useModalMotion(mask, panel, afterLeave, handoff);
            return () =>
                h('mask', { ref: mask, onVnodeBeforeUnmount: beforeUnmount }, [
                    h('backdrop'),
                    h('panel', { ref: panel }, [h('head'), h('body'), h('foot')]),
                ]);
        },
    });
    const root = new Node('root');
    const app = renderer.createApp(
        defineComponent({
            setup: () => () => (open.value ? h(Dialog, { key: version.value }) : null),
        }),
    );
    app.mount(root);
    return { root, motions, open, version, afterLeave, unmount: () => app.unmount() };
}

async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await nextTick();
}

afterEach(() => vi.unstubAllGlobals());

describe('弹窗真实节点退场', () => {
    it('同一拍替换弹窗接住原遮罩，旧窗离开不会让背景先亮后暗', async () => {
        const scene = mountMotion();
        scene.motions.forEach((motion) => motion.finish());
        await settle();
        const previous = scene.root.children[0];
        scene.version.value++;
        await nextTick();
        const masks = scene.root.children.filter((one) => one.type === 'mask');
        const current = masks.find((one) => one !== previous)!;
        expect(current.hasAttribute('data-modal-inherited')).toBe(true);
        expect(previous.querySelector('.modal-backdrop')!.style.visibility).toBe('hidden');
        const backdrop = scene.motions.filter((one) => one.target === 'backdrop').at(-1)!;
        expect(backdrop.frames[0].opacity).toBe('1');
        scene.motions.forEach((motion) => motion.finish());
        await settle();
        expect(previous.parent).toBeNull();
        expect(current.parent).toBe(scene.root);
        scene.unmount();
        scene.motions.forEach((motion) => motion.finish());
        await settle();
        expect(scene.afterLeave).toHaveBeenCalledTimes(2);
    });

    it('面板与遮罩分别入场，面板完成后解除初始尺寸保护', async () => {
        const scene = mountMotion();
        const mask = scene.root.children[0];
        expect(mask.hasAttribute('data-modal-entering')).toBe(true);
        expect(scene.motions.slice(0, 2).map((one) => one.target)).toEqual(['panel', 'backdrop']);
        scene.motions.forEach((motion) => motion.finish());
        await settle();
        expect(mask.hasAttribute('data-modal-entering')).toBe(false);
        scene.unmount();
        scene.motions.forEach((motion) => motion.finish());
        await settle();
    });

    it('标题、正文和操作短暂错峰淡入，正文不附加位移', async () => {
        const scene = mountMotion();
        const layers = scene.motions.filter((one) => ['head', 'body', 'foot'].includes(one.target));
        expect(layers.map((one) => [one.target, one.delay])).toEqual([
            ['head', 0],
            ['body', 24],
            ['foot', 48],
        ]);
        expect(
            layers.every((one) => one.frames.every((frame) => frame.transform === undefined)),
        ).toBe(true);
        scene.unmount();
        scene.motions.forEach((motion) => motion.finish());
        await settle();
    });

    it('加载交接只淡入正式面板，不再次淡入背景；占位窗立即释放', async () => {
        const scene = mountMotion(false, true, true);
        expect(scene.motions.map((one) => one.target)).toEqual(['panel']);
        expect(scene.motions[0].frames[0].transform).toBe('none');
        scene.root.children[0].setAttribute('data-modal-replaced');
        scene.open.value = false;
        await nextTick();
        await settle();
        expect(scene.root.children.some((one) => one.type === 'mask')).toBe(false);
        expect(scene.afterLeave).toHaveBeenCalledTimes(1);
        scene.unmount();
    });

    it('快速关闭中断入场，保留同一面板，退场完毕只清理一次', async () => {
        const scene = mountMotion();
        const mask = scene.root.children[0];
        const body = mask
            .querySelector('.modal-panel')!
            .children.find((one) => one.type === 'body')!;
        body.opacity = '0.35';
        const entering = scene.motions.length;
        scene.open.value = false;
        await nextTick();
        expect(mask.parent).toBe(scene.root);
        expect(mask.hasAttribute('data-modal-leaving')).toBe(true);
        expect(scene.afterLeave).not.toHaveBeenCalled();
        expect(body.style.opacity).toBe('0.35');
        scene.motions.slice(0, entering).forEach((motion) => motion.finish());
        await settle();
        expect(mask.parent).toBe(scene.root);
        scene.motions.slice(entering).forEach((motion) => motion.finish());
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
        expect(scene.motions.every((motion) => motion.delay === 0)).toBe(true);
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
