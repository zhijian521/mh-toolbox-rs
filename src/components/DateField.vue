<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import type { CSSProperties } from 'vue';
import AppIcon from './AppIcon.vue';
import { useToday } from '../composables/use-today';
import { dateText, parseDay } from '../services/format';

/**
 * 日期选择：一条**槽** + 一张**纸片上的月历**。
 *
 * ---- 为什么不用 `<input type="date">` ----
 *
 * 与 `SelectField` 不用原生 `<select>` 同一条理由：原生日期控件在 Windows / WebView2 上
 * 是系统画的一套（自带边框、自带月历弹层、字号不跟主题），放进这张纸里就是一块贴错的
 * 金属片。物价页的 `PricePointDialog` 因此把日期做成「文本格 + 正则校验」——那里一天只
 * 记一笔价，手敲够用；而收益历史是**选一天翻一天**，手敲一个不存在的日期会得到一句
 * 「这一天没有记录」，与「真的没有记录」分不开。所以这里需要一个能看见月份的控件。
 *
 * ---- 材质分工 ----
 *
 * - **触发条**用全局 `.field`：与旁边的输入格、下拉是同一条凹槽（同高、同顶影）。
 * - **纸片**是 `--paper` 浮层 + 1px 账线 + `--shadow-lift`，与 `SelectField` 的列表
 *   同一种「纸抬起来」的影子；暗色下同一条规矩把纸面提一档（黑压黑时投影等于没有）。
 * - **选中日**灌朱（`--seal` / `--on-seal`），**今天**只是格子底下一枚朱点——两者必须
 *   分得开：「今天」是客观日期，「你选的是哪天」是这一屏的状态。选中的恰好是今天时，
 *   朱面已经说明了它，朱点就不再画（一枚点压在朱面上是脏的）。
 *
 * ---- 纸片为什么落在 body 上，而不是长在触发条下面 ----
 *
 * 弹窗正文 `.modal-body` 是 `overflow-y: auto`（内容长的窗要能滚），它同时是一道**裁剪
 * 边界**：纸片绝对定位在触发条下方，超出正文高度的部分被齐刀切掉。实测历史收益窗只有
 * 两条流水时正文约 260 高、月历约 300 高，下面三行连同「回到今天」整块消失
 * （2026-11-05 用户：「日期选择被切割了，没展示完全」）。
 *
 * 靠要求宿主窗传 `scroll: false` 解决是错的——历史窗的内容确实会长（一天几十笔）。
 * 控件自己离开裁剪上下文才对，顺带任何弹窗、任何滚动卡片里放它都不会再被切。
 *
 * 代价：位置要自己算（`fixed` + 视口坐标，见 `placePanel`），层级要重排（纸片与遮罩
 * 成了 body 下的兄弟，z-index 必须高过遮罩的 80；取 85，仍低于提示层 90——提示说的
 * 「刚刚那下成了没有」比一张没选完的月历更急），并且要跟着滚动重新落位（`fixed`
 * 元素不会自己跟着滚动容器走）。
 *
 * ---- 键盘 ----
 *
 * 31 个日期格若各占一个 Tab 停靠点，穿过去要按 31 次。所以整张月历**只有一个停靠点**
 * （`cursor` 指向的那一天，`tabindex` 0，其余 -1），方向键换日、`PageUp/PageDown` 换月、
 * `Home` 回今天、`Enter` 落定。`Esc` 关纸片并 `stopPropagation`——这张控件常长在弹窗里，
 * 弹窗自己也听 `Esc`，不拦的话「关月历」会连弹窗一起关（`SelectField` 同一个坑）。
 *
 * ---- 值 ----
 *
 * `v-model` 是 `YYYY-MM-DD` 字符串，与账本里 `IncomeEntry.date` 同一口径（本地时区，
 * 由 `services/format.ts` 的 `todayText()` 产出）。内部一律按**年月日三段**构造 `Date`，
 * 不走 `new Date('2026-11-05')`——那种写法按 UTC 解析，东八区会整体退一天。
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        /** 读屏念的字段名。 */
        label: string;
        /** 可选范围（`YYYY-MM-DD`），留空即不限。 */
        min?: string;
        max?: string;
    }>(),
    { min: '', max: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);

