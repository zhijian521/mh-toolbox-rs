<script setup lang="ts">
/**
 * 页头：**一行**，标题 + 副标题 + 右侧动作；横贯整个内容区，且不随内容滚动。
 *
 * 四条约束，都是踩过的：
 * 1. 不换行。标题和副标题竖排会把页头撑到 78px，等于从正文里白扣掉一行数据；
 *    数据密集的页面，页头每多一像素都是从账目上抢的。
 * 2. 标题与副标题走 baseline 对齐。22px 与 12px 若走 center，副标题会浮在标题中间，
 *    看着像没有落款。
 * 3. `flex: none` + 实底背景。页头本身不滚（滚动交给 `.page-content`），
 *    但内容会从它下沿经过，没有底色就会透出来。
 * 4. 分界是**通栏** 1px 账线。早先试过内缩 20px 的写法，两端与区块框错开，
 *    反而读作「断头线」；撑满到内容区两侧才对得上左栏那条竖线。
 */
withDefaults(defineProps<{ title: string; desc?: string }>(), { desc: '' });
</script>

<template>
    <header class="page-head">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="desc" class="page-desc">{{ desc }}</p>
        <div class="page-actions">
            <slot />
        </div>
    </header>
</template>

<style scoped>
.page-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    flex: none;
    gap: 12px;
    padding: 10px 20px 9px;
    border-bottom: var(--w-hair) solid var(--rule);
    background: var(--paper);
    white-space: nowrap;
}
.page-title {
    flex: none;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-xl);
    font-weight: normal;
    letter-spacing: 0.04em;
    line-height: 1.15;
}
.page-desc {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-sm);
    /* 行高收到 1.4：副标题的行框会把基线顶高，默认行高会让页头多出 3–4px 无用的空隙。 */
    line-height: 1.4;
    letter-spacing: 0.06em;
    text-overflow: ellipsis;
}
.page-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    /* 动作区按 header 中线居中，不跟着标题基线走，否则小字会贴到标题顶端。 */
    align-self: center;
}
</style>
