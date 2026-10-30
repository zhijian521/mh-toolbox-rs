<script setup lang="ts">
/**
 * 印章：朱红方框 + 微微歪 2.5°。
 *
 * 全站唯一允许「不端正」的元素，用来标记已定稿 / 已入账 / 已达成这类状态。
 * 不要拿它当图标用——印多了就等于没有印。
 *
 * 尺寸默认乘 --fs-scale；标题栏里那枚用 `:size="20"` 单独收小。
 */
withDefaults(defineProps<{ text: string; solid?: boolean; size?: number }>(), {
    solid: false,
    size: 0,
});
</script>

<template>
    <span
        class="seal"
        :class="{ solid, sized: size > 0 }"
        :style="size > 0 ? { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.58}px` } : undefined"
        aria-hidden="true"
        >{{ text }}</span
    >
</template>

<style scoped>
/* 指定具体尺寸时，别让 tokens 里的 --fs-scale 再叠一次。 */
.seal.sized {
    font-size: inherit;
}
</style>