const today = useToday();

/* 当前翻到的月份。打开时跟到已选那天，关着的时候谁也不会看见它。 */
const view = ref(monthOf(props.modelValue || today.value));

/* 键盘落点（`YYYY-MM-DD`）。与「已选的值」是两件事：方向键只是移动焦点，
 * 回车才落定——混成一个变量，路过某天就把值改掉了（`SelectField` 的 `cursor` 同理）。 */
const cursor = ref(props.modelValue || today.value);

const panelId = `date-${useId()}`;

/** `YYYY-MM-DD` → 那年那月（0 起）。字符串解析不用 `new Date(str)`，见文件头。 */
function monthOf(value: string): { year: number; month: number } {
    const [year, month] = value.split('-').map(Number);
    return { year: year || new Date().getFullYear(), month: (month || 1) - 1 };
}

/** 触发条上那串字：`2026年11月5日`。年月日在同一行，比 `2026-11-05` 好读。 */
const triggerText = computed(() => {
    const one = parseDay(props.modelValue || today.value);
    return `${one.getFullYear()}年${one.getMonth() + 1}月${one.getDate()}日`;
});

const headText = computed(() => `${view.value.year} 年 ${view.value.month + 1} 月`);

/**
 * 这个月铺进格子里的 42 格（6 行 × 7 列，周一开头）。
 *
 * 月首之前、月末之后**留空格**而不是把上/下月的日子淡淡地排进来：那种画法让「点一下
 * 跳到那个月」与「点一下选那天」变成同一个动作，而这控件没有第二个确认步骤。
 * 留白在这套语言里也不突兀——一整屏票面行之间本来就是空的。
 */
interface Cell {
    key: string;
    text: string;
    value: string;
    out: boolean;
}

const cells = computed<Cell[]>(() => {
    const { year, month } = view.value;
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const list: Cell[] = [];
    for (let i = 0; i < 42; i += 1) {
        const day = i - lead + 1;
        if (day < 1 || day > total) {
            list.push({ key: `out-${i}`, text: '', value: '', out: true });
            continue;
        }
        const value = dateText(new Date(year, month, day));
        list.push({ key: value, text: `${day}`, value, out: false });
    }
    return list;
});

function disabled(value: string): boolean {
    if (props.min && value < props.min) return true;
    if (props.max && value > props.max) return true;
    return false;
}

/* 纸片与触发条之间的缝、以及它与视口边缘的最小距离。
 * 4 与 `SelectField` 同值：贴死时触发条的下暗棱与纸片的上亮棱相撞，两层纸读成一块。 */
const GAP = 4;
const EDGE = 8;

/* 纸片的落位（内联 style）。
 *
 * 初值是 `visibility: hidden`：`fixed` 元素在拿到坐标前会先画在视口左上角，
 * 而定位要等渲染完才量得出尺寸——不藏这一帧，每次打开都会在左上角闪一下。 */
const panelStyle = ref<CSSProperties>({ visibility: 'hidden' });

/**
 * 按触发条的**视口坐标**给纸片落位。
 *
 * 横向：默认左对齐到触发条；右端出界就整体往左收（收不住再贴左）。
 * 纵向：默认向下长；下方放不下时，上方够就翻上去，两边都不够才把顶边夹进视口
 * ——那种情况只在窗口比月历还矮时发生，宁可让它盖住触发条，也不能让它跑出屏幕。
 *
 * 量的是 `offsetWidth / offsetHeight` 而不是 `getBoundingClientRect()` 的宽高：
 * 后者会被祖先的缩放一并算进去，而这里要的是「这张纸自身多大」。
 */
