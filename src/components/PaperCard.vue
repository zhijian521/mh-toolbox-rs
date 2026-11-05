<script setup lang="ts">
import { computed } from 'vue';

/**
 * 台面上的一张纸 —— **全站卡片的唯一外壳**（2026-11-05）。
 *
 * ## 为什么要有这个组件
 *
 * 材质只有一份，写在 `base.css` 的 `.board` 里（圆角、上亮下暗的棱、下沿 3px 纸的断面、
 * 硬影 + 软影、左上偏光 + 135° 斜向渐变）。组件这边不加一条样式，只负责两件事：
 *
 * 1. **定标签**。卡片的语义标签不止一种：区块是 `<section>`、列表项是 `<article>`、
 *    捉鬼页的识别原文是 `<details>`（要能折叠）。三处各写一遍 `class="board"` 就是
 *    「记得每处都写」——迟早有一处漏掉，那一块就变回一张平纸，而它旁边那几张是立体的，
 *    看起来像漏刷了一角。`as` 让它们走同一个入口。
 * 2. **传底色**。默认取 `--paper`；有自己底色的卡传 `face`（将来角色卡若要走纸渐变而不是
 *    门派渐变，也在这里换），渐变与棱会按新底色重算——`base.css` 里那两条
 *    `color-mix()` 读的就是 `--board-face`，不需要为「另一种纸」再抄一份影。
 *
 * ## 为什么没有 `padding`
 *
 * 20px 的默认内边距写在 `.board` 里，卡内有自己版式的（`LedgerSection` 用 `--block-pad`、
 * 目标卡 13/15）用 class 覆盖即可。组件不接 `padding` prop：一个数值进来就要做
 * `calc()` 与字符串两种分支，而覆盖一个 class 已经足够，还离样式更近。
 *
 * ## 用法
 *
 * ```vue
 * <PaperCard>…</PaperCard>                          <!-- section，默认 -->
 * <PaperCard as="article" class="book">…</PaperCard> <!-- class 会合到根上 -->
 * <PaperCard as="details" :open="true">…</PaperCard>  <!-- 其余 attr 原样透传 -->
 * ```
 */
const props = withDefaults(
    defineProps<{
        /** 渲染成什么标签。只开放「内容区的容器」这几种，浮层（编辑器、测试面板）不走这里。 */
        as?: 'section' | 'article' | 'div' | 'details';
        /** 纸色。空 = `--paper`；有自己底色的卡传一枚令牌（如角色卡的门派浅染底）。 */
        face?: string;
    }>(),
    { as: 'section', face: '' },
);

/** `--board-face` 走内联变量：它是**这一张卡**的纸色，不是全局令牌，写在样式表里就串页了。 */
const surface = computed(() => (props.face ? { '--board-face': props.face } : undefined));
</script>

<template>
    <component :is="as" class="board" :style="surface">
        <slot />
    </component>
</template>
