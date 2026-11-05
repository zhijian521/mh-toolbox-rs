<script setup lang="ts">
import PressTile from '../../../components/PressTile.vue';
import IconTile from '../IconTile.vue';
import type { RailItem } from './rail';

/**
 * 编辑弹窗里的**左栏目录**：装备与召唤兽共用一套。
 *
 * ---- 为什么抽出来 ----
 * 两页在 2026-11-05 先后改成「左栏目录 + 右侧详情」（装备 E2、召唤兽 P3），
 * 各自抄了一份左栏：`.rail` / `.rail-head` / `.rail-item` / `.rail-item.on` /
 * `.rail-dot` / `.rail-dot.on` 六组选择器**逐字重复**，加起来 220 行。
 * 两份的差别只有三处，都是有意为之的参数（见下面每个 prop 的注释）。
 *
 * 留着两套的代价不是行数，是**它们会漂**：左栏贴不贴顶、选中线多粗、点多大，
 * 这些是同一个弹窗里的两个页签，用户来回切的时候必须一样。改一处忘一处，
 * 表现是「切一下页签左栏就变了个样」，而且没有人会为此报 bug。
 *
 * ---- 这里不管什么 ----
 * 数据、选中逻辑、「填了没有」的判据全在各页（`filled()` 每条判据都与那个页的
 * 字段语义绑死）。这里只回答「一行长什么样」。
 */
withDefaults(
    defineProps<{
        /** 行首的主语：装备 / 召唤兽。 */
        label: string;
        /** 顶端那个数：已填件数（装备）或总只数（召唤兽）。 */
        count: number;
        /** 数后面接的话：`/ 12` 或 `只`。 */
        suffix: string;
        items: RailItem[];
        /** 当前选中项的 `key`。 */
        selected: string;
        /**
         * 行高。装备 **30**（十二行要挤进一屏），召唤兽 **38**（只有五六行，
         * 行距还给手指）。这是两页唯一必须分开的数，所以做成参数而不是两套样式。
         */
        rowHeight?: number;
    }>(),
    { rowHeight: 30 },
);

/* 事件名刻意不叫 `select`：组件根是 `<aside>`，而 `select` 是 DOM 的原生事件名，
 * 两者会被合成一个「(payload: Event) => void」的交叉签名，`@select="fn(key: string)"` 当场报错。
 * 换成 `pick` 之后没有歧义，也读得出「挑了一行」这层意思。 */
const emit = defineEmits<{ pick: [key: string] }>();
</script>

<template>
    <!-- 左栏是这张表单的目录：从上到下就是固定顺序，高度不变，
         所以「我在改哪一个」由位置回答，不用读标题。 -->
    <aside class="rail" :style="{ '--rail-h': `${rowHeight}px` }">
        <div class="rail-head">
            {{ label }} <b>{{ count }}</b
            >{{ suffix }}
        </div>
        <button
            v-for="item in items"
            :key="item.key"
            type="button"
            class="rail-item"
            :class="{ on: item.key === selected }"
            :aria-pressed="item.key === selected"
            :aria-label="item.label"
            @click="emit('pick', item.key)"
        >
            <IconTile v-if="item.icon" class="rail-pic" :src="item.icon" />
            <PressTile v-else-if="item.tile" class="rail-pic" still aria-hidden="true">
                <span class="rail-ini">{{ item.mark }}</span>
            </PressTile>
            <span v-else class="rail-mark" aria-hidden="true">{{ item.mark }}</span>
            <span class="rail-name">{{ item.name }}</span>
            <span class="rail-dot" :class="{ on: item.filled }" aria-hidden="true"></span>
        </button>
        <!-- 「加一只」这类追加动作挂在目录末尾：它是往目录里添一行，
             所以长得像一行，不该跑到别处。 -->
        <slot name="footer" />
    </aside>
</template>

<style scoped>
/* 左栏 sticky：右侧详情比左栏高，滚到底部时「我在改哪一个」还得看得见。
 * `align-items: start` 在父容器上——stretch 会让 sticky 先被拉满整列。 */
.rail {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.rail-head {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding-bottom: 5px;
    margin-bottom: 2px;
    border-bottom: var(--w-hair) solid var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.14em;
}
.rail-head b {
    color: var(--ink);
    font-size: var(--fs-sm);
    font-weight: 400;
}
/* 一行 = 22 的盘/章 + 名字 + 一个点。行高由 `--rail-h` 给：
 * 装备 30（十二行挤进一屏）、召唤兽 38（五六行，行距还给手指）。 */
.rail-item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--rail-h);
    padding: 0 7px 0 6px;
    border: var(--w-hair) solid transparent;
    border-radius: var(--r-2);
    background: none;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
}
.rail-item:hover {
    background: color-mix(in srgb, var(--well) 45%, transparent);
}
/* 选中：底色一档 + 左侧 2px 朱线。**不用整块朱**——那会把左栏变成一排按钮，
 * 而它是一张目录：只要标出「当前这一行」。
 *
 * `inset 2px 0 0` 画在内侧，不占宽度：左缘因此始终对齐，
 * 换行时文字不会左右跳 2px。 */
.rail-item.on {
    border-color: color-mix(in srgb, var(--rule-2) 55%, transparent);
    background: color-mix(in srgb, var(--well) 55%, transparent);
    color: var(--ink);
    box-shadow: inset 2px 0 0 var(--cinnabar);
}
.rail-item:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 22 的小盘。选择器带 `.rail-item` 是为了压过 `IconTile` 自己那套 28 / 23 的默认值
 * ——两边都是单类 + 一个 `data-v`，只差这句多带一层父选择器。 */
.rail-item .rail-pic {
    --tile-w: 22px;
    --tile-h: 22px;
    --tile-r: var(--r-1);
    --shot: 18px;
    --tile-drop: 0.35;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
}
.rail-ini {
    color: color-mix(in srgb, var(--ink-2) 78%, transparent);
    font-size: calc(12px * var(--fs-scale));
    line-height: 1;
}
/* 五行章：与详情窗抬头那枚（34）同一套压印，缩到 22——左栏是索引，
 * 认的是「哪只」，不是读五行。 */
.rail-mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--well) 34%, var(--paper-2));
    box-shadow:
        inset 1px 1px 0 var(--bevel-hi),
        inset -1px -1px 0 var(--bevel-lo),
        0 1px 2px var(--shadow);
    color: var(--num);
    font-size: calc(var(--fs-sm) + 2px);
    line-height: 1;
}
.rail-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 点：实心＝填了，空心＝还没填。`--moss` 与「成功＝正收益」同一枚绿，
 * 这里表示「这件有了」——不新开一个色。 */
.rail-dot {
    flex: none;
    margin-left: auto;
    width: 5px;
    height: 5px;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 90%, transparent);
    border-radius: 50%;
}
.rail-dot.on {
    border-color: var(--moss);
    background: var(--moss);
}
</style>