function placePanel() {
    const triggerEl = trigger.value;
    const panelEl = panel.value;
    if (!triggerEl || !panelEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const width = panelEl.offsetWidth;
    const height = panelEl.offsetHeight;
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;

    let left = rect.left;
    if (left + width > viewW - EDGE) left = viewW - EDGE - width;
    if (left < EDGE) left = EDGE;

    let top = rect.bottom + GAP;
    if (top + height > viewH - EDGE) {
        const up = rect.top - GAP - height;
        top = up >= EDGE ? up : Math.max(EDGE, viewH - EDGE - height);
    }

    panelStyle.value = {
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        visibility: 'visible',
    };
}

/* 滚动 / 改窗口大小时重新落位。
 *
 * 必须重新量而不是「关掉」：`fixed` 元素不会跟着滚动容器走，不动它就悬在原地指着一块
 * 空白；而它在弹窗里最常见的场景正是「正文滚一下看看下面的流水」。用 rAF 节流，
 * 滚动事件一次能来几十个。
 *
 * 监听挂**捕获阶段**：滚动的是弹窗正文 `.modal-body`，它的 `scroll` 不冒泡到 window。 */
let raf = 0;

function onViewportChange() {
    if (!open.value || raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (open.value) placePanel();
    });
}

/* 打开时把落点摆到已选那天（没有就今天），并把那一天的格子聚焦——否则键盘用户打开
 * 之后要按十几次方向键才能走到想选的日子。 */
function openPanel() {
    if (open.value) return;
    const seed = props.modelValue || today.value;
    cursor.value = seed;
    view.value = monthOf(seed);
    /* 先藏住再量：`v-if` 重建了纸片，沿用上一次的 left/top 会先画在旧位置一帧。 */
    panelStyle.value = { visibility: 'hidden' };
    open.value = true;
    void nextTick(() => {
        placePanel();
        focusCursor();
    });
}

function closePanel(focusTrigger = false) {
    if (!open.value) return;
    open.value = false;
    if (focusTrigger) trigger.value?.focus();
}

function toggle() {
    if (open.value) closePanel(true);
    else openPanel();
}

function focusCursor() {
    const el = panel.value?.querySelector<HTMLElement>('.day[tabindex="0"]');
    el?.focus();
}

/**
 * 翻一页月。
 *
 * **落点跟着翻**：新月份的格子里没有原来那一天，若不挪 `cursor`，`tabindex="0"` 就落在
 * 一个不存在的元素上——键盘用户按 `PageDown` 之后焦点会掉到 `body`，整张月历从 Tab 顺序里
 * 消失。翻月时把落点挪到「同一天，超出月末就取月末」。
 *
 * `focus` 只在键盘翻页时为真：鼠标点 ‹ › 不该把焦点从按钮上拽走。
 */
function shiftMonth(step: number, focus = false) {
    const { year, month } = view.value;
    const moved = new Date(year, month + step, 1);
    view.value = { year: moved.getFullYear(), month: moved.getMonth() };

    const base = parseDay(cursor.value || props.modelValue || today.value);
    const last = new Date(view.value.year, view.value.month + 1, 0).getDate();
    cursor.value = dateText(
        new Date(view.value.year, view.value.month, Math.min(base.getDate(), last)),
    );
    if (focus) void nextTick(() => focusCursor());
}

/** 把落点挪若干天，跨月时连视图一起翻过去——只改落点不翻月，焦点会落在看不见的格子上。
 *
 * 用 `setDate(d + step)` 而不是「毫秒加减 86400000」：后者在有夏令时的时区会把某一天
 * 挪成 23 或 25 小时，落点算出来差一天。东八区没有夏令时，但这条口径换台机器也该成立。 */
function moveCursor(step: number) {
    const base = parseDay(cursor.value || props.modelValue || today.value);
    const next = dateText(new Date(base.getFullYear(), base.getMonth(), base.getDate() + step));
    cursor.value = next;
    const { year, month } = monthOf(next);
    if (year !== view.value.year || month !== view.value.month) view.value = { year, month };
    void nextTick(() => focusCursor());
}

function choose(value: string) {
    if (!value || disabled(value)) return;
    emit('update:modelValue', value);
    closePanel(true);
}

function jumpToday() {
    const value = today.value;
    cursor.value = value;
    view.value = monthOf(value);
    choose(value);
}

