import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * 弹窗的**行为**：Esc、焦点陷阱、锁滚动、关闭后还焦点、叠层栈。
 *
 * 与 `ModalShell.vue` 拆开是因为那个组件同时管了「状态」和「样子」（遮罩、纸面、
 * 页眉头脚），正撞 `CONVENTIONS.md` §2.3-3「一个组件要么管状态，要么管样子」。
 * 拆完之后：这个文件只回答「弹窗打开时键盘与焦点怎么走」，组件只回答「它长什么样」。
 *
 * ---- 四条都是实测出来的，不是设计偏好 ----
 *
 * ① **Esc 走冒泡阶段，不能走捕获。**
 *    捕获会抢在目标元素之前，`SelectField` 就再也收不到 Esc——展开下拉按 Esc 会关掉
 *    整张窗、丢掉正在填的表单（它自己在注释里写过这个坑）。冒泡是「最具体的元素先决定」：
 *    它 `stopPropagation` 之后这里自然收不到；收到就说明没人在意这次 Esc，才轮到关窗。
 *
 * ② **焦点必须锁在窗内，关闭后还给触发它的那个元素。**
 *    不锁的话 Tab 会把焦点送到遮罩下面那些看不见的按钮上；不还的话焦点掉回 `body`，
 *    键盘用户得从文档开头重新 Tab 一遍。
 *
 * ③ **删除类确认的初始焦点必须落在「取消」上**（`initialFocus: 'cancel'`，
 *    靠 `data-modal-cancel` 标记找）。「确认」紧挨着它，焦点默认落在第一个就等于
 *    让一次误触回车完成删除。
 *
 * ④ **锁滚动只在栈深 0→1 / 1→0 两个时刻动，且快照是模块级的。**
 *    早先每个实例各拍一张：叠层时后开的窗拍到的是前一层写下的 `hidden`，
 *    删整件物品（历史窗 + 确认窗接连卸载）之后整页滚不动、要刷新。
 *
 * ---- 为什么这些变量在模块作用域，而不是 `setup()` 里 ----
 * 本文件的顶层 `let` / `const` 是模块级的，所有弹窗实例共享一份。
 * **不能**把它们搬进组件的 `<script setup>`：那段代码会被编译进 `setup()`，
 * 于是每个实例各有一份——栈长恒为 1（栈顶判断失效）、锁滚动各记各的（还原成 `hidden`）。
 * 这个坑没有类型错误、没有 lint、也不报错，只有实测看得见。
 */

const modalStack: symbol[] = [];

/**
 * 当前栈顶的 token。
 *
 * 给组件用：被盖住的那一层对读屏与 Tab 都该是「不存在」的——`aria-modal="true"` 只能挂在
 * 最上面那层，下层的面板还要 `inert`（否则 Tab 能走到遮罩下面那张窗的按钮上，
 * 而它在视觉上已经被盖住了）。
 */
const topToken = ref<symbol | null>(null);

/** 被锁滚动的元素与它的原值。只认「栈深 0→1」与「1→0」两个时刻，中间层不管。 */
let lockedEl: HTMLElement | null = null;
let lockedOverflow = '';

export interface UseModalOptions {
    /** 面板元素。焦点陷阱要它。 */
    panel: Ref<HTMLElement | null>;
    /** 初始焦点：`first` 第一个可聚焦元素，`cancel` 带 `data-modal-cancel` 的那个。 */
    initialFocus?: 'first' | 'cancel';
    /** 请求关闭。Esc 按下时调用，由组件决定发出哪个事件。 */
    onClose: () => void;
}

export interface UseModalResult {
    /** 这一层是不是当前最上面的窗。组件据此决定 `aria-modal` 与 `inert`。 */
    isTop: Readonly<Ref<boolean>>;
}

