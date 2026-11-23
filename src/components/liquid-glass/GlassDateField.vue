<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import { glass } from 'glassy-liquid';
import { popupGlass } from './index';
import AppIcon from '../AppIcon.vue';
import DateField from '../DateField.vue';
import GlassInput from './GlassInput.vue';

const value = defineModel<string>({ required: true });
defineProps<{ label: string; disabled?: boolean; error?: string }>();
const triggerId = useId();
const calendar = ref<InstanceType<typeof DateField> | null>(null);

watch(
    [() => calendar.value?.panel, popupGlass],
    ([panel, options], _, cleanup) => {
        if (!panel) return;
        const surface = glass(panel, options);
        cleanup(() => surface.destroy());
    },
    { flush: 'post' },
);
</script>

<template>
    <div class="glass-date-field">
        <label :for="triggerId">{{ label }}</label>
        <DateField
            ref="calendar"
            v-model="value"
            :trigger-id="triggerId"
            :label="label"
            :disabled="disabled"
            :error="error"
            placeholder="选择日期"
            top-layer
        >
            <template #trigger="{ text }">
                <GlassInput class="glass-date-face">
                    <time v-if="value" :datetime="value">{{ text }}</time>
                    <span v-else>{{ text }}</span>
                    <AppIcon name="calendar" />
                </GlassInput>
            </template>
        </DateField>
    </div>
</template>

<style scoped>
.glass-date-field {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
    --ink: var(--liquid-ink);
    --ink-2: var(--liquid-ink);
    --muted: var(--liquid-muted);
    --rule: var(--liquid-outline);
    --seal: var(--liquid-focus);
    --on-seal: light-dark(white, #132c21);
    --accent: var(--liquid-focus);
    --r-1: 8px;
    --w-hair: 1px;
    --ring: 2px solid var(--liquid-focus);
    --ring-offset: 1px;
}
.glass-date-field > label,
.glass-date-field :deep(.field-error) {
    color: var(--liquid-muted);
    font-size: var(--fs-xs);
}
.glass-date-field :deep(.field-error) {
    color: var(--liquid-up);
}
.glass-date-field :deep(.date-trigger) {
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--liquid-ink);
    font: inherit;
}
.glass-date-field :deep(.date-trigger:is(:focus-visible, [aria-expanded='true'])) {
    outline: var(--ring);
    outline-offset: 1px;
}
.glass-date-field :deep(.date-trigger:disabled) {
    opacity: 0.55;
}
.glass-date-face {
    justify-content: space-between;
    pointer-events: none;
    --icon-size: 14px;
}
.glass-date-face time {
    overflow-wrap: anywhere;
}
.glass-date-field :deep(.date-panel) {
    inset: auto;
    margin: 0;
    width: min(234px, calc(100vw - 16px));
    overflow: visible;
    padding: 0;
    border: 0;
    border-radius: v-bind('popupGlass.radius + "px"');
    background: var(--lg-popup-fill);
    box-shadow: none;
    color: var(--liquid-ink);
    font: inherit;
}
.glass-date-field :deep(.date-content) {
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px;
    border-radius: inherit;
}
@media (prefers-reduced-motion: no-preference) {
    .glass-date-field :deep(.date-panel) {
        transform-origin: top left;
        transform: var(--date-anchor-transform, scale(0.96));
        opacity: 0;
    }
    .glass-date-field :deep(.date-panel:not(:popover-open)) {
        transition:
            transform 340ms ease-out,
            opacity var(--lg-popup-fade) ease-out,
            display var(--lg-popup-fade) allow-discrete,
            overlay var(--lg-popup-fade) allow-discrete;
    }
    .glass-date-field :deep(.date-panel:popover-open[data-ready]) {
        transform: none;
        opacity: 1;
        transition:
            transform 460ms cubic-bezier(0.18, 0.88, 0.25, 1.06),
            opacity 120ms ease-out;
    }
    .glass-date-field :deep(.date-content) {
        opacity: 0;
        transition: opacity var(--lg-popup-fade) ease-out;
    }
    .glass-date-field :deep(.date-panel:popover-open[data-ready] .date-content) {
        opacity: 1;
        transition: opacity 120ms ease-out 55ms;
    }
}
@media (prefers-reduced-transparency: reduce) {
    .glass-date-field :deep(.date-panel) {
        background: light-dark(#f6fbf8, #192522);
    }
}
</style>
