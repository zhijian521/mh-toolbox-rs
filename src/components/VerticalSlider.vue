<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 竖版滑块：把 `FontSizeSlider` 那一套凹槽语言立起来。
 *
 * 与横版不是「两套控件」，是同一件东西换了个轴：
 *   - 轨道 = 一道竖槽（`--well` 底 + 金边 + 上沿内影），**格子本身不描边、不成形**；
 *   - 只有一枚拇指会动，位移走 `--ease-snap`，落点是格不是连续值；
 *   - 竖过来之后光从左上：左壁压暗、右壁提亮（横版只有上壁）。
 *
 * 格内排法是「图标在上、两字竖排在下」（`writing-mode: vertical-rl`）。
 * 这条**限定标签必须两字**：竖排三字在 66px 格里放不下（3 × 14 × 1.15 ≈ 55，
 * 加图标 15 与间距 7 就撑破）。导航标签恰好全是两字，新增页面时守住这一点。
 *
 * 语义按 `tablist` 而不是 `radiogroup`：这里选的是一个页面，不是一个值。
 * 上下方向键移动选中并带走焦点（`tabindex` 只在选中项上是 0，Tab 只停一次）。
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
const cells = ref<HTMLButtonElement[]>([]);
const dragging = ref(false);

const index = computed(() =>
    Math.max(
        0,
        props.options.findIndex((option) => option.value === props.modelValue),
    ),
);

/* 位移直接写在 style 上，不用 `--i` 自定义属性：`translateY` 是唯一需要 index 的地方，
 * 多注入一个变量只会多一层「类型上不认、运行时才对」的隐患。 */
const thumbStyle = computed(() => ({
    transform: `translateY(calc(${index.value} * (var(--vs-cell) + var(--vs-gap))))`,
}));

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
    if (step <= 0) return 0;
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

async function onKeydown(event: KeyboardEvent) {
    const last = props.options.length - 1;
    const current = index.value;
    /* 不给初值：四个方向键分支之外直接 return，初值永远用不上（eslint 也会拦）。 */
    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(last, current + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    pick(next);
    /* 等 DOM 换过 `tabindex` 再聚焦：否则焦点落在仍是 -1 的旧格上，Tab 会跳走。 */
    await nextTick();
    cells.value[next]?.focus();
}
</script>

<template>
    <div
        ref="track"
        class="vs-track"
        :class="{ dragging }"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="label"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKeydown"
    >
        <span class="vs-thumb" aria-hidden="true" :style="thumbStyle" />

        <button
            v-for="(option, i) in options"
            :key="option.value"
            ref="cells"
            type="button"
            class="vs-cell"
            :class="{ muted: option.muted }"
            role="tab"
            :aria-selected="modelValue === option.value"
            :tabindex="modelValue === option.value ? 0 : -1"
            :title="option.title ?? option.label"
            @click="pick(i)"
        >
            <AppIcon :name="option.icon" />
            <span class="vs-label">{{ option.label }}</span>
        </button>
    </div>
</template>

<style scoped>
/* ---------- 轨道：一道竖槽 ----------
 * 深度沿用横版 `.size-slider` 的四件套（金边 / `--well` 底 / 顶部内影 / 单向左壁渐变），
 * 没有为「长槽」额外加深——两版的差别只在圆角：
 *   外框 `--vs-radius`（默认 `--r-2`，3px），里面的印取同一个值，不再是胶囊。
 * 槽与印同形之后，「当前页」靠朱色和一道短影区分，不再靠圆角的形状差。
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
    /* 小圆角。外框、格、印共用它——一处改，三处一起变。 */
    --vs-radius: var(--r-2);
    /* 印面与印上的字成对定义，暗色下整套换掉，见下面 `html.dark` 那段。 */
    --vs-seal: var(--cinnabar);
    --vs-seal-fg: var(--on-cinnabar);

    position: relative;
    display: grid;
    grid-auto-rows: var(--vs-cell);
    row-gap: var(--vs-gap);
    width: var(--vs-w);
    padding: 2px;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 80%, transparent);
    border-radius: var(--vs-radius);
    background-color: var(--well);
    background-image: linear-gradient(
        90deg,
        color-mix(in srgb, var(--ink) 11%, transparent),
        transparent 26%,
        transparent 74%,
        color-mix(in srgb, var(--bevel-hi) 38%, transparent)
    );
    box-shadow:
        inset 0 2px 3px -1px color-mix(in srgb, var(--ink) 18%, transparent),
        inset 0 -1px 0 var(--bevel-hi);
    touch-action: none;
    cursor: pointer;
    /* 拖动时选中文字会在整条槽上拉出一道蓝，必须关掉。 */
    user-select: none;
}

