<script setup lang="ts">
defineProps<{ wide?: boolean }>();
</script>

<template>
    <span class="glass-compact-number-field" :class="{ 'is-wide': wide }"><slot /></span>
</template>

<style scoped>
.glass-compact-number-field {
    --number-align: center;
    display: block;
    width: calc(64px * var(--fs-scale));
    max-width: 100%;
    min-width: 0;
}
.glass-compact-number-field.is-wide {
    --number-align: end;
    width: calc(144px * var(--fs-scale));
}
.glass-compact-number-field :deep(input) {
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 28px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: var(--r-2, 10px);
    background: var(--lg-field-fill);
    box-shadow: inset 0 1px 2px color-mix(in srgb, var(--lg-edge-shade) 75%, transparent);
    color: var(--liquid-ink);
    font-size: var(--fs-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    text-align: var(--number-align);
}
.glass-compact-number-field :deep(input:focus) {
    outline: none;
    background: var(--lg-field-active-fill);
}
.glass-compact-number-field :deep(input[aria-invalid='true']) {
    border-color: var(--liquid-up);
}
.glass-compact-number-field :deep(input:disabled) {
    opacity: 0.55;
}
@media (forced-colors: active) {
    .glass-compact-number-field :deep(input:focus-visible) {
        outline: 2px solid Highlight;
        outline-offset: -2px;
    }
}
</style>