export function useModal(options: UseModalOptions): UseModalResult {
    const token = Symbol('modal');
    const isTop = computed(() => topToken.value === token);

    /** 关闭后要还回去的那个元素。在 `onMounted` 里取，那时它还在文档里。 */
    let restoreTo: HTMLElement | null = null;

    function focusables(): HTMLElement[] {
        const panel = options.panel.value;
        if (!panel) return [];
        const selector =
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
            'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        /* `offsetParent` 过滤掉不可见的：`v-if` 之外还要防 `display: none` 的分支。 */
        return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(
            (element) => element.offsetParent !== null,
        );
    }

    function focusInitial() {
        const panel = options.panel.value;
        const list = focusables();
        if (options.initialFocus === 'cancel') {
            const cancel = panel?.querySelector<HTMLElement>('[data-modal-cancel]');
            if (cancel) {
                cancel.focus();
                return;
            }
        }
        if (list.length) {
            list[0].focus();
            return;
        }
        /* 一个可聚焦元素都没有时把焦点给面板本身：面板带 `tabindex="-1"`，可以聚焦
         * 但不进 Tab 序列。不这么做的话焦点留在遮罩下的页面上，读屏仍会念背景内容。 */
        panel?.focus();
    }

    function onKeydown(event: KeyboardEvent) {
        /* 内层已经处理过就别再管（见头注释 ①）。 */
        if (event.defaultPrevented) return;
        /* 只有栈顶的窗响应：叠着开时一次 Esc 不能关掉两层。 */
        if (modalStack[modalStack.length - 1] !== token) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            options.onClose();
            return;
        }
        if (event.key !== 'Tab') return;

        const list = focusables();
        if (!list.length) return;

        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = active instanceof Node && options.panel.value?.contains(active) === true;

        if (!inside) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
            return;
        }
        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    onMounted(() => {
        restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        modalStack.push(token);
        topToken.value = token;

        /* 只在栈深 0→1 时锁（见头注释 ④）。
         *
         * 锁的是 `.page-content`——这个应用里真正滚动的就是它（`.app` 是固定高度的一屏，
         * `body` 从头到尾不滚）。找不到它时退回 `.app` 而不是 body：`.app` 是这一屏的
         * 容器，把它的 `overflow` 关住才有意义；body 本来就不滚，锁它等于什么都没做。 */
        if (modalStack.length === 1) {
            lockedEl =
                document.querySelector<HTMLElement>('.page-content') ??
                document.querySelector<HTMLElement>('.app');
            if (lockedEl) {
                lockedOverflow = lockedEl.style.overflow;
                lockedEl.style.overflow = 'hidden';
            }
        }

        /* 冒泡阶段（不加第三个参数）：见头注释 ①。 */
        document.addEventListener('keydown', onKeydown);
        void nextTick(focusInitial);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('keydown', onKeydown);

        const at = modalStack.indexOf(token);
        if (at >= 0) modalStack.splice(at, 1);
        /* 让位给下面那一层：它重新成为「最上面」的那一个。 */
        topToken.value = modalStack[modalStack.length - 1] ?? null;

        if (!modalStack.length && lockedEl) {
            lockedEl.style.overflow = lockedOverflow;
            lockedEl = null;
        }

        /* 还焦点（见头注释 ②）。元素可能已经不在文档里（触发它的卡片被删了），
         * `isConnected` 一查就知道——那种情况下不强还，落回文档开头是唯一诚实的落点。
         *
         * **必须等一个 tick**。叠层时下面那层此刻还挂着 `inert`（它是上一刻的非栈顶），
         * 而 Chromium 会忽略 inert 子树里的 `focus()`——同步调用等于白调，焦点掉回 body，
         * 键盘用户要从文档开头重新 Tab。`topToken` 刚改过，下一帧 Vue 才摘掉 inert，
         * 所以这里推迟到那一刻再还。 */
        const target = restoreTo;
        restoreTo = null;
        void nextTick(() => {
            if (target?.isConnected) target.focus();
        });
    });

    return { isTop };
}
