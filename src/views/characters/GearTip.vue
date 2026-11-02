<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAnchoredTip } from '../../composables/use-anchored-tip';
import type { GearDetail } from './character';

/**
 * 装备详情浮片：鼠标停在格子上时浮出来的一张纸。
 *
 * **必须 `Teleport` 到 body**：浮片是 `position: fixed`，但若挂在格子内部，
 * `.char-body` 的 `overflow: auto` 会把它裁掉下半截（fixed 之所以能逃出滚动容器，
 * 前提是祖先没有 transform / filter / contain 之类的包含块）。
 *
 * 落位由 `useAnchoredTip` 算（与召唤兽浮片共用同一套翻边规则），这里只负责
 * 「内容变了就重新量一次」。
 *
 * 常驻 DOM、只切 `on` 类（不用 `v-if`）：一旦卸载，尺寸就量不到，
 * 每次都要「先显示再量再定位」，第一帧会闪一下原位。
 *
 * 分段从原来的四段改成六段，是对着四张真实悬浮图数出来的：一件装备至少有
 * 「风味 / 类型+条件 / 白字 / 状态 / 特殊 / 制造者」六层。原先只留白字与绿字两段，
 * 「耐久 191 · 修理失败 1 次」这种必须显示的状态没地方放。
 */
const props = defineProps<{
    /** 锚点：触发浮片的那个格子。`null` 表示没有指向任何格子。 */
    anchor: DOMRect | null;
    detail: GearDetail | null;
}>();

const { el, pos, place } = useAnchoredTip();

watch(
    () => props.detail,
    (detail) => {
        if (!detail) return;
        /* 内容换了才知道新高度，`place()` 内部会先等 DOM 更新。 */
        void place(props.anchor);
    },
);

/* 条件合并成一行小字：`等级 130 · 五行 木 · 女`。
 * 游戏里它们分三行，那是为了塞进固定宽的框；浮片没这个限制，一行读完更省高度。 */
const requires = computed(() => props.detail?.requires?.join(' · ') ?? '');
</script>

<template>
    <Teleport to="body">
        <div
            ref="el"
            class="gear-tip dual-rule"
            :class="{ on: detail !== null }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
            role="tooltip"
            :aria-hidden="detail === null"
        >
            <template v-if="detail">
                <div class="tip-name">{{ detail.name }}</div>
                <div class="meta tip-kind">
                    {{ detail.kind }}<template v-if="requires"> · {{ requires }}</template>
                </div>
                <!-- 风味文本压到两行：它是「这件东西有来历」，不是要背下来的属性。
                     排在属性之前是为了先给个由头，但绝不能让它把属性挤出屏幕。 -->
                <p v-if="detail.flavor" class="flavor">{{ detail.flavor }}</p>

                <div class="rule"></div>
                <dl>
                    <div
                        v-for="stat in detail.stats"
                        :key="`${stat.label}-${stat.value}`"
                        :class="{ gain: stat.gain }"
                    >
                        <dt>{{ stat.label }}</dt>
                        <dd>
                            {{ stat.value
                            }}<span v-if="stat.extra" class="extra">[{{ stat.extra }}]</span>
                        </dd>
                    </div>
                </dl>

                <div v-if="detail.cond?.length" class="cond">
                    <span v-for="(item, i) in detail.cond" :key="item.label">
                        <em v-if="i > 0">·</em>{{ item.label }} {{ item.value }}
                    </span>
                </div>

                <template v-if="detail.lines?.length">
                    <div class="rule"></div>
                    <div v-for="line in detail.lines" :key="line.label" class="line">
                        <span class="k">{{ line.label }}</span>
                        <span class="v" :class="line.tone">{{ line.value }}</span>
                    </div>
                </template>

                <div v-if="detail.foot" class="meta tip-foot">{{ detail.foot }}</div>
            </template>
        </div>
    </Teleport>
</template>

<style scoped>
.gear-tip {
    position: fixed;
    z-index: 60;
    /* 240 而不是 216：真实属性名有「抗封印命中等级」这种七字标签，
     * 216 宽时值与标签会挤成两行，读起来像两条属性。 */
    width: 240px;
    padding: var(--block-pad-tight);
    border: var(--w-hair) solid var(--rule-2);
    background: var(--paper);
    /* 与整张卡片、测试面板同一枚「纸片抬起」的影子。 */
    box-shadow: var(--shadow-lift);
    /* 藏起来时不能留 tab 停靠点，也不能被读屏念到（`aria-hidden` 兜住内容）。 */
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-3px);
    transition:
        opacity var(--t-tip) var(--ease-soft),
        transform var(--t-tip) var(--ease-soft),
        visibility 0s linear var(--t-tip);
    /* 文武线内衬走全局 `.dual-rule`（`base.css`），这里只把它收紧一档：
     * 浮片内边距 11~14，按 3px 会让内衬几乎贴住文字。 */
    --dual-inset: 2px;
}
.gear-tip.on {
    visibility: visible;
    opacity: 1;
    transform: none;
    transition-delay: 0s;
}
/* 暗色下投影是黑压黑，等于没有浮起；靠把纸面往纸白提一档表达「在上面一层」。
 * 只提一档不够——格子本身也是 paper-2，浮片会和身后的格子糊成一片。
 * 往 `--paper-base`（不翻面）提，不是往 `--paper`（暗色下是 #1c1912）提。
 * 暗色覆写整条写进 `:global()`：与 `AppRail` 的写法一致（§2.4-1）。 */
:global(html.dark .gear-tip) {
    background: color-mix(in srgb, var(--paper-2) 86%, var(--paper-base) 14%);
}

.tip-name {
    color: var(--ink);
    font-size: var(--fs-md);
    letter-spacing: 0.03em;
    line-height: 1.3;
}
.tip-kind {
    margin-top: 2px;
    letter-spacing: 0.06em;
}
.flavor {
    display: -webkit-box;
    /* 两行封顶：风味文本最长的一句有 60 多字，放开会把属性顶出屏幕。 */
    margin: 5px 0 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.6;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
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
    gap: 8px;
    padding: 1px 0;
    font-size: var(--fs-sm);
}
dt {
    flex: none;
    color: var(--ink-2);
}
dd {
    /* 值靠右：属性名长短不一（「伤害」两字 vs 「抗封印命中等级」七字），
     * 不靠右时每行的数值起点都不一样，扫一眼抓不到数。 */
    margin: 0 0 0 auto;
    color: var(--ink);
    white-space: nowrap;
}
/* 方括号里那个数是「还能推到多少」，比当前值轻一档，但仍要读得见。 */
.extra {
    margin-left: 2px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
/* 打造或镶嵌附加的绿字：这是这件装备「比同款多什么」的地方。 */
.gain dd {
    color: var(--moss);
}
/* 耐久 / 锻炼 / 宝石：一行小字，不占属性表的行。 */
.cond {
    display: flex;
    flex-wrap: wrap;
    gap: 0 5px;
    margin-top: 4px;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.6;
}
.cond em {
    margin-right: 5px;
    font-style: normal;
    opacity: 0.5;
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
.line .v.moss {
    color: var(--moss);
}
.tip-foot {
    margin-top: 6px;
    padding-top: 5px;
    border-top: var(--w-hair) dotted var(--rule-2);
    letter-spacing: 0.04em;
}
</style>