function onDayKeydown(event: KeyboardEvent) {
    switch (event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            moveCursor(-1);
            break;
        case 'ArrowRight':
            event.preventDefault();
            moveCursor(1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            moveCursor(-7);
            break;
        case 'ArrowDown':
            event.preventDefault();
            moveCursor(7);
            break;
        case 'PageUp':
            event.preventDefault();
            shiftMonth(-1, true);
            break;
        case 'PageDown':
            event.preventDefault();
            shiftMonth(1, true);
            break;
        case 'Home':
            event.preventDefault();
            cursor.value = today.value;
            view.value = monthOf(today.value);
            void nextTick(() => focusCursor());
            break;
        case 'Enter':
        case ' ':
            event.preventDefault();
            choose(cursor.value);
            break;
        case 'Escape':
            event.preventDefault();
            /* 吞掉：弹窗在 document 上听 Esc 关整张纸，见文件头。 */
            event.stopPropagation();
            closePanel(true);
            break;
        case 'Tab':
            /* 收纸片、焦点还给触发条，并**拦掉这次 Tab**。
             *
             * 不拦不行：纸片现在挂在 body 上（不在弹窗面板里），弹窗的焦点陷阱一查
             * `panel.contains(active)` 为假，就把焦点拽回窗里第一个控件——用户从月历
             * 离开会突然跳到标题旁那枚按钮上。拦掉之后落点是触发条，下一次 Tab
             * 从它那里正常往下走。 */
            event.preventDefault();
            closePanel(true);
            break;
        default:
            break;
    }
}

function onTriggerKeydown(event: KeyboardEvent) {
    if (open.value) return;
    if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openPanel();
    }
}

/* 点空白处收起。用 `pointerdown` 而不是 `click`：点在别的控件上时焦点会先移走，
 * 等 `click` 到来说明纸片已经盖在那枚控件上了。
 *
 * 纸片现在 `Teleport` 到 body，**不在 `root` 里**——只判 `root` 的话，点在日期格上的
 * 那一刻就会先把自己收起来，日历永远点不中。 */
function onPointerDown(event: PointerEvent) {
    if (!open.value) return;
    const target = event.target as Node;
    if (root.value?.contains(target) || panel.value?.contains(target)) return;
    closePanel();
}

onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    cancelAnimationFrame(raf);
});
</script>

<template>
    <div ref="root" class="date-field">
        <button
            ref="trigger"
            type="button"
            class="field date-trigger"
            aria-haspopup="dialog"
            :aria-expanded="open"
            :aria-controls="panelId"
            :aria-label="`${label}：${triggerText}`"
            @click="toggle"
            @keydown="onTriggerKeydown"
        >
            <span class="date-text">{{ triggerText }}</span>
            <AppIcon name="chevron-down" class="date-arrow" :class="{ on: open }" />
        </button>

        <!-- 纸片挂在 body 上，不继承任何祖先的 `overflow`——见文件头「为什么落在 body 上」。
             位置由 `placePanel()` 按触发条的视口坐标给。 -->
        <Teleport to="body">
            <div
                v-if="open"
                :id="panelId"
                ref="panel"
                class="date-panel"
                role="dialog"
                :aria-label="label"
                :style="panelStyle"
                @keydown="onDayKeydown"
            >
                <div class="date-head">
                    <!-- ‹ › 用同一个 `chevron-right` 组件翻个身：图标库只有右折，
                         为两个方向各加一枚字形不值得，而旋转出来的形状与它一模一样。 -->
                    <button
                        type="button"
                        class="nav prev"
                        aria-label="上一个月"
                        @click="shiftMonth(-1)"
                    >
                        <AppIcon name="chevron-right" />
                    </button>
                    <span class="head-text">{{ headText }}</span>
                    <button
                        type="button"
                        class="nav next"
                        aria-label="下一个月"
                        @click="shiftMonth(1)"
                    >
                        <AppIcon name="chevron-right" />
                    </button>
                </div>

                <div class="date-week">
                    <span v-for="one in WEEK" :key="one">{{ one }}</span>
                </div>

                <div class="date-grid">
                    <template v-for="cell in cells" :key="cell.key">
                        <span v-if="cell.out" class="blank-cell"></span>
                        <button
                            v-else
                            type="button"
                            class="day"
                            :class="{
                                on: cell.value === modelValue,
                                now: cell.value === today,
                                off: disabled(cell.value),
                            }"
                            :tabindex="cell.value === cursor ? 0 : -1"
                            :disabled="disabled(cell.value)"
                            :aria-pressed="cell.value === modelValue"
                            :aria-label="`${view.year}年${view.month + 1}月${cell.text}日`"
                            @click="choose(cell.value)"
                            @focus="cursor = cell.value"
                        >
                            {{ cell.text }}
                        </button>
                    </template>
                </div>

                <div class="date-foot">
                    <button type="button" class="jump" @click="jumpToday">回到今天</button>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.date-field {
    position: relative;
    display: flex;
    min-width: 0;
}

