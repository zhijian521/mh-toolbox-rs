<script setup lang="ts">
import { GlassButton } from './index';

const props = defineProps<{
    options: readonly { value: string; label: string; disabled?: boolean }[];
    label: string;
    size?: 'compact' | 'standard';
    disabled?: boolean;
}>();
const selected = defineModel<string[]>({ required: true });
function toggle(value: string) {
    if (props.disabled || props.options.find((option) => option.value === value)?.disabled) return;
    selected.value = selected.value.includes(value)
        ? selected.value.filter((item) => item !== value)
        : [...selected.value, value];
}
</script>

<template>
    <div class="glass-multi-select" role="group" :data-size="size ?? 'compact'" :aria-label="label">
        <GlassButton
            v-for="option in options"
            :key="option.value"
            size="small"
            variant="plain"
            class="lg-choice-button"
            :aria-pressed="selected.includes(option.value)"
            :disabled="disabled || option.disabled"
            @click="toggle(option.value)"
        >
            <span :title="option.label">{{ option.label }}</span>
        </GlassButton>
    </div>
</template>

<style scoped>
.glass-multi-select {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    gap: 4px var(--lg-choice-gap);
    min-height: var(--lg-choice-height);
    padding: var(--lg-choice-inset);
    border: 1px solid var(--liquid-outline);
    border-radius: calc(var(--lg-choice-height) / 2);
    background: var(--lg-bar-fill);
    box-shadow: var(--lg-edge-rim);
}
@media not (prefers-reduced-transparency: reduce) {
    .glass-multi-select {
        backdrop-filter: var(--lg-control-backdrop);
    }
}
.glass-multi-select .lg-choice-button {
    --glass-button-height: calc(var(--lg-choice-height) - 2 * var(--lg-choice-inset) - 2px);
    max-width: 100%;
    --glass-button-padding: var(--lg-choice-padding-inline);
    --glass-foreground: var(--liquid-muted);
}
.glass-multi-select .lg-choice-button[aria-pressed='true'] {
    background: var(--lg-selector-lens);
    box-shadow: var(--lg-edge-rim), 0 1px 3px rgb(12 28 25 / 0.14);
    --glass-foreground: var(--liquid-ink);
}
.lg-choice-button span {
    min-width: 0;
    overflow: hidden;
    scrollbar-gutter: auto;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
