<script setup lang="ts">
import PageHeader from './PageHeader.vue';

/**
 * 页面外壳：`PageHeader` + `.page-content`，两个根节点，不额外包一层。
 *
 * 存在的理由只有一条：**页头的左右内边距必须等于内容区的左右内边距**。
 * 这两个数现在都取 `--page-pad`（见 `tokens.css` 的「页面留白」），而 `.page-content`
 * 是**四边**同值：上边与左右相等，第一张卡才不会顶得比缩进更近。
 * 这两处一旦不等，页头那道通栏账线就会比下面的卡片短或长一截，接缝处差一个台阶；
 * 原先靠注释记着「两边都是 16」，正是 RECORD.md §1 那条「凡是需要记得两边都改的东西，
 * 迟早会不一致」反对的写法。
 * 收进一个组件后，页头与内容区在同一个文件里，**改成结构问题而不是记忆力问题**；
 * 再把数值收进一枚令牌，连「这个文件里有两条 16」都不需要了。
 *
 * 为什么是两个根节点而不是再包一个 div：外壳是 `flex column`，
 * `PageHeader` 是 `flex: none`、`.page-content` 是 `flex: 1`，中间夹一层会多出一个
 * 不参与分配的元素，高度按内容走而不是撑满——滚动条会从内容区挪到外层。
 *
 * 页面自己仍然要写「页头文案 + 内容」，只是不再重复那两个 `div`。
 */
/** `surface`：内容区铺一层「台面」（比纸深一档），卡片于是读作浮在上面的纸片。
 *  **默认开**（2026-11-05 全站统一）：从那以后卡片一律是 `.board`，而纸片必须躺在
 *  比它深的一层上才浮得起来——关掉它等于把纸张贴回纸面。留这个 prop 只是给将来
 *  「整页就是一张纸、不需要卡片」的页面一个出口（比如全屏阅读页）。 */
withDefaults(defineProps<{ title: string; desc?: string; surface?: boolean }>(), {
    desc: '',
    surface: true,
});
</script>

<template>
    <PageHeader :title="title" :desc="desc">
        <!-- 动作区原样透传：`SettingsView` 不用，`PlaceholderView` 放一句提示。 -->
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
