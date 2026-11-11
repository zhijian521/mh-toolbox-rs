<script setup lang="ts">
/**
 * 组头：一条朱色短竖条 + 一档小字的分栏名（右端可以再跟一个小计）。
 *
 * 样式不在这里：几何、字色、字距、两种间距变量（`--gh-gap` / `--gh-mb`）都在
 * `base.css` 的 `.group-head`，卡与编辑页共用一份。
 *
 * 为什么还要一层组件：同一句 `<span class="section-mark"></span>` 原先在属性、辅助、
 * 修炼、师门、召唤兽详情五处手抄，漏写一次不会报错——少一条竖条只是「这一组看起来
 * 少了一点东西」，截图断言也不会红。收成组件后「组头长什么样」只有一个地方能改。
 *
 * 间距仍由调用方按容器覆写（`.assist-group .group-head` 之类）：那些值是有意的
 * 差异，不是漏改。组件根就是 `.group-head`，父级的 scoped 选择器照样够得着。
 */
</script>

<template>
    <div class="group-head"><span class="section-mark"></span><slot /></div>
</template>
