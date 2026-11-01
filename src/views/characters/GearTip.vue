<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { GearDetail } from './mock';

/**
 * 装备详情浮片：鼠标停在格子上时浮出来的一张纸。
 *
 * **必须 `Teleport` 到 body**：浮片是 `position: fixed`，但若挂在格子内部，
 * `.char-body` 的 `overflow: auto` 会把它裁掉下半截（fixed 之所以能逃出滚动容器，
 * 前提是祖先没有 transform / filter / contain 之类的包含块）。
 *
 * 位置由这里算，不由调用方算：调用方只知道「锚点是哪个格子」，
 * 而「右侧放不下要翻到左边、下沿出屏要往上顶」需要浮片自己的尺寸——
 * 那个尺寸只有渲染之后才知道，所以只能在 `detail` 变化后的 `nextTick` 里量。
 *
 * 常驻 DOM、只切 `on` 类（不用 `v-if`）：一旦卸载，尺寸就量不到，
 * 每次都要「先显示再量再定位」，第一帧会闪一下原位。
 */
const props = defineProps<{
    /** 锚点：触发浮片的那个格子。`null` 表示没有指向任何格子。 */
    anchor: DOMRect | null;
    detail: GearDetail | null;
}>();

const el = ref<HTMLElement | null>(null);
const pos = ref({ left: 0, top: 0 });

/* 离视口边缘留 8px，免得浮片贴死在边上。 */
const EDGE = 8;

function place() {
    const box = el.value?.getBoundingClientRect();
    const anchor = props.anchor;
    if (!box || !anchor || box.width === 0) return;

    /* 优先贴格子右侧；右边装不下就翻到左侧；两边都装不下就贴边（宁可压住格子也要读得全）。 */
    let left = anchor.right + EDGE;
    if (left + box.width > window.innerWidth - EDGE) {
        left = anchor.left - box.width - EDGE;
    }
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - box.width - EDGE));

    /* 纵向与格子顶边齐平，超出视口再夹回来。 */
    const top = Math.min(
        Math.max(EDGE, anchor.top - 2),
        Math.max(EDGE, window.innerHeight - box.height - EDGE),
    );

    pos.value = { left, top };
}

watch(
    () => props.detail,
    async (detail) => {
        if (!detail) return;
        /* 内容换了才知道新高度，所以每次都要等 DOM 更新后再量。 */
        await nextTick();
        place();
    },
);
</script>

<template>
    <Teleport to="body">
        <div
            ref="el"
            class="gear-tip"
            :class="{ on: detail !== null }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
            role="tooltip"
            :aria-hidden="detail === null"
        >
            <template v-if="detail">
                <div class="tip-top">
                    <span class="tip-name">{{ detail.name }}</span>
                    <span class="tip-lv num">{{ detail.lv }}</span>
                </div>
                <div class="tip-kind">{{ detail.kind }}</div>
                <div class="rule"></div>
                <dl>
                    <div v-for="[label, value] in detail.base" :key="`b-${label}`">
                        <dt>{{ label }}</dt>
                        <dd>{{ value }}</dd>
                    </div>
                    <div v-for="[label, value] in detail.gain" :key="`g-${label}`" class="gain">
                        <dt>{{ label }}</dt>
                        <dd>{{ value }}</dd>
                    </div>
                </dl>
                <template v-if="detail.lines.length">
                    <div class="rule"></div>
                    <div
                        v-for="[label, value, tone] in detail.lines"
                        :key="`l-${label}`"
                        class="line"
                    >
                        <span class="k">{{ label }}</span>
                        <span class="v" :class="tone">{{ value }}</span>
                    </div>
                </template>
                <div class="tip-foot">{{ detail.foot }}</div>
            </template>
        </div>
    </Teleport>
</template>

<style scoped>
.gear-tip {
    position: fixed;
    z-index: 60;
    width: 216px;
    padding: 10px 12px 11px;
    border: var(--w-hair) solid var(--rule-2);
    background: var(--paper);
    box-shadow:
        0 1px 2px var(--shadow),
        0 16px 32px -16px var(--shadow-lg);
    /* 藏起来时不能留 tab 停靠点，也不能被读屏念到（`aria-hidden` 兜住内容）。 */
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-3px);
    transition:
        opacity 90ms var(--ease-soft),
        transform 90ms var(--ease-soft),
        visibility 0s linear 90ms;
}
/* 文武线内衬，与卡片同一套。 */
.gear-tip::before {
    content: '';
    position: absolute;
    inset: 2px;
    border: var(--w-hair) solid var(--rule);
    pointer-events: none;
}
.gear-tip.on {
    visibility: visible;
    opacity: 1;
    transform: none;
    transition-delay: 0s;
}
/* 暗色下投影是黑压黑，等于没有浮起；靠把纸面提亮一阶表达「在上面一层」。
 * 只提一阶不够——格子本身也是 paper-2，浮片会和身后的格子糊成一片。 */
:root.dark .gear-tip {
    background: color-mix(in srgb, var(--paper-2) 86%, #f8f3e6 14%);
}

.tip-top {
    display: flex;
    align-items: baseline;
    gap: 7px;
}
.tip-name {
    color: var(--ink);
    font-size: var(--fs-md);
    letter-spacing: 0.03em;
}
.tip-lv {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}
.tip-kind {
    margin-top: 2px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
.rule {
    height: var(--w-hair);
    margin: 6px 0 5px;
    background: var(--rule-2);
    opacity: 0.7;
}
dl {
    display: grid;
}
dl > div {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 0;
    font-size: var(--fs-sm);
}
dt {
    flex: none;
    min-width: 54px;
    color: var(--ink-2);
}
dd {
    margin: 0;
    color: var(--ink);
}
/* 打造附加的绿字是这件装备「比同款多什么」的地方，压一档色才读得出层次。 */
.gain dd {
    color: var(--moss);
}
.line {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 1px 0;
    font-size: var(--fs-sm);
}
.line .k {
    flex: none;
    min-width: 30px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
.line .v {
    color: var(--ink-2);
}
.line .v.seal {
    color: var(--cinnabar);
}
.line .v.ochre {
    color: var(--ochre);
}
.tip-foot {
    margin-top: 6px;
    padding-top: 5px;
    border-top: var(--w-hair) dotted var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
}
</style>
