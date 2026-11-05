import { shallowRef } from 'vue';

/**
 * 全站悬停说明的统一出口。
 *
 * ---- 为什么不是「给 tooltip 写全局样式」----
 * 界面上这些说明文字走的是原生 `title` 属性（四十多处）。它的提示框由浏览器 / 系统绘制，
 * **不在 DOM 里**，没有元素、没有伪元素、也没有 `::part`——CSS 碰不到它。WebView2 上那枚
 * 系统小白框的字号、行高、圆角、配色都与这张纸无关，用户说的「很不好看」就是它。
 *
 * ---- 也不逐个换成组件 ----
 * 四十多个文件逐个改，改一次动一片，以后新写 `title` 还会漏，最后两种提示同时存在。
 * 所以改在**出口**上：鼠标进到带 `title` 的元素时把属性挪走（挪走系统框才不会接着弹），
 * 由 `<HoverTip>` 按纸的语言画一张；离开再放回去。全站零改动，新代码写 `title` 自动跟上。
 *
 * ---- 挪走 title 之后的无障碍 ----
 * `title` 是最末一档的可访问名。挪走对「元素里有字」的绝大多数没有影响（内容优先）；
 * 只有图标按钮这种**一个字都没有**的，才补一条 `aria-label`，离开时再撤掉。
 *
 * ---- 为什么延迟 320ms ----
 * 立即弹会在鼠标扫过工具栏时连成一片。原生 title 也有首现延迟（0.3–1s），
 * 这里取短的一头：说明文字是「看一眼」，不是「等它出来」。
 *
 * ---- 逃生口 ----
 * 给元素加 `data-tip-off`（自身或祖先）即整块不接管：`<select>` 里的原生项、
 * 需要浏览器原样行为的第三方控件，都用它跳过。
 * 另有一条自动判据：**字就在眼前**（没被截断、内容与 title 相同）时不弹——
 * 那是同一句话说两遍。截断的（`text-overflow` 那类）照弹，正是为了看全名。
 */
export interface HoverTipView {
    text: string;
    /**
     * 显示那一刻的**光标位置**，不是元素矩形。
     *
     * 早先贴元素左下角：小图标按钮看着刚好，一整行文本或一整张卡就跑到很远——
     * 同一个功能两种手感，用户的原话是「有的贴着鼠标有的离鼠标很远」。
     * 元素多大都不该影响纸片落在哪，只有指针位置是恒定的参照。
     *
     * 滚动 / 缩放之后这个点仍是对的（`fixed` 跟着视口走），但元素可能被移走了，
     * 而且原生 title 也是滚一下就收，所以照旧收。
     */
    x: number;
    y: number;
}

/** 首现延迟。原生约 0.3–1s，取短的一头。 */
const SHOW_DELAY = 320;
/** 收起缓冲：鼠标从元素扫到子元素再回来时，纸片不该闪一下。 */
const HIDE_DELAY = 80;

/** 当前要画的纸片。`null` = 收起。文本由宿主保留着，淡出时不会先塌成空。 */
const tip = shallowRef<HoverTipView | null>(null);

interface Hovered {
    el: HTMLElement;
    text: string;
    /** 从 `title` 挪出来的原文；`data-tip` 起的提示没有这一项。 */
    stashed: string | null;
    /** 是否由我们补了 `aria-label`。 */
    labeled: boolean;
}

let showTimer = 0;
let hideTimer = 0;
let hovered: Hovered | null = null;
let detach: (() => void) | null = null;
/** 指针最后一次出现的位置。延迟 320ms 期间鼠标还会走，到点取的是**此刻**，不是进入元素那一下。 */
let point = { x: 0, y: 0 };

function onMove(event: MouseEvent) {
    point = { x: event.clientX, y: event.clientY };
}

function cancelShow() {
    if (showTimer) {
        window.clearTimeout(showTimer);
        showTimer = 0;
    }
}

function cancelHide() {
    if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
    }
}

function textOf(el: HTMLElement): string {
    /* `data-tip` 优先：给了它就是想覆盖 title 那份（比如 title 留着做兜底文案）。 */
    return (el.getAttribute('data-tip') ?? el.getAttribute('title') ?? '').trim();
}

