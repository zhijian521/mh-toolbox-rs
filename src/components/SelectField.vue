<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import AppIcon from './AppIcon.vue';

/**
 * 下拉选择：一条**槽** + 一张**纸片**。
 *
 * 为什么不用原生 `<select>`：那条控件在 Windows / WebView2 上永远是系统外观
 * （自带边框、自带灰底、字号不跟主题），放进这张纸里就成了一块贴错的金属片。
 * 与 `SteppedSlider` 不做 `<input type="range">` 是同一条理由——控件的外观必须
 * 来自这套语言，而不是操作系统。
 *
 * 三段各自的出处：
 * - **触发条**直接用全局 `.field`：它与旁边的输入格是同一个凹槽（同一个高度、
 *   同一道顶影），并排时不打架。这里只加「文字在左、箭头在右」的排布。
 * - **纸片**是一张 `--paper` 的浮层，1px 账线 + `--shadow-lift`，与装备 / 召唤兽
 *   那两张浮片同一种「纸抬起来」的影子；暗色下按同一条规矩把纸面提一档
 *   （黑压黑时投影等于没有）。
 * - **当前项**用一根 3px 朱色短竖条 + 朱字。竖条与 `.section-mark` 是同一个说法
 *   （「从这里开始」），不新造一枚勾。
 *
 * 键盘按 select-only combobox 的约定：焦点始终在触发条上，列表不接管焦点——
 * `aria-activedescendant` 指当前高亮项。`Esc` 关列表并**吞掉事件**：这张控件常常
 * 长在弹窗里，而弹窗自己也听 `Esc`（关掉整张纸），不拦的话「关下拉」会连弹窗一起关。
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: { value: string; label: string }[];
        /** 读屏念的字段名。 */
        label: string;
        disabled?: boolean;
        /** 一个字都没选时显示的字。空字符串当「没有值」处理。 */
        placeholder?: string;
    }>(),
    { disabled: false, placeholder: '未选' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);

const open = ref(false);
/* 高亮项与「已经选中的值」是两件事：方向键移动高亮，回车才落定。
 * 混成一个变量的话，只是路过某一项就会把值改掉。 */
const cursor = ref(0);

/* 纸片横向的落位修正（px，只会 ≤ 0）。
 *
 * 纸片默认从触发条左缘向右长，但它在门派那一格里只有约 114 宽，而 `min-width` 要
 * 168（名字不能截成「大唐官…」）。右端于是伸到弹窗外——弹窗是 `overflow: hidden`，
 * 纸片的右边框与影子被齐刀切掉（2026-11-03 用户：「下拉会挤压布局」）。
 *
 * 更糟的是连带着把**整张弹窗**滚歪了：`scrollCursorIntoView` 用的是
 * `scrollIntoView({ block: 'nearest' })`，它的 `inline` 默认也是 `nearest`，
 * 而高亮项正压在弹窗右边界之外 → 浏览器把最近的可滚祖先（`.editor`，
 * `overflow: hidden` 也照样能被程序滚动）横向滚了 14px。量出来的后果是
 * `editor.scrollLeft = 14`：左边「名字 / 区服」标签、左边那一格「属性」都被切掉，
 * 弹窗内容整体左移——看着就像布局被挤了。
 *
 * 所以两件事一起改：① 纸片在出界时改右对齐到触发条，绝不出裁剪容器；
 * ② 高亮项只滚**纸片自己**（见 `scrollCursorIntoView`），不碰祖先。 */
const listShift = ref(0);

/* 纸片向上翻还是向下长。
 *
 * 横向那条规矩只管「别伸出左右」，纵向还得管「别伸出底边」：辅助技能那几行排在弹窗
 * 底部，向下只剩二三十像素，8.5 行的纸片被 `overflow: hidden` 齐刀切掉——实测只露出
 * 第一项（2026-11-03）。弹窗、卡片这类固定高度的纸里，向下长从来不是天经地义：
 * 下方不够、上方更宽裕时就翻上去。 */
const flipUp = ref(false);

const listId = `select-${useId()}`;
const optionId = (index: number) => `${listId}-opt-${index}`;

