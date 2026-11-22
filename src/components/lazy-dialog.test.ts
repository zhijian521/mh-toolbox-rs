import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue';
import { lazyDialog } from './lazy-dialog';

vi.mock('./ModalShell.vue', async () => {
    const { defineComponent, h } = await import('vue');
    return {
        default: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs, slots }) {
                return () => h('modal', attrs, [slots.default?.(), slots.footer?.()]);
            },
        }),
    };
});
vi.mock('./PressButton.vue', async () => {
    const { defineComponent, h } = await import('vue');
    return {
        default: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
                return () => h('button', attrs);
            },
        }),
    };
});

interface HostNode {
    type: string;
    parent: HostNode | null;
    children: HostNode[];
    props: Record<string, unknown>;
    closest: () => null;
}
const node = (type: string): HostNode => ({
    type,
    parent: null,
    children: [],
    props: {},
    closest: () => null,
});
const renderer = createRenderer<HostNode, HostNode>({
    createElement: node,
    createText: () => node('text'),
    createComment: () => node('comment'),
    setText: () => {},
    setElementText: () => {},
    parentNode: (one) => one.parent,
    nextSibling: (one) => {
        const children = one.parent?.children ?? [];
        return children[children.indexOf(one) + 1] ?? null;
    },
    insert(one, parent, anchor) {
        if (one.parent) one.parent.children.splice(one.parent.children.indexOf(one), 1);
        one.parent = parent;
        const index = anchor ? parent.children.indexOf(anchor) : -1;
        parent.children.splice(index < 0 ? parent.children.length : index, 0, one);
    },
    remove(one) {
        one.parent?.children.splice(one.parent.children.indexOf(one), 1);
        one.parent = null;
    },
    patchProp: (one, key, _previous, value) => {
        one.props[key] = value;
    },
});

function find(root: HostNode, type: string): HostNode | undefined {
    if (root.type === type) return root;
    for (const child of root.children) {
        const found = find(child, type);
        if (found) return found;
    }
}
async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await nextTick();
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
const Dialog = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
        return () => h('editor', attrs, slots.default?.());
    },
});
const mounted: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    mounted.splice(0).forEach((unmount) => unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('弹窗代码按需加载', () => {
    function mount(component: typeof Dialog, attrs = {}) {
        vi.stubGlobal('document', { activeElement: null });
        const visible = ref(true);
        const root = node('root');
        const app = renderer.createApp({
            setup: () => () => (visible.value ? h(component, attrs) : null),
        });
        app.mount(root);
        mounted.push(() => app.unmount());
        return { root, visible };
    }

    it('定义不加载，首次打开共享请求，后续打开复用成功组件', async () => {
        const request = deferred<{ default: typeof Dialog }>();
        const loader = vi.fn(() => request.promise);
        const Lazy = lazyDialog(loader);
        expect(loader).not.toHaveBeenCalled();
        const first = mount(Lazy);
        const second = mount(Lazy);
        expect(loader).toHaveBeenCalledTimes(1);
        expect(find(first.root, 'modal')).toBeUndefined();
        request.resolve({ default: Dialog });
        await settle();
        expect(find(first.root, 'editor')).toBeDefined();
        expect(find(second.root, 'editor')).toBeDefined();
        const third = mount(Lazy);
        expect(find(third.root, 'editor')).toBeDefined();
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('慢请求才展示加载窗口，快速完成不会先闪出占位窗', async () => {
        const request = deferred<{ default: typeof Dialog }>();
        const { root } = mount(lazyDialog(() => request.promise));
        await vi.advanceTimersByTimeAsync(179);
        expect(find(root, 'modal')).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(find(root, 'modal')).toBeDefined();
        request.resolve({ default: Dialog });
        await settle();
        expect(find(root, 'modal')).toBeUndefined();
        expect(find(root, 'editor')).toBeDefined();
    });

    it('等待期间关闭，加载完成不重新打开', async () => {
        const request = deferred<{ default: typeof Dialog }>();
        const close = vi.fn();
        const { root, visible } = mount(
            lazyDialog(() => request.promise),
            { onClose: close },
        );
        await vi.advanceTimersByTimeAsync(180);
        (find(root, 'modal')!.props.onClose as () => void)();
        expect(close).toHaveBeenCalledOnce();
        visible.value = false;
        await nextTick();
        request.resolve({ default: Dialog });
        await settle();
        expect(find(root, 'editor')).toBeUndefined();
        expect(find(root, 'modal')).toBeUndefined();
    });

    it('失败显示重试入口，重试成功后转发原有数据和保存事件', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const loader = vi
            .fn<() => Promise<{ default: typeof Dialog }>>()
            .mockRejectedValueOnce(new Error('chunk unavailable'))
            .mockResolvedValue({ default: Dialog });
        const save = vi.fn();
        const { root } = mount(lazyDialog(loader), { name: '角色', onSave: save });
        await settle();
        const modal = find(root, 'modal')!;
        expect(modal.props.title).toBe('加载失败');
        const retry = modal.children.find(
            (one) => one.type === 'button' && one.props.text === '重试',
        );
        (retry!.props.onClick as () => void)();
        await settle();
        const editor = find(root, 'editor')!;
        expect(editor.props.name).toBe('角色');
        (editor.props.onSave as (value: number) => void)(20);
        expect(save).toHaveBeenCalledWith(20);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('已有弹层时在窗内显示失败和重试，沿用现有遮罩', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const loader = vi
            .fn<() => Promise<{ default: typeof Dialog }>>()
            .mockRejectedValueOnce(new Error('chunk unavailable'))
            .mockResolvedValue({ default: Dialog });
        const Lazy = lazyDialog(loader, (failed, retry) => h('inline-status', { failed, retry }));
        const { root } = mount(Lazy, { name: '物价' });
        await settle();
        const status = find(root, 'inline-status')!;
        expect(status.props.failed).toBe(true);
        expect(find(root, 'modal')).toBeUndefined();
        (status.props.retry as () => void)();
        await settle();
        expect(find(root, 'editor')?.props.name).toBe('物价');
        expect(find(root, 'inline-status')).toBeUndefined();
    });

    it('等待提示出现前卸载，延迟计时器不会留下加载窗口', async () => {
        const { root, visible } = mount(
            lazyDialog(() => new Promise<{ default: typeof Dialog }>(() => {})),
        );
        visible.value = false;
        await nextTick();
        await vi.advanceTimersByTimeAsync(200);
        expect(find(root, 'modal')).toBeUndefined();
    });

    it('角色编辑器的 cancel 事件同样可以关闭加载窗口', async () => {
        const cancel = vi.fn();
        const { root } = mount(
            lazyDialog(() => new Promise<{ default: typeof Dialog }>(() => {})),
            { onCancel: cancel },
        );
        await vi.advanceTimersByTimeAsync(180);
        (find(root, 'modal')!.props.onClose as () => void)();
        expect(cancel).toHaveBeenCalledOnce();
    });
});
