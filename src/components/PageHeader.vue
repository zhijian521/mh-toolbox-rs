<script setup lang="ts">
/**
 * 页头：**一行**，标题 + 副标题 + 右侧动作。
 *
 * 三条约束，都是踩过的：
 * 1. 不换行。标题和副标题竖排会把页头撑到 56px 高，等于从正文里白扣掉一行数据；
 *    数据密集的页面，页头每多一像素都是从账目上抢的。
 * 2. 标题与副标题走 baseline 对齐。22px 与 12px 若走 center，副标题会浮在标题中间，
 *    看着像没有落款。
 * 3. 分界用**与内容同宽的 1px 账线**，不用通栏粗线。原来那条是 2px 描边色横贯整个
 *    窗口，比正文里任何一条线都重，把视线从数据上拽回页头；而且两端顶到窗口边缘，
 *    与内缩 20px 的区块框错开，读起来像「断头线」。
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
    position: relative;
    display: flex;
    align-items: baseline;
    flex: none;
    gap: 12px;
    padding: 10px 20px 9px;
    white-space: nowrap;
}
/* 分界线内缩到与内容同宽，靠伪元素而不是 border —— border 会跟着 padding 顶到窗口边缘。 */
.page-head::after {
    content: '';
    position: absolute;
    right: 20px;
    bottom: 0;
    left: 20px;
    height: var(--w-hair);
    background: var(--rule);
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
