<script setup lang="ts">
/** 首页入口与排序草稿共用双孔纸签；仅装饰层镂空，点击、焦点与拖动由外层负责。 */
import AppIcon from '../../components/AppIcon.vue';
import PaperTag from '../../components/PaperTag.vue';
import type { HomeShortcut } from './shortcuts';

defineProps<{ one: HomeShortcut }>();
</script>

<template>
    <PaperTag class="shortcut-face" :data-tone="one.tone">
        <span class="shortcut-content">
            <span class="shortcut-icon"><AppIcon :name="one.icon" /></span>
            <span class="shortcut-name">{{ one.text }}</span>
            <slot name="suffix" />
        </span>
    </PaperTag>
</template>

<style scoped>
.shortcut-face {
    --shortcut-tone: var(--accent);
    --paper-tag-tone: var(--shortcut-tone);
    --paper-tag-pad: var(--shortcut-pad, 14px 14px 14px 40px);
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
.shortcut-content {
    display: flex;
    align-items: center;
    gap: var(--shortcut-gap, 12px);
    width: 100%;
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
    font-size: var(--fs-base);
    color: var(--ink-2);
}
</style>
