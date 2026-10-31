<script setup lang="ts">
/**
 * 印章：朱红方框 + 微微歪 2.5°。
 *
 * 全站唯一允许「不端正」的元素，用来标记已定稿 / 已入账 / 已达成这类状态。
 * 不要拿它当图标用——印多了就等于没有印。
 *
 * 尺寸只有一档（26px × `--fs-scale`），跟着字号缩放：字变大了印章不变，
 * 会显得那颗印比旁边的字还小。**不留 `size` 覆盖口**：曾经有一个，全站没人传，
 * 而它的 scoped 兜底规则（`font-size: inherit`）永远被 inline style 压过——
 * 一处不生效的分支比没有分支更难查。真需要第二个尺寸时，用父级覆写 `--seal-size`。
 */
withDefaults(defineProps<{ text: string; solid?: boolean }>(), { solid: false });
</script>

<template>
    <span class="seal" :class="{ solid }" aria-hidden="true">{{ text }}</span>
</template>
