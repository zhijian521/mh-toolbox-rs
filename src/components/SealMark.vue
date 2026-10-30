<script setup lang="ts">
/**
 * 印章：朱红方框 + 微微歪 2.5°。
 *
 * 全站唯一允许「不端正」的元素，用来标记已定稿 / 已入账 / 已达成这类状态。
 * 不要拿它当图标用——印多了就等于没有印。
 */
withDefaults(defineProps<{ text: string; solid?: boolean }>(), { solid: false });
</script>

<template>
    <span class="seal" :class="{ solid }" aria-hidden="true">{{ text }}</span>
</template>
