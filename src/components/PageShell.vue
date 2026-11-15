<script setup lang="ts">
import PageHeader from './PageHeader.vue';

/**
 * 页头与内容共用 --page-pad，保持左右及内容四边留白一致。
 * 保留两个根节点参与父级 flex 分配；额外包装会让滚动从内容区移到外层。
 */
/** 默认铺台面承托 PaperCard；整页纸面的页面可关闭。 */
withDefaults(defineProps<{ title: string; desc?: string; surface?: boolean }>(), {
    desc: '',
    surface: true,
});
</script>

<template>
    <PageHeader :title="title" :desc="desc">
        <!-- 页头动作由页面提供。 -->
        <slot name="actions" />
    </PageHeader>
    <div class="page-content" :class="{ surface }">
        <slot />
    </div>
</template>

<style scoped>
/* ---------- 台面（`surface`） ----------
 * 内容区铺一层比纸深一档的底，于是这一页的卡片与统计签都是「浮在台面上的纸片」。
 *
 * 为什么不给卡片加阴影硬撑出立体：`PressTile` 与 `tokens.css` 都写着同一条——
 * **纸上没有比纸更亮的纸**。四格统计签之所以立体，是因为它们小（88 高），靠四条棱与
 * 落地影就够；340 宽的大卡放在同一个 `--paper` 页面上，影画得再厚也读作「一块色块」，
 * 而把板面调深一档又会读成**凹**，与上方凸起的签方向相反（方案 B 的毛病）。
 * 换掉它躺着的那一层，两张卡与四格签立刻是同一种纸（都是 `--paper`），材质配方一条不用改。
 *
 * 取 `--well` 而不是 `--bg`：`--bg` 与 `--paper` 只差 10 阶（亮色实测 #eee5cf / #f8f3e6），
 * 卡片浮不起来，边缘只剩 1px 棱在说话。`--well` 是凹槽那层色，比纸深 17 阶，是「台面」；
 * 语义也没跑偏——它本来就是「纸下面那一层」。
 *
 * 铺在 `.page-content` 上而不是页面里再包一层：内容区已经有四边同值的 `--page-pad`，
 * 背景直接铺满（含内边距），卡片自然落在台面里；再包一层就得用负 margin 去抵内边距，
 * 而右侧那条滚动条轨道（`--scrollbar-w`）会让抵消量左右不等，台面右缘与页头右端差一条轨道。
 */
.page-content.surface {
    background: var(--page-surface);
}
</style>
