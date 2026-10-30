<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from './icons';

/**
 * 图标渲染器。几何数据在 `icons.ts`，这里只负责「怎么画」：
 *
 * 16×16 网格、1.25 笔宽、方端点、无填充——与账线同一种细笔质感，
 * 所以它塞进账簿结构里不会像贴纸。
 *
 * 尺寸默认乘 `--fs-scale`（`calc(14px * var(--fs-scale))`），设置里调大字号图标一起长；
 * 需要固定尺寸时传 `size`（数字，按 px）。
 */
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 0 });

const paths = computed(() => ICONS[props.name] ?? []);
const box = computed(() =>
    props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined,
);
</script>

<template>
    <svg
        class="app-icon"
        :style="box"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="square"
        stroke-linejoin="miter"
        aria-hidden="true"
    >
        <path v-for="(d, index) in paths" :key="index" :d="d" />
    </svg>
</template>

<style scoped>
.app-icon {
    flex: none;
    width: calc(14px * var(--fs-scale));
    height: calc(14px * var(--fs-scale));
}
</style>