/* ---------- 拇指：一枚朱印 ----------
 * `inset` 与轨道 padding 对齐（2px），于是印面比格宽出两侧的槽壁厚度，
 * 读作「印落在槽口上」而不是「槽里填了块红」。
 */
.vs-thumb {
    position: absolute;
    top: 2px;
    right: 2px;
    left: 2px;
    height: var(--vs-cell);
    border-radius: var(--vs-radius);
    background-color: var(--vs-seal);
    /* 上高光收到 15%、强度取 32%：原来一路铺到 46% 且用满强度 `--bevel-hi`
     * （亮色下是 82% 白），印面上半截整体泛白，红色只剩下面一半（用户截图指出
     * 「上面白色有点多」）。现在它只是一层贴着顶边的薄光，
     * 「印面有厚度」主要靠下面那条 1px 的 `inset` 硬边光，不是这一片渐变。 */
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bevel-hi) 32%, transparent),
        transparent 15%,
        var(--bevel-lo)
    );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 3px 7px color-mix(in srgb, var(--vs-seal) 28%, transparent);
    transition: transform 300ms var(--ease-snap);
    /* 印面不吃指针：否则拖到印上时事件目标是它，指针捕获与点击都会错位。 */
    pointer-events: none;
}
/* 按住跟手时不插值，否则拇指追在后面。 */
.vs-track.dragging .vs-thumb {
    transition: none;
}

/* ---------- 暗色下的印 ----------
 * `--cinnabar` 在暗色翻成 #d0755f 的亮橙红，`--on-cinnabar` 同时翻成近黑：
 * 13px 楷体深字压在亮红上，笔画被红色吃掉，只剩一层发闷的暗块
 * （用户反馈「选中时候的字体颜色黑色不明显」）。
 * 所以暗色的印换深一档的 `--cinnabar-ink` 做面、`--ink` 做字（暗色下它就是纸白
 * ——不能用 `--paper`，那个在暗色是 #1c1912 的深纸）。读法回到「朱底浅字」，
 * 对比 4.6:1。切换主题时印只是变深、字只是变浅，不会整块翻面。
 */
:global(html.dark .vs-track) {
    --vs-seal: var(--cinnabar-ink);
    --vs-seal-fg: var(--ink);
}

/* ---------- 格 ---------- */
.vs-cell {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(7px * var(--fs-scale));
    border: 0;
    /* 格与外框同圆角：悬停那层淡纸是一条「槽内的段」。 */
    border-radius: var(--vs-radius);
    background: none;
    color: var(--ink-2);
    font-family: inherit;
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
/* 选中那格的字要压在朱印上：用 `--vs-seal-fg`，它与印面在暗色下成对换（见上）。 */
.vs-cell[aria-selected='true'],
.vs-cell[aria-selected='true']:hover {
    color: var(--vs-seal-fg);
    background: none;
}
.vs-cell :deep(.app-icon) {
    width: var(--vs-ico);
    height: var(--vs-ico);
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
/* 印面里的字略小一档、字距略松：红底浅字比墨字显大，同字号会显得塞满。
 * 但**不再缩字号**：14px 楷体压朱红时笔画已经细到发虚，再减 1px 就只剩一层影子
 * （用户反馈「选中时字体颜色黑色不明显」——不是颜色不够深，是笔画撑不起对比）。
 * 加 0.25px 描边而不加 `font-weight`：文楷本地只有 Regular，合成加粗会把撇捺糊成块。 */
.vs-cell[aria-selected='true'] .vs-label {
    letter-spacing: 0.16em;
    -webkit-text-stroke: 0.25px currentColor;
}
</style>
