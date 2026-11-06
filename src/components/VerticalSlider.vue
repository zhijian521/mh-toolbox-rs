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
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

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
 * 捕获指针是为了手指滑出轨道后仍然跟手；`dragging` 期间关掉 transition 才有跟手感。
 *
 * 选值时机分两种，这是「点一下有没有滑动」的关键：
 *   - **纯点击**在 `pointerup` 才选。早先在 `pointerdown` 就选，而那时 `dragging` 已经置位、
 *     过渡被关掉，于是朱印是「闪」过去的——点得越准越像没有动画；
 *   - **拖动**过了 `DRAG_THRESHOLD` 才认作拖动：此后的选值跟随指针，过渡仍然关掉。
 * 阈值存在的意义是把「手抖 1px 的点击」留在点击那条路上，不然每次点都会先滑再断。
 */
const DRAG_THRESHOLD = 4;

let pressed = false;
let moved = false;
let pressY = 0;

function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pressed = true;
    moved = false;
    pressY = event.clientY;
    track.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
    if (!pressed) return;
    if (!moved) {
        if (Math.abs(event.clientY - pressY) < DRAG_THRESHOLD) return;
        moved = true;
        dragging.value = true;
    }
    pick(indexAt(event.clientY));
}

function onPointerUp(event: PointerEvent) {
    if (!pressed) return;
    pressed = false;
    /* 没越过阈值 = 点击：此刻才选值，过渡还开着，朱印从原位滑过去。 */
    if (!moved) pick(indexAt(event.clientY));
    moved = false;
    dragging.value = false;
    const el = track.value;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
}

