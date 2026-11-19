<script setup lang="ts">
/** 首页入口与排序草稿共用侧签面板；点击、焦点、拖动仍由调用方的语义元素负责。 */
import AppIcon from '../../components/AppIcon.vue';
import PressTile from '../../components/PressTile.vue';
import type { HomeShortcut } from './shortcuts';

defineProps<{ one: HomeShortcut }>();
</script>

<template>
    <PressTile class="shortcut-face" surface="side-tab" :data-tone="one.tone">
        <span class="shortcut-icon"><AppIcon :name="one.icon" /></span>
        <span class="shortcut-name">{{ one.text }}</span>
        <slot name="suffix" />
    </PressTile>
</template>

<style scoped>
.shortcut-face {
    --shortcut-tone: var(--accent);
    --tile-ink: var(--shortcut-tone);
    --tile-face: var(--paper);
    --tile-face-hover: color-mix(in srgb, var(--shortcut-tone) 4%, var(--paper));
    --tile-face-active: var(--well);
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-ticket);
    flex: 1;
    min-width: 0;
    min-height: var(--shortcut-min-h, calc(60px * var(--fs-scale)));
    padding: var(--shortcut-pad, 14px 14px 14px 19px);
}
.shortcut-face[data-tone='indigo'] {
    --shortcut-tone: var(--indigo-ink);
}
.shortcut-face[data-tone='moss'] {
    --shortcut-tone: var(--moss);
}
.shortcut-face[data-tone='ochre'] {
    --shortcut-tone: var(--ochre);
}
.shortcut-face :deep(.press-content) {
    display: flex;
    align-items: center;
    gap: var(--shortcut-gap, 12px);
    width: 100%;
    height: 100%;
    min-width: 0;
}
.shortcut-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--shortcut-icon-box, calc(24px * var(--fs-scale)));
    height: var(--shortcut-icon-box, calc(24px * var(--fs-scale)));
    color: var(--shortcut-tone);
}
.shortcut-icon :deep(.app-icon) {
    --icon-size: var(--shortcut-icon-size, calc(23px * var(--fs-scale)));
}
.shortcut-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--shortcut-font-size, var(--fs-base));
    color: var(--ink-2);
}
</style>
