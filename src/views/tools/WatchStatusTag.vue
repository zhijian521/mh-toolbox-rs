<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'idle' | 'live' | 'warn' }>(), { tone: 'idle' });
</script>

<template>
    <span class="watch-status" :data-tone="tone" role="status"><slot /></span>
</template>

<style scoped>
.watch-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 3px 8px;
    border-radius: 999px;
    color: var(--muted);
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-size: var(--fs-xs);
    line-height: 1.4;
}
.watch-status::before {
    content: '';
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: currentColor;
}
.watch-status[data-tone='live'] {
    color: var(--moss);
}
.watch-status[data-tone='warn'] {
    color: var(--danger);
}
</style>
