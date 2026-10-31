<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';
import { useRovingFocus } from '../composables/use-roving-focus';

/**
 * 竖版滑块：把 `FontSizeSlider` 那一套凹槽语言立起来。
 *
 * 与横版不是「两套控件」，是同一件东西换了个轴：
 *   - 轨道 = 一道竖槽（`--well` 底 + 金边 + 上沿内影），**格子本身不描边、不成形**；
 *   - 只有一枚拇指会动，位移走 `--ease-snap`，落点是格不是连续值；
 *   - 竖过来之后光从左上：左壁压暗、右壁提亮（横版只有上壁）。
 *
 * 格内排法是「图标在上、两字竖排在下」（`writing-mode: vertical-rl`）。
 * 这条**限定标签必须两字**：竖排三字在 62px 格里放不下（3 × 14 × 1.15 ≈ 48，
 * 加图标 15 与间距 7 就撑破）。导航标签恰好全是两字，新增页面时守住这一点。
 *
 * 语义是**页面导航**，不是标签页：这里选的是一个路由，而且全站没有 tabpanel、
 * 也没人给 `aria-controls`。所以根元素是 `<nav>`、当前项给 `aria-current="page"`，
 * 而不是 `tablist` / `aria-selected`——后者会让读屏宣布「标签页 1/8」然后找不到面板。
 *
 * 尺寸全部走 `--vs-*` 变量且默认乘 `--fs-scale`：设置里切「较大」时
 * 格高、字、图标、轨道宽一起长，竖排字不会溢出格子。
 */
interface SliderOption {
    value: string;
    label: string;
    icon: IconName;
    /** 还没实现的入口：字降一档色。不整格变淡——八格里淡七格，整条槽会读成禁用。 */
    muted?: boolean;
    title?: string;
}

const props = defineProps<{ modelValue: string; options: SliderOption[]; label: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const track = ref<HTMLElement | null>(null);
const dragging = ref(false);

/* 键盘与 Tab 停靠点交给 `useRovingFocus`（与三个单选组共用同一套）：整组一个停靠点，
 * 上下键移动选中并带走焦点，Home / End 跳首尾。`cells` 也由它持有。 */
const { cells, activeIndex, tabIndexFor, onKeydown } = useRovingFocus<string>({
    values: () => props.options.map((option) => option.value),
    activeValue: () => props.modelValue,
    pick,
    axis: 'vertical',
});

/* 位移直接写在 style 上，不用 `--i` 自定义属性：`translateY` 是唯一需要 index 的地方，
 * 多注入一个变量只会多一层「类型上不认、运行时才对」的隐患。 */
const thumbStyle = computed(() => ({
    transform: `translateY(calc(${activeIndex.value} * (var(--vs-cell) + var(--vs-gap))))`,
}));

/* 当前值不在选项里（停在一张不属于导航的页面，例如开发页）：**没有选中**。
 * `useRovingFocus` 的 `indexOf` 找不到值就返回 0，若照它画，朱印会停在「总览」上——
 * 读者会以为自己在总览，这比不显示更糟。所以让印收起，只在原地保留 Tab 停靠点。 */
const hasActive = computed(() => props.options.some((option) => option.value === props.modelValue));

function pick(target: number) {
    const option = props.options[target];
    if (!option || option.value === props.modelValue) return;
    emit('update:modelValue', option.value);
}

/** 指针位置 → 档序。取的是「最近一格的中心」，所以点在缝里也不会落空。 */
function indexAt(clientY: number): number {
    const el = track.value;
    const cellHeight = cells.value[0]?.getBoundingClientRect().height ?? 0;
    if (!el || !cellHeight) return 0;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.rowGap) || 0;
    const step = cellHeight + gap;
    /* 起点要算上边框：绝对定位与 grid 内容都从 padding box 起算，`clientTop` 才是那条金边。 */
    const origin =
        el.getBoundingClientRect().top + el.clientTop + (parseFloat(style.paddingTop) || 0);
    const target = Math.round((clientY - origin - cellHeight / 2) / step);
    return Math.max(0, Math.min(props.options.length - 1, target));
}

/* 拖动是附加能力，不是主路径：点一下就能切页，按住才连续跟手。
 * 捕获指针是为了手指滑出轨道后仍然跟手；`dragging` 期间关掉 transition 才有跟手感。 */
function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging.value = true;
    track.value?.setPointerCapture(event.pointerId);
    pick(indexAt(event.clientY));
}

function onPointerMove(event: PointerEvent) {
    if (!dragging.value) return;
    pick(indexAt(event.clientY));
}

function onPointerUp(event: PointerEvent) {
    if (!dragging.value) return;
    dragging.value = false;
    const el = track.value;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
}
</script>

<template>
    <nav
        ref="track"
        class="vs-track well upright"
        :class="{ dragging }"
        :aria-label="label"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKeydown"
    >
        <span
            class="vs-thumb stamp"
            :class="{ dormant: !hasActive }"
            aria-hidden="true"
            :style="thumbStyle"
        />

        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="vs-cell"
            :class="{ muted: option.muted }"
            :aria-current="modelValue === option.value ? 'page' : undefined"
            :tabindex="tabIndexFor(i)"
            :title="option.title ?? option.label"
            @click="pick(i)"
        >
            <AppIcon :name="option.icon" />
            <span class="vs-label">{{ option.label }}</span>
        </button>
    </nav>
</template>

