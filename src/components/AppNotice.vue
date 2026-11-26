<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import type { NoticeTone } from '../composables/use-notify';

defineProps<{ tone?: NoticeTone | 'warning'; bare?: boolean }>();
</script>

<template>
    <div class="app-notice" :data-tone="tone ?? 'info'" :class="{ bare }">
        <AppIcon
            class="notice-icon"
            :name="tone === 'success' ? 'check' : tone === 'error' ? 'close' : 'info'"
            aria-hidden="true"
        />
        <div class="notice-body"><slot /></div>
        <div v-if="$slots.action" class="notice-action"><slot name="action" /></div>
    </div>
</template>

<style scoped>
.app-notice {
    --notice-accent: var(--liquid-focus, var(--accent));
    display: flex;
    align-items: flex-start;
    gap: 7px;
    min-width: 0;
    max-width: 100%;
    padding: 7px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--notice-accent) 7%, var(--lg-content-base, var(--paper)));
    box-shadow: var(--lg-edge-rim, none);
    color: var(--liquid-ink, var(--ink));
    font: inherit;
    font-size: var(--fs-sm);
    line-height: 1.5;
    text-align: start;
}
.app-notice[data-tone='error'] {
    --notice-accent: var(--liquid-up, var(--danger-ink));
}
.app-notice[data-tone='warning'] {
    --notice-accent: var(--ochre, var(--liquid-focus));
}
.app-notice[data-tone='success'] {
    --notice-accent: var(--liquid-down, var(--success));
}
.app-notice.bare {
    padding: 0;
    background: none;
    box-shadow: none;
}
.notice-icon {
    --icon-size: 15px;
    flex: none;
    margin-top: 0.15em;
    color: var(--notice-accent);
}
.notice-body {
    flex: 1;
    min-width: 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
}
.notice-action {
    align-self: center;
    flex: none;
}
</style>