/** 内容是不是被裁掉了。inline 元素两个值都是 0，按「没裁」算——那种元素本来就不截断。 */
function isClipped(el: HTMLElement): boolean {
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

/** 接管：把 `title` 挪进 `data-tip-stash`，必要时补可访问名。 */
function take(el: HTMLElement, text: string): Hovered {
    const stashed = el.getAttribute('title');
    if (stashed !== null) {
        /* 先写 stash 再删 title：两步之间不许出现「两个都没有」的状态。 */
        el.setAttribute('data-tip-stash', stashed);
        el.removeAttribute('title');
    }

    let labeled = false;
    const hasName =
        el.hasAttribute('aria-label') ||
        el.hasAttribute('aria-labelledby') ||
        !!el.textContent?.trim();
    if (!hasName) {
        el.setAttribute('aria-label', text);
        labeled = true;
    }

    return { el, text, stashed, labeled };
}

function restore(one: Hovered) {
    if (one.stashed !== null) {
        const stash = one.el.getAttribute('data-tip-stash');
        one.el.removeAttribute('data-tip-stash');
        /* 期间被重渲染写进新 `title` 的话，以新的为准，别拿旧的盖掉。 */
        if (stash !== null && !one.el.hasAttribute('title')) {
            one.el.setAttribute('title', stash);
        }
    }
    if (one.labeled && one.el.getAttribute('aria-label') === one.text) {
        one.el.removeAttribute('aria-label');
    }
}

/** 收起：恢复属性、清两个计时器、通知宿主。幂等。 */
function leave() {
    cancelShow();
    cancelHide();
    if (hovered) {
        restore(hovered);
        hovered = null;
    }
    tip.value = null;
}

function scheduleShow(one: Hovered) {
    cancelShow();
    showTimer = window.setTimeout(() => {
        showTimer = 0;
        /* 等这 320ms 期间元素可能已经不在页面上了（列表重排、弹窗关掉），
         * 那时还弹就是给一块空气写说明。 */
        if (!one.el.isConnected) return;
        tip.value = { text: one.text, x: point.x, y: point.y };
    }, SHOW_DELAY);
}

function onOver(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    /* 先记位置：这是最新的一次，比上一条 `mousemove` 准。 */
    onMove(event);

    const el = target.closest<HTMLElement>('[title], [data-tip]');
    if (!el) return;

    /* 在同一个元素的子元素之间移动也会连发 mouseover：保持现状，别把纸片收掉又重排。 */
    if (hovered?.el === el) {
        cancelHide();
        return;
    }

    /* 换目标：先把上一个还回去。 */
    cancelHide();
    if (hovered) {
        restore(hovered);
        hovered = null;
        cancelShow();
        tip.value = null;
    }

    const text = textOf(el);
    if (!text) return;
    if (el.closest('[data-tip-off]')) return;
    /* `<option>` 不进渲染树，量出来的矩形是 0，接了也没地方贴。 */
    if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP') return;

    hovered = take(el, text);

    /* 字就在眼前（没截断且内容一致）：不弹。title 仍已被挪走——系统框也不该弹。 */
    if (!isClipped(el) && el.textContent?.trim() === text) return;

    scheduleShow(hovered);
}

function onOut(event: MouseEvent) {
    if (!hovered) return;
    const related = event.relatedTarget;
    /* 移到自己的子元素上不算离开。 */
    if (related instanceof Node && hovered.el.contains(related)) return;

    cancelShow();
    cancelHide();
    hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        leave();
    }, HIDE_DELAY);
}

/* 滚动 / 缩放之后锚点位置就作废了（纸片是 `position: fixed`）：先收，回来再弹。
 * 点击也收——点下去页面多半要变，留着它只会盖住刚打开的东西。 */
function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') leave();
}

/**
 * 装上全局监听，返回拆卸函数。由 `<HoverTip>` 在挂载 / 卸载时调一次。
 * 计数保护：热更新时可能新旧两份宿主短暂并存，别装两遍。
 */
export function installHoverTip(): () => void {
    if (detach) return detach;

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', leave, true);
    window.addEventListener('scroll', leave, true);
    window.addEventListener('resize', leave);
    window.addEventListener('blur', leave);

    detach = () => {
        document.removeEventListener('mouseover', onOver, true);
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseout', onOut, true);
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('pointerdown', leave, true);
        window.removeEventListener('scroll', leave, true);
        window.removeEventListener('resize', leave);
        window.removeEventListener('blur', leave);
        leave();
        detach = null;
    };
    return detach;
}

/** 给宿主用。 */
export function useHoverTipState() {
    return { tip };
}