const selectedIndex = computed(() =>
    props.options.findIndex((item) => item.value === props.modelValue),
);
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '');

/* 找最近一个会裁剪的祖先（`.editor` 那层）。找不到就用视口——
 * 浮层只该待在这块边界里，别的容器都一样。 */
function clipBox(start: HTMLElement): { left: number; right: number; top: number; bottom: number } {
    let node: HTMLElement | null = start.parentElement;
    while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
            const box = node.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        }
        node = node.parentElement;
    }
    return {
        left: 0,
        right: document.documentElement.clientWidth,
        top: 0,
        bottom: document.documentElement.clientHeight,
    };
}

function placeList() {
    const triggerEl = trigger.value;
    const listEl = list.value;
    if (!triggerEl || !listEl) return;

    /* 4 是纸片与边界之间留的一道缝：贴死时纸片的影子和弹窗的文武线叠在一起，
     * 读作「这个浮层是从弹窗边上挤出来的」。 */
    const inset = 4;
    const box = clipBox(triggerEl);
    const rect = triggerEl.getBoundingClientRect();
    const width = listEl.offsetWidth;

    /* 先试左对齐；右端出界就改成**右对齐到触发条**（`rect.width − width`，通常为负），
     * 再兜一次左端——两条都兜住时它才可能贴在容器边缘上。 */
    let shift = 0;
    if (rect.left + width > box.right - inset) shift = Math.min(0, rect.width - width);
    if (rect.left + shift < box.left + inset) shift = box.left + inset - rect.left;

    listShift.value = Math.round(shift);

    /* 纵向：挑空间大的一侧。两边都放得下时不翻（向下是默认，符合「从控件下面长出来」
     * 的预期）；下方不够且上方更多时才翻。 */
    const height = listEl.offsetHeight;
    const below = box.bottom - rect.bottom - inset;
    const above = rect.top - box.top - inset;
    flipUp.value = height > below && above > below;
}

/* 只滚纸片自己。
 *
 * 不用 `scrollIntoView`：它连祖先一起滚（见 `listShift` 上面那段），
 * 而这里要动的只有那一列。`offsetTop` 相对纸片（它自己是定位元素），
 * 上 3 / 下 3 是纸片那圈内衬的厚度，让高亮项不要贴着边框停。 */
function scrollCursorIntoView() {
    const listEl = list.value;
    const items = listEl?.querySelectorAll<HTMLElement>('[role="option"]');
    const item = items?.[cursor.value];
    if (!listEl || !item) return;

    const top = item.offsetTop - 3;
    const bottom = item.offsetTop + item.offsetHeight + 3;
    if (top < listEl.scrollTop) listEl.scrollTop = top;
    else if (bottom > listEl.scrollTop + listEl.clientHeight) {
        listEl.scrollTop = bottom - listEl.clientHeight;
    }
}

function openList() {
    if (props.disabled || !props.options.length) return;
    cursor.value = Math.max(0, selectedIndex.value);
    open.value = true;
    /* 先落位再滚：`placeList` 要把纸片挪进容器，`scrollCursorIntoView` 读的是
     * 挪好之后的 `clientHeight` 与位置。 */
    void nextTick(() => {
        placeList();
        scrollCursorIntoView();
    });
}

function closeList(focusTrigger = false) {
    if (!open.value) return;
    open.value = false;
    if (focusTrigger) trigger.value?.focus();
}

function toggle() {
    if (open.value) closeList(true);
    else openList();
}

function choose(index: number) {
    if (props.disabled) return;
    const option = props.options[index];
    if (!option) return;
    emit('update:modelValue', option.value);
    closeList(true);
}

function move(step: number) {
    const count = props.options.length;
    if (!count) return;
    cursor.value = (cursor.value + step + count) % count;
    void nextTick(scrollCursorIntoView);
}