<style scoped>
/* ---------- 轨道：一道竖槽 ----------
 * 深度全部来自全局 `.well.upright`（`base.css`：金边 / `--well` 底 / 左壁暗 / 顶影 / 下沿亮边），
 * 这里只写几何。没有为「长槽」额外加深，两版的差别只在圆角：
 *   外框、格、印一律 `--r-2`（3px），不再是胶囊。
 * 槽与印同形之后，「当前页」靠朱色和一道短影区分，不再靠圆角的形状差。
 *
 * 竖槽的暗面在左壁而不是顶边（光从左上），这条由 `.well.upright` 覆写；
 * 暗面必须是 `--bevel-lo`，用 `--ink` 会在暗色主题翻成一条提亮带——理由见 `base.css`。
 */
.vs-track {
    /* 侧栏规格。父级要换尺寸就覆写这五个变量，组件不认「侧栏」这个概念。
     * 格高 62 是「图标 15 + 间距 7 + 两字竖排 32.2 + 字距 3.4 = 57.6」再留 4px：
     * 原来 66 有 8px 全成了空白，而它是窗口最小高度里最贵的一项——8 格乘出来 32px
     * （再乘 1.1 档的字号系数就是 35px）。 */
    --vs-w: calc(34px * var(--fs-scale));
    --vs-cell: calc(62px * var(--fs-scale));
    --vs-gap: calc(5px * var(--fs-scale));
    --vs-ico: calc(15px * var(--fs-scale));
    --vs-label: calc(14px * var(--fs-scale));

    position: relative;
    display: grid;
    grid-auto-rows: var(--vs-cell);
    row-gap: var(--vs-gap);
    width: var(--vs-w);
    padding: 2px;
    border-radius: var(--r-2);
    touch-action: none;
    cursor: pointer;
    /* 拖动时选中文字会在整条槽上拉出一道蓝，必须关掉。 */
    user-select: none;
}

/* ---------- 拇指：一枚朱印 ----------
 * 印面（底色 / 受光 / 上沿高光 / 落地线与朱色投影）来自全局 `.stamp`，
 * 与横版滑块、两格开关、胶囊选中、槽按钮悬停共用同一份，这里只有几何与位移。
 *
 * `inset` 与轨道 padding 对齐（2px），于是印面比格宽出两侧的槽壁厚度，
 * 读作「印落在槽口上」而不是「槽里填了块红」。
 */
.vs-thumb {
    position: absolute;
    top: 2px;
    right: 2px;
    left: 2px;
    height: var(--vs-cell);
    border-radius: var(--r-2);
    transition:
        transform 300ms var(--ease-snap),
        opacity var(--t-mid) var(--ease-soft);
    /* 印面不吃指针：否则拖到印上时事件目标是它，指针捕获与点击都会错位。 */
    pointer-events: none;
}
/* 按住跟手时不插值，否则拇指追在后面。 */
.vs-track.dragging .vs-thumb {
    transition: none;
}
/* 无选中（不在导航里的页面）：印收起。淡出而不是 `display: none`——它还要参与
 * 下一次切页时的位移过渡，突然出现比淡入更像卡了一下。 */
.vs-thumb.dormant {
    opacity: 0;
}

/* ---------- 格 ---------- */
.vs-cell {
    --icon-size: var(--vs-ico);

    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(7px * var(--fs-scale));
    border: 0;
    /* 格与外框同圆角：悬停那层淡纸是一条「槽内的段」。 */
    border-radius: var(--r-2);
    /* 按钮本体的重置在 `base.css`（`button { font: inherit }`），这里不再重复。 */
    background: none;
    color: var(--ink-2);
    cursor: pointer;
    transition: color var(--t-mid) var(--ease-soft);
}
/* 悬停只提字色 + 一层极淡的纸色：槽里的格不该在悬停时「浮起来」，
 * 那是凸的语言，与凹槽正相反。 */
.vs-cell:hover {
    color: var(--ink);
    background-color: color-mix(in srgb, var(--paper) 42%, transparent);
}
.vs-cell.muted {
    color: var(--muted);
}
.vs-cell.muted:hover {
    color: var(--ink-2);
}
/* 选中那格：只换字色（`--vs-seal-fg`，与印面成对翻），**不加粗、不加描边、不加字距**。
 * 早先给 `.vs-label` 加过 0.25px `-webkit-text-stroke`，本意是让 14px 楷体压得住朱红，
 * 但眼睛读到的就是「这格加粗了」；而文楷本地只有 Regular，描边与合成加粗都会把撇捺糊成块。
 * 「当前在哪一页」由那枚朱印本身交代——位置、颜色、投影三样都说过，不必让字再喊一遍。 */
.vs-cell[aria-current='page'],
.vs-cell[aria-current='page']:hover {
    color: var(--on-seal);
    background: none;
}
/* 聚焦环不能用朱红：选中时底就是朱红，红环会消失。负 offset 收进印面里，
 * 免得在 34px 宽的槽上向外撑出一圈。 */
.vs-cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--ink) 45%, transparent);
    outline-offset: -2px;
}

/* ---------- 竖排两字 ----------
 * `upright` 让汉字正着躺下而不是整体旋转 90°。14px 是下限：13px 竖起来
 * 细成一条线，压不住 15px 的图标；字距 0.12em 刚好把两个字断开成一列，
 * 再大就成了两段互不相干的字。
 */
.vs-label {
    writing-mode: vertical-rl;
    text-orientation: upright;
    font-size: var(--vs-label);
    letter-spacing: 0.12em;
    line-height: 1.15;
}
</style>
