<script setup lang="ts">
import AppIcon from '../AppIcon.vue';
import { GlassFieldSurface } from './index';

defineProps<{ text: string; valueId?: string; disabled?: boolean }>();
</script>

<template>
    <button :disabled="disabled" type="button" class="glass-select-trigger lg-popup-trigger">
        <GlassFieldSurface class="glass-select-face" radius="capsule">
            <span :id="valueId">{{ text }}</span>
            <AppIcon name="chevron-down" />
        </GlassFieldSurface>
    </button>
</template>

<style scoped>
.glass-select-trigger {
    width: 100%;
}
.glass-select-face {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--glass-select-height, var(--glass-search-height));
    padding-inline: 14px 12px;
    pointer-events: none;
}
.glass-select-face > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
