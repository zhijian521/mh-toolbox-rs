<script setup lang="ts">
/**
 * 压印块只管结构与交互；纸面、印面、明暗和三态材质统一在 tokens.css。
 * --tile-w / --tile-h 控制尺寸，--tile-r 控制圆角，--tile-drop 控制影子尺度。
 * --tile-face / --tile-face-hover / --tile-face-active 保留局部染色入口。
 * wide 收拢大块偏光，still 关闭不可点击内容的悬停和按下反馈。
 */
withDefaults(defineProps<{ still?: boolean; tone?: 'paper' | 'seal'; wide?: boolean }>(), {
    still: false,
    tone: 'paper',
    wide: false,
});
</script>

<template>
    <span class="press-tile" :class="[{ still }, { 'tone-seal': tone === 'seal' }, { wide }]">
        <span class="press-content"><slot /></span>
    </span>
</template>

<style scoped>
.press-tile {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: var(--tile-w, auto);
    height: var(--tile-h, var(--tile-w, auto));
    border-radius: var(--tile-r, var(--r-tile));
    background-color: var(--press-color);
    background-image: var(--press-image, none);
    box-shadow: var(--press-shadow);
    color: var(--press-ink);
    transition:
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft),
        transform var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}
.press-content {
    display: grid;
    place-items: center;
}
.press-tile:not(.still):active {
    transform: translateY(2px);
}
.press-content :deep(:is(svg, img)) {
    filter: var(--press-icon-filter);
}
</style>