/* 外观整份来自 `.field`（凹槽），这里只排布：字在左、箭头在右。 */
.date-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    --icon-size: calc(13px * var(--fs-scale));
}
.date-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.date-arrow {
    flex: none;
    color: var(--ink-2);
    transition: transform var(--t-shape) var(--ease-soft);
}
.date-arrow.on {
    transform: rotate(180deg);
}

/* 纸片：与下拉、装备浮片同一枚影子、同一条账线；那道缝同理——贴死时触发条的
 * 下暗棱与纸片的上亮棱相撞，两层纸读成一块。
 *
 * `position: fixed` + 内联的 left/top：它挂在 body 上，坐标是**视口坐标**，
 * 由脚本的 `placePanel()` 给（见文件头「为什么落在 body 上」）。
 * `z-index: 85`：它现在与弹窗遮罩（80）是 body 下的兄弟，不高过遮罩就整块看不见；
 * 但仍低于提示层（90）——提示说的是「刚刚那下成了没有」，比一张没选完的月历更急。 */
.date-panel {
    position: fixed;
    z-index: 85;
    /* 7 × 30 + 6 × 2 + 两端内衬 2 × 6 = 234。定宽而不是按内容撑：换月时格子数不变，
     * 宽度跟着内容跳会让下面的表格跟着抽一下。 */
    width: calc(234px * var(--fs-scale));
    padding: 6px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--paper);
    box-shadow: var(--shadow-lift);
}
:global(html.dark .date-panel) {
    background: color-mix(in srgb, var(--paper-2) 86%, var(--paper-base) 14%);
}

.date-head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
}
.head-text {
    flex: 1;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    text-align: center;
    font-variant-numeric: tabular-nums;
}
.nav {
    display: grid;
    place-items: center;
    width: calc(24px * var(--fs-scale));
    height: calc(24px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--ink-2);
    cursor: pointer;
    --icon-size: calc(13px * var(--fs-scale));
    transition: background-color var(--t-quick) var(--ease-soft);
}
.nav:hover {
    background: color-mix(in srgb, var(--seal) 9%, transparent);
    color: var(--ink);
}
.nav.prev :deep(svg) {
    transform: rotate(180deg);
}
.nav:focus-visible,
.day:focus-visible,
.jump:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

.date-week,
.date-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}
.date-week span {
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.6;
    text-align: center;
}

.day {
    position: relative;
    height: calc(30px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--ink-2);
    font-family: inherit;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color var(--t-quick) var(--ease-soft);
}
.day:hover {
    background: color-mix(in srgb, var(--seal) 9%, transparent);
    color: var(--ink);
}
/* 今天：格子底下一枚朱点。选中日已经灌朱，朱点压在朱面上是脏的，所以两者同时成立时
 * 只画朱面（下面的 `.day.on::after` 收掉）。 */
.day.now::after {
    content: '';
    position: absolute;
    bottom: calc(3px * var(--fs-scale));
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: var(--cinnabar);
}
/* 选中日灌朱：`--seal` 那一族是「这块地方是朱的」的唯一配方，不用 `--cinnabar` 灌底。 */
.day.on {
    background: var(--seal);
    color: var(--on-seal);
}
.day.on:hover {
    background: var(--seal);
    color: var(--on-seal);
}
.day.on::after {
    display: none;
}
.day.off {
    color: var(--muted);
    cursor: default;
}
.day.off:hover {
    background: none;
}

.date-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
    border-top: var(--w-hair) solid var(--rule);
    padding-top: 4px;
}
.jump {
    padding: 2px 6px;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: var(--fs-mini);
    cursor: pointer;
}
.jump:hover {
    color: var(--cinnabar);
}
</style>
