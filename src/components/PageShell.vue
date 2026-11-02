<script setup lang="ts">
import PageHeader from './PageHeader.vue';

/**
 * 页面外壳：`PageHeader` + `.page-content`，两个根节点，不额外包一层。
 *
 * 存在的理由只有一条：**页头的左右内边距必须等于内容区的左右内边距**。
 * 这两个数现在都取 `--page-pad`（见 `tokens.css` 的「页面留白」），而 `.page-content`
 * 是**四边**同值：上边与左右相等，第一张卡才不会顶得比缩进更近。
 * 这两处一旦不等，页头那道通栏账线就会比下面的卡片短或长一截，接缝处差一个台阶；
 * 原先靠注释记着「两边都是 16」，正是 RECORD.md §1.2-H 反对的那种「需要记得两边都改」。
 * 收进一个组件后，页头与内容区在同一个文件里，**改成结构问题而不是记忆力问题**；
 * 再把数值收进一枚令牌，连「这个文件里有两条 16」都不需要了。
 *
 * 为什么是两个根节点而不是再包一个 div：外壳是 `flex column`，
 * `PageHeader` 是 `flex: none`、`.page-content` 是 `flex: 1`，中间夹一层会多出一个
 * 不参与分配的元素，高度按内容走而不是撑满——滚动条会从内容区挪到外层。
 *
 * 页面自己仍然要写「页头文案 + 内容」，只是不再重复那两个 `div`。
 */
withDefaults(defineProps<{ title: string; desc?: string }>(), { desc: '' });
</script>

<template>
    <PageHeader :title="title" :desc="desc">
        <!-- 动作区原样透传：`SettingsView` 不用，`PlaceholderView` 放一句提示。 -->
        <slot name="actions" />
    </PageHeader>
    <div class="page-content">
        <slot />
    </div>
</template>