/* 取消（系统手势、指针丢失）不选值：那一下不是用户在点。 */
function onPointerCancel(event: PointerEvent) {
    pressed = false;
    moved = false;
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
        @pointercancel="onPointerCancel"
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
    /* 侧栏规格。父级要换尺寸就覆写这几个变量，组件不认「侧栏」这个概念。
     *
     * **格高不再是一个硬写的 62，而是「内容 + 上下内边距 × 2」算出来的**
     * （2026-11-06 用户：「优化下菜单里面的选中和未选中按钮的上下内边距，现在有点小，
     * 并且随着系统字号切换，上下内边距也会切换」）。拆开之后那两件事各有各的旋钮：
     * 想再松一点只改 `--vs-pad`，格高自己跟，不必回头调第二处。
     *
     * 内容 51 = 图标 15 + 间距 3 + 两字 33（14 × 1.1 行高 × 2 + 字距 0.12em ≈ 1.7）。
     * 内边距 **12**（用户看过 9 之后又要求「默认和较大时候再大一点」）：
     * 格高因此是 1 档 **75**、1.1 档 **82.5**、0.92 档 69（最初是 62 一档到底）。
     *
     * **这一笔有代价，记在 `lib.rs`**：8 格 × 6.6 在「较大」档多要 53 的高度，
     * 左栏删掉的两枚按钮只还回 73——两头抵完 `MIN_HEIGHT` 从 812 抬到 848，
     * 默认窗口跟着 820 → 860。再往上加必须先看那张表。
     *
     * `--vs-pad` **必须乘 `--fs-scale`**：字与图标一起长，留白若写死 12px，到了 1.1 档
     * 就相对变窄，读起来像「字把格子撑满了」。 */
    --vs-w: calc(34px * var(--fs-scale));
    --vs-ico: calc(15px * var(--fs-scale));
    --vs-label: calc(14px * var(--fs-scale));
    --vs-pad: calc(12px * var(--fs-scale));
    --vs-cell: calc(51px * var(--fs-scale) + var(--vs-pad) * 2);
    --vs-gap: calc(5px * var(--fs-scale));

    position: relative;
    display: grid;
    grid-auto-rows: var(--vs-cell);
    row-gap: var(--vs-gap);
    width: var(--vs-w);
    /* 内衬**只加上下**：2 → 4（2026-11-06 用户：「组件整体的上下内边距稍微加一点」），
     * 左右留在 2。左右一加，内容区就窄 4，朱印跟着窄 4——那正是他上一轮刚说「可以了」
     * 的宽度。上下多出来的 4px 让槽顶与第一格之间不再是 2 的一条缝。 */
    padding: 4px 2px;
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
 * **四边到槽外壁都是 6px**（2026-11-06 用户：「确认一下按钮上下左右的外边距是否一致」）。
 * 算式拆开是两截，横向走内衬 + 格的外边距，纵向走内衬 + 印让出的一条：
 *
 *   横 = 边框 1 + 内衬 2 + 格 `margin: 0 3px` = **6**
 *   纵 = 边框 1 + 内衬 4 + 印上下各让 1      = **6**
 *
 * 早先纵向是「内衬 4 + 让 2」= 7，比横向多 1——单看每条轴都对称，两个轴之间差一格，
 * 放大之后一眼看得出来。改法是**把纵向收到 6**（不动槽宽、不动按钮宽）：印高从
 * `cell - 4` 放到 `cell - 2`，上下各只让 1。
 *
 * **这几个数一律不乘 `--fs-scale`**：边框、内衬、格的外边距本来就是像素，三档字号下
 * 量出来都是同一个 6。乘上系数会变成 5.52 / 6 / 6.6，反倒「换档就不一致」了。
 * 印内上下留白**不归这里管**：它等于 `(印高 − 内容) / 2`，随 `--vs-pad` 走。
 * 格高 75 时印高 73、内容 51，上下各 11——原来是 4.9，图标几乎贴着印边。
 */
.vs-thumb {
    /* 印按进槽里：一抹 2px 的实底边（`.stamp` 的 `--stamp-depth`），
     * 于是它比格面高出一点，而不是「一块红色贴在槽壁上」。 */
    --stamp-depth: 2px;

    position: absolute;
    /* 上内衬 4 + 让出的 1 → 连边框一起是 6，与左右同宽 */
    top: 5px;
    /* 左右内衬 2 + 格让出的 3 → 连边框一起 6；与 `--vs-cell` 的 `margin: 0 3px`
     * 落在同一条线上，印与格同宽 */
    right: 5px;
    left: 5px;
    height: calc(var(--vs-cell) - 2px);
    border-radius: var(--r-2);
    transition:
        transform var(--t-slide) var(--ease-snap),
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

/* ---------- 格 ----------
 *
 * 未选中是一枚**浅纸键**（2026-11-06 用户：「给未选中的菜单项也加个浅色的按钮效果」）。
 * 早先格是透明的，整条槽只有一枚朱印有形，其余七格只是档位；现在每格都有一块比槽底
 * 亮一档的浅纸，读作「槽里嵌着一排键」。
 *
 * **材质直接照 `PressTile` 与 `.board` 的配方抄**（用户：「参考下压印块 / 按钮的 3D 效果
 * 以及卡片背景的渐变效果」）：块面 + 左上一点偏光（radial）+ 135° 斜差 + 四棱不对称
 * + 一道很薄的落地。没有那两层渐变，36×62 的浅块在槽里只读作一块色卡；没有不对称的四棱，
 * 光就不分方向。厚度收到 1–2px：这是 36 宽的格，不是 56 的图标格，按满档画会变成一排邮票。
 *
 * 底色走 `--well-key`（定义在 `base.css` 的 `.well.upright` 里，两处侧栏共用一枚）。
 */
.vs-cell {
    --icon-size: var(--vs-ico);
    /* 两条背光棱。**两档不能共用一个值**：`--rule-2` 在暗色比块面亮，照用会在底边
     * 画出一条发光的线，光向就反了。 */
    --vs-rim-lo: light-dark(color-mix(in srgb, var(--rule-2) 46%, transparent), var(--bevel-lo));
    --vs-rim-base: light-dark(color-mix(in srgb, var(--rule-2) 78%, transparent), var(--bevel-lo));

    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* 上下内边距：就是用户要「大一点、并跟着字号走」的那一笔。格高由 `--vs-cell`
     * 算好（内容 + 这一笔 × 2），所以加上 padding 之后可用高度刚好等于内容，
     * 不会把字压扁；写在这里是为了让「内边距」成为一个能被单独调的数，而不是
     * 「格高减去内容剩下的那点」。水平不加：横向的留白由 `margin: 0 3px` 管，
     * 它要和朱印同宽。 */
    padding: var(--vs-pad) 0;
    /* 图标与两字之间 3（原 7）。这一笔是 2026-11-06 挪给「印内上下边距」的：
     * 先把 7 收到 3、行高 1.15 收到 1.1，印内上下才从 1.2 长到 3。
     * 内边距定到 12 之后格高 75、印高 73 而内容 51，**印内上下各 11**——
     * 这一笔不再需要从图标间距里借，3 就是 3。 */
    gap: calc(3px * var(--fs-scale));
    border: 0;
    /* 格与外框同圆角：格是「槽内的一段」。 */
    border-radius: var(--r-2);
    /* **与朱印同宽**（2026-11-06 用户：「未选中状态按钮也和现在选中的保持一样宽度」）：
     * 朱印左右各让 3，浅纸格就跟着让 3——两者叠在同一列上时轮廓才咬得住，
     * 否则选中那一格比上下两格宽一圈，「同一颗按钮的两种状态」就成了两种控件。
     * 只让水平：上下那两笔交给 `padding`（见上），一个管宽、一个管高，
     * 混在一起就要用两套算法去调同一格。 */
    margin: 0 3px;
    /* 按钮本体的重置在 `base.css`（`button { font: inherit }`），这里不再重复。 */
    background-color: var(--well-key);
    /* 与 `.board` 同一套「被顶起来的一张纸」：左上偏光 + 135° 斜差。
     * 两端都用**半透明**的叠加（纸白 9% / 墨黑 9%），不是不透明的实体色——
     * 只有这样悬停换 `background-color` 时底下的浅纸才透得上来，否则渐变把底色全盖住，
     * 悬停只有四条棱在动。暗色两端各收一档（4% / 4%），理由同 `.board`：
     * 暗底上的 9% 就是「半张纸打了光、半张没打」。 */
    background-image:
        radial-gradient(
            120% 92% at 16% -8%,
            color-mix(in srgb, var(--bevel-hi) 62%, transparent),
            transparent 54%
        ),
        linear-gradient(
            135deg,
            light-dark(
                    color-mix(in srgb, var(--paper-base) 9%, transparent),
                    color-mix(in srgb, var(--ink) 4%, transparent)
                )
                0,
            transparent 48%,
            color-mix(in srgb, var(--ink-base) 9%, transparent) 100%
        );
    /* 四棱不对称 + 一层很薄的落地：上、左受光（1px），下 2px、右 1px 背光，
     * 落地只有 1px 硬影 + 3px 软影——格与格之间只有 5px 缝，影再长就糊到下一格上。 */
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 var(--vs-rim-lo),
        inset 0 -2px 0 var(--vs-rim-base),
        0 1px 0 var(--shadow),
        0 3px 5px -3px var(--shadow-lg);
    color: var(--ink-2);
    cursor: pointer;
    transition:
        color var(--t-mid) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}
/* 悬停把这块浅纸压实一档（不再只是「提一点色」）：既然常态已经有形，悬停就该更实。
 * 四条棱要**整套重写**——只写两条的话，右、下那两条背光棱会被这一条规则清掉，
 * 悬停时块反而变成没有厚度的色块。落地也跟着抬一档，与 `PressTile` 的悬停同一个意思。 */
.vs-cell:hover {
    color: var(--ink);
    background-color: var(--well-key-hover);
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 78%, transparent),
        inset -1px 0 0 var(--vs-rim-lo),
        inset 0 -2px 0 var(--vs-rim-base),
        0 2px 0 var(--shadow),
        0 4px 7px -4px var(--shadow-lg);
}
.vs-cell.muted {
    color: var(--muted);
}
.vs-cell.muted:hover {
    color: var(--ink-2);
}
/* 选中那格：把浅纸**整块撤掉**（背景与两条内线一起），露出下面那枚朱印。
 * 只清 `background` 不够——上沿那条受光线会留在朱印边上，成一道白边。
 *
 * 字色只换 `--on-seal`，**不加粗、不加描边、不加字距**。早先给 `.vs-label` 加过
 * 0.25px `-webkit-text-stroke`，本意是让 14px 楷体压得住朱红，但眼睛读到的就是
 * 「这格加粗了」；而文楷本地只有 Regular，描边与合成加粗都会把撇捺糊成块。
 * 「当前在哪一页」由那枚朱印本身交代——位置、颜色、投影三样都说过，不必让字再喊一遍。 */
.vs-cell[aria-current='page'],
.vs-cell[aria-current='page']:hover {
    color: var(--on-seal);
    background: none;
    box-shadow: none;
}
/* 聚焦环不能用朱红：选中时底就是朱红，红环会消失。负 offset 收进印面里，
 * 免得在 48px 宽的槽上向外撑出一圈——这一处是**唯一**的负值，不是另一种默认。 */
.vs-cell:focus-visible {
    outline: var(--ring-inv);
    outline-offset: -2px;
}

/* ---------- 竖排两字 ----------
 * `upright` 让汉字正着躺下而不是整体旋转 90°。14px 是下限：13px 竖起来
 * 细成一条线，压不住 15px 的图标；字距 0.12em 刚好把两个字断开成一列，
 * 再大就成了两段互不相干的字。
 *
 * 行高 1.15 → 1.1（2026-11-06）：朱印内的上下边距要从 1.2 加到 3，只能从行高与图标间距里
 * 各借一点。1.1 时两字之间仍有 1.4 + 字距 1.7 ≈ 3.1 的空隙，文楷的撇捺不会再咬住。
 */
.vs-label {
    writing-mode: vertical-rl;
    text-orientation: upright;
    font-size: var(--vs-label);
    letter-spacing: 0.12em;
    line-height: 1.1;
}
</style>
