<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from './icons';

/**
 * 图标渲染器。图标本体来自成套库（tabler），几何不再由我们维护；
 * 这里只负责**统一规格**，这才是自己写图标的真正理由。
 *
 * 规格由 CSS 定，不由库定：
 *   - 24 网格（库的 viewBox 原样保留，不改几何）
 *   - 笔宽 1.8 user units → 显示 14px 时约 1.05 物理像素，与账线同一种细笔
 *   - 尺寸 `calc(14px * var(--fs-scale))`，调大字号图标一起长
 *
 * 笔宽走 CSS 而不是组件 prop：`stroke-width` 声明会覆盖 `<svg>` 上的同名 attribute，
 * 以后换库也只用改这一行。
 */
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 0 });

const glyph = computed(() => ICONS[props.name]);
const box = computed(() =>
    props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined,
);
</script>

<template>
    <component :is="glyph" class="app-icon" :style="box" :size="24" aria-hidden="true" />
</template>

<style scoped>
.app-icon {
    flex: none;
    width: calc(14px * var(--fs-scale));
    height: calc(14px * var(--fs-scale));
    stroke-width: 1.8;
}
</style>
