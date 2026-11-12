<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { installHoverTip, useHoverTipState } from '../composables/use-hover-tip';

/**
 * 悬停说明的唯一形态。挂在 `App.vue`，与 `ConfirmHost` / `NotifyHost` 并列。
 *
 * ---- 为什么不按 `title` 逐个改 ----
 * 逻辑全在 `use-hover-tip.ts`（接管、恢复、延迟），这里只管「长什么样」和「贴哪儿」。
 * 这条分工与 `ConfirmHost` / `ConfirmDialog` 一致：宿主不判断，形态不决策。
 *
 * ---- 形态：无框淡影 + 靛底（2026-11-05 从七版样张里选定，当天换成靛）----
 * 一块纸 + 一道影：**没有边、没有内衬、没有箭头**。七个候选里它最轻，
 * 而说明本来就该退到内容之后——「最不吵」比「最像卡片」重要。
 *
 * ---- 底为什么是靛 ----
 * 第一版照「比宿主亮一档」取纸白，结果亮色下与卡面（`--paper-2`）只差半个色阶，
 * 只剩一道很淡的影，读起来像一块没对齐的便利贴（用户：「很不好看」）。
 * 这套语言里，卡片的分层靠线（文武线、`--rule`），浮层的分层只能靠**色相**——
 * 加边框是往纸上叠结构，加内衬是同一种错误的另一种写法。
 * 全站的纸都是暖的，所以冷靛一压上去就自成一层；字取同色相的深一档，不回到墨黑
 * （用户：「不用黑色，换一个有特色的」）。色值与理由见 `tokens.css` 的 `--indigo`。
 *
 * 尺寸比装备浮片小一号（浮片是 240 宽的属性表，这是「一句话」）：`--fs-xs`、行高 1.6、
 * 上限 280 宽。字号跟着 `--fs-scale` 走，与全站同一个缩放。
 *
 * ---- 落在哪：贴光标右下 ----
 * 逻辑层给的是光标点，不是元素矩形。元素从 16px 的图标到一整行文本都有，
 * 贴元素的角会在一处紧挨指针、另一处跑出几十像素（用户：「有的贴着鼠标有的离很远」）。
 *
 * ---- 文本要保留 ----
 * 收起时只切 `on` 类、不清文本：先清文本会让纸片在淡出的 90ms 里塌成一个小方块。
 */
const { tip } = useHoverTipState();

const el = ref<HTMLElement | null>(null);
/** 最后一次的文本。`tip` 变 `null` 时留着它，淡出才有内容。 */
const text = ref('');
const shown = ref(false);
/** 初始放到视口外：常驻 DOM 的第一帧不该在左上角露一下。 */
const pos = ref({ left: -9999, top: -9999 });

const tipStyle = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px` }));

/**
 * 贴光标右下 → 右边装不下镜像到左侧 → 下方装不下翻到上方 → 最后夹回视口。
 *
 * **贴的是光标，不是元素。** 元素从 16px 的图标按钮到一整行文本都有，贴元素的角
 * 会让纸片在一处紧挨指针、在另一处跑出几十像素——用户报的就是这个。光标是唯一的
 * 恒定参照，也不必关心元素怎么排。
 *
 * 偏移（14 / 18）比 6px 大：太小的话指针会压住纸片边缘，看着像没对齐；
 * 镜像时同样留这段距离，纸片不会跳回来盖住箭头位置。
 */
function place(x: number, y: number, box: DOMRect) {
    const dx = 14;
    const dy = 18;
    const edge = 8;

    let left = x + dx;
    if (left + box.width > window.innerWidth - edge) left = x - box.width - dx;
    left = Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - box.width - edge));

    let top = y + dy;
    if (top + box.height > window.innerHeight - edge) top = y - box.height - dy;
    top = Math.min(Math.max(edge, top), Math.max(edge, window.innerHeight - box.height - edge));

    return { left, top };
}

watch(tip, async (view) => {
    if (!view) {
        shown.value = false;
        return;
    }

    /* 先隐藏再换字：内容变长时，旧位置上的新尺寸会在下一帧跳一下。 */
    shown.value = false;
    text.value = view.text;

    await nextTick();
    /* 量之前先确认没被后一条顶掉：`watch` 是异步的，A→B 连发时旧的这次还会继续跑，
     * 不守一下会把新纸片定到旧位置。 */
    if (tip.value !== view) return;
    const box = el.value?.getBoundingClientRect();
    if (!box) return;

    pos.value = place(view.x, view.y, box);
    shown.value = true;
});

let uninstall: (() => void) | null = null;
onMounted(() => {
    uninstall = installHoverTip();
});
onUnmounted(() => {
    uninstall?.();
    uninstall = null;
});
</script>

<template>
    <Teleport to="body">
        <!-- `aria-hidden` 常驻：内容是视觉上的重复（可访问名已在接管时补过），
             读屏再念一遍等于同一句话读两次。
             文本走 `v-text` 而不是插值：模板里的缩进与换行在 `pre-line` 下会被当成正文，
             纸片顶上会多出一行空白。 -->
        <div
            ref="el"
            class="hover-tip"
            :class="{ on: shown }"
            :style="tipStyle"
            aria-hidden="true"
            v-text="text"
        ></div>
    </Teleport>
</template>

<style scoped>
/* ---------- 形态：无框淡影 + 靛底 ----------
 * 没有边、没有内衬、没有箭头，只有一块冷靛的纸 + 两道影。
 * 底与字都走令牌（`--tooltip-bg` / `--tooltip-ink`，`light-dark()` 一处管两套主题），
 * 这里不写任何色值——色相的取舍在 `tokens.css` 里说。
 */
.hover-tip {
    position: fixed;
    z-index: 100; /* 高于提示 90、弹窗 80：弹窗里的按钮也带 title */
    /* `max-content` 让短句保持一行；上限 280 兜住长句（物品名 + 单价那种）。 */
    width: max-content;
    max-width: 280px;
    padding: 5px 9px 6px;
    border-radius: var(--r-3);
    background: var(--tooltip-bg);
    /* 两道：贴边 4px 的一圈轻影 + 远而软的一层。明度差已经不是主要判据（色相差在撑），
     * 影只负责「离开桌面一点点」这件事，别做重。 */
    box-shadow: var(--tooltip-shadow);
    color: var(--tooltip-ink);
    font-size: var(--fs-xs);
    line-height: 1.6;
    letter-spacing: 0.02em;
    /* title 里偶有换行（多行说明），`pre-line` 保住它，同时不丢自动折行。 */
    white-space: pre-line;
    overflow-wrap: anywhere;
    /* 纸片不吃指针：它贴在光标要去的地方，可点就会跟下面的按钮抢命中。 */
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-3px);
    transition:
        opacity var(--t-tip) var(--ease-soft),
        transform var(--t-tip) var(--ease-soft),
        visibility 0s linear var(--t-tip);
}
.hover-tip.on {
    opacity: 1;
    visibility: visible;
    transform: none;
    transition-delay: 0s;
}
</style>