function onKeydown(event: KeyboardEvent) {
    if (props.disabled) return;

    if (!open.value) {
        /* 打开的那几个键都是 combobox 的惯例。空格要 `preventDefault`：
         * 在按钮上它默认是「点击」，否则会先开一次、再由 click 关一次。 */
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            openList();
        }
        return;
    }

    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            /* 吞掉：弹窗（`CharacterEditor`）在 document 上听 Esc 关整张纸。
             * 不拦的话，用户想关下拉，结果连正在填的表单一起关掉。 */
            event.stopPropagation();
            closeList(true);
            break;
        case 'Tab':
            /* 不拦：焦点本来就要离开这个控件，列表跟着收起来即可。 */
            closeList();
            break;
        case 'ArrowDown':
            event.preventDefault();
            move(1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            move(-1);
            break;
        case 'Home':
            event.preventDefault();
            cursor.value = 0;
            void nextTick(scrollCursorIntoView);
            break;
        case 'End':
            event.preventDefault();
            cursor.value = props.options.length - 1;
            void nextTick(scrollCursorIntoView);
            break;
        case 'Enter':
        case ' ':
            event.preventDefault();
            choose(cursor.value);
            break;
    }
}

/* 点空白处收起。用 `pointerdown` 而不是 `click`：点在别的输入格上时，
 * 焦点会在 `click` 之前就移过去，等 `click` 到来说明列表已经盖在别的控件上了。 */
function onPointerDown(event: PointerEvent) {
    if (!open.value) return;
    if (root.value?.contains(event.target as Node)) return;
    closeList();
}

watch(
    () => props.disabled,
    (value) => {
        if (value) closeList();
    },
    { flush: 'sync' },
);

onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
    <div ref="root" class="select-field">
        <button
            ref="trigger"
            type="button"
            class="field select-trigger"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-controls="listId"
            :aria-activedescendant="open ? optionId(cursor) : undefined"
            :aria-label="label"
            :disabled="disabled"
            @click="toggle"
            @keydown="onKeydown"
        >
            <span class="select-text" :class="{ empty: !selectedLabel }">
                {{ selectedLabel || placeholder }}
            </span>
            <AppIcon name="chevron-down" class="select-arrow" :class="{ on: open }" />
        </button>

        <ul
            v-if="open"
            :id="listId"
            ref="list"
            class="select-list"
            :class="{ up: flipUp }"
            :style="{ left: `${listShift}px` }"
            role="listbox"
            :aria-label="label"
        >
            <li
                v-for="(option, index) in options"
                :id="optionId(index)"
                :key="option.value"
                class="select-opt"
                role="option"
                :aria-selected="option.value === modelValue"
                :class="{ cursor: index === cursor, on: option.value === modelValue }"
                @pointerdown.prevent="choose(index)"
                @pointermove="cursor = index"
            >
                <span class="opt-mark"></span>
                <span class="opt-label">{{ option.label }}</span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
/* 宽度由父级定：与旁边那个输入格一样吃满自己的格子（`flex: 1`）。 */
.select-field {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
}

/* 外观整份来自 `.field`（凹槽），这里只排布：文字在左、箭头在右。 */
.select-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    --icon-size: calc(13px * var(--fs-scale));
}
.select-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 「未选」是提示不是值：与输入格的 placeholder 同一种灰。 */
.select-text.empty {
    color: var(--muted);
}
.select-arrow {
    flex: none;
    color: var(--ink-2);
    /* 展开时翻个身。翻转用 `--t-shape`（220ms）：这是形状变化，不是按压反馈。 */
    transition: transform var(--t-shape) var(--ease-soft);
}
.select-arrow.on {
    transform: rotate(180deg);
}

/* 纸片：与装备 / 召唤兽浮片同一枚影子、同一条账线。
 * `top: calc(100% + 4px)` 而不是贴住：贴住时触发条的下暗棱与纸片的上亮棱相撞，
 * 两层纸读成一块（相邻两张票之间那道缝要的是同一个道理——`sm` 4 / `md` 6，
 * 上下两笔棱贴住会互相抵消，所以这里也留一条缝的距离）。 */
