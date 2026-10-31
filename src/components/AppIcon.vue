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
 *   - 尺寸取 `--icon-size`，默认 `calc(14px * var(--fs-scale))`：调大字号图标一起长
 *
 * 尺寸走**变量**而不是 prop：父级要 13px 就在自己的规则里写 `--icon-size`，
 * 与 `SlotButton` 的 `--slot-h`、`VerticalSlider` 的 `--vs-*` 是同一条约定。
 * 曾经的 `size` prop 写 inline px，会把默认值整个顶掉、也不跟 `--fs-scale`
 * 一起缩放——「较大」档里字号长了而图标不长，正是那个 prop 造成的。
 *
 * 笔宽走 CSS 而不是组件 prop：`stroke-width` 声明会覆盖 `<svg>` 上的同名 attribute，
 * 以后换库也只用改这一行。
 */
const props = defineProps<{ name: IconName }>();

const glyph = computed(() => ICONS[props.name]);
</script>

<template>
    <component :is="glyph" class="app-icon" :size="24" aria-hidden="true" />
</template>

<style scoped>
.app-icon {
    flex: none;
    width: var(--icon-size, calc(14px * var(--fs-scale)));
    height: var(--icon-size, calc(14px * var(--fs-scale)));
    stroke-width: 1.8;
}
</style>