.select-list {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    /* 默认左对齐，出界时由组件内联的 `left`（`listShift`）往左挪——见脚本那段注释。 */
    left: 0;
    /* 至少 168 宽：触发条在门派那一格里只有约 114，跟着它走时每一行都截成
     * 「大唐官…」，一列全带省略号就分不出谁是谁。多出来的宽度靠 `listShift`
     * 改成右对齐**往左长**，不许往右伸到弹窗外面（伸出去会被 `overflow: hidden` 切掉，
     * 还会把整张弹窗横向滚歪）。 */
    min-width: max(100%, calc(168px * var(--fs-scale)));
    /* 八行半：露出半行是**故意的**——它告诉人「下面还有」，比一条硬邦邦的
     * 截断更像可以滚。 */
    max-height: calc(26px * var(--fs-scale) * 8.5 + 6px);
    margin: 0;
    /* 3px 的四周留白：纸片上那块「内衬」，与 `.frame` 的 `--dual-inset: 3px` 同值。 */
    padding: 3px;
    overflow: auto;
    list-style: none;
    border: var(--w-hair) solid var(--popover-edge);
    border-radius: var(--r-2);
    background: var(--popover-bg);
    box-shadow: var(--popover-shadow);
    /* **不要写 `scrollbar-width`**（这里原来写的是 `thin`）。
     *
     * 它和 `scrollbar-color` 是 CSS 的「标准」滚动条属性，Chromium 121 起一旦在某个
     * 元素上写了它，就不再套用全站那套 `::-webkit-scrollbar`——`--scrollbar-w` 的 10px、
     * `--scrollbar-thumb` 的三个状态全部失效，滑块退回系统灰条（2026-11-03 用户：
     * 「下拉框的滚动条没有用我们的优化」）。去掉之后它自动拿到 `base.css` 里那份：
     * 10px 轨道、3px 透明边收出的 4px 圆头、褐色滑杆、悬停加深。
     *
     * 窄不窄的问题不用它解决：`::-webkit-scrollbar-thumb` 的 `border: 3px solid transparent`
     * 已经让滑杆只占 4px，剩下的 6px 是「轨道也不画」的留白。 */
}
/* 翻到触发条上方（`flipUp`）：下方空间不够时由脚本挂上这个类。
 * 缝还是 4px，方向相反——同一条「别贴死」的理由：贴住时两层纸读成一块。 */
.select-list.up {
    top: auto;
    bottom: calc(100% + 4px);
}

/* 纸片里的滑杆用**深一档**的那支（`--scrollbar-thumb-hover`），悬停再深一档。
 *
 * `base.css` 那份滑杆是按「整页 / 整张卡」调的：4px 宽、`--scrollbar-thumb`（浅褐），
 * 压在纸色上是 1.7:1 的一道浅痕——那么长的轨道上够用，因为轨道旁边就是窗口边。
 * 换到 168 宽的浮片里、旁边全是纸，同一支笔读起来只是纸上一道划痕，
 * 「这里还能往下滚」这件事就不成立。所以只换**深一档的现成令牌**，不动宽度、
 * 不动圆角、不新造颜色——它仍是全站同一条滑杆，只是这里取深的那档。 */
.select-list::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb-hover);
}
.select-list::-webkit-scrollbar-thumb:hover {
    background-color: var(--scrollbar-thumb-active);
}

.select-opt {
    display: flex;
    align-items: center;
    gap: 6px;
    height: calc(26px * var(--fs-scale));
    padding: 0 7px;
    border-radius: var(--r-1);
    color: var(--ink-2);
    font-size: var(--fs-sm);
    line-height: 1;
    cursor: pointer;
    /* 只过渡底色：高度、字色变了会让整列在方向键移动时抖一下。 */
    transition: background-color var(--t-quick) var(--ease-soft);
}
/* 高亮（鼠标经过 / 方向键停在这一项）：一点朱洇开，与 `.chip-action:hover` 同一条。
 * 不灌满朱：灌满的只有 `.seal` 那一族（主操作）。 */
.select-opt.cursor {
    background: color-mix(in srgb, var(--seal) 9%, transparent);
    color: var(--ink);
}
/* 已经选中的那一项：朱字 + 朱色短竖条。竖条与 `.section-mark` 同一个说法
 * （「这一项是当前」），比再画一枚勾省事，也不会与「已入账」的印章混起来。 */
.select-opt.on {
    color: var(--accent);
}
.opt-mark {
    flex: none;
    width: 3px;
    height: 12px;
    border-radius: 1px;
    background: transparent;
}
.select-opt.on .opt-mark {
    background: var(--accent);
}
.opt-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
