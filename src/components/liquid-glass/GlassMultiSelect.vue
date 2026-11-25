<script setup lang="ts">
import AppIcon from '../AppIcon.vue';

defineProps<{
    options: readonly { value: string; label: string; disabled?: boolean }[];
    label: string;
    size?: 'compact' | 'standard';
    disabled?: boolean;
}>();
const selected = defineModel<string[]>({ required: true });
</script>

<template>
    <div class="glass-multi-select" role="group" :data-size="size ?? 'compact'" :aria-label="label">
        <label v-for="option in options" :key="option.value" class="glass-multi-option">
            <input
                v-model="selected"
                type="checkbox"
                :value="option.value"
                :disabled="disabled || option.disabled"
            />
            <span class="glass-multi-mark" aria-hidden="true"><AppIcon name="check" /></span>
            <span class="glass-multi-label">{{ option.label }}</span>
        </label>
    </div>
</template>

<style scoped>
.glass-multi-select {
    --lg-multi-height: var(--lg-form-height);
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    gap: 6px;
}
.glass-multi-select[data-size='standard'] {
    --lg-multi-height: var(--lg-form-standard-height);
}
.glass-multi-option {
    box-sizing: border-box;
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    max-width: 100%;
    min-height: var(--lg-multi-height);
    padding: 4px 9px;
    border: 1px solid var(--liquid-outline);
    border-radius: 8px;
    background: var(--lg-field-fill);
    box-shadow: var(--lg-edge-rim);
    color: var(--liquid-ink);
    font-size: var(--fs-sm);
    cursor: pointer;
}
.glass-multi-option:has(input:checked) {
    border-color: color-mix(in srgb, var(--liquid-focus) 28%, var(--liquid-outline));
    background: color-mix(in srgb, var(--liquid-focus) 10%, var(--lg-selector-lens));
}
@media (hover: hover) {
    .glass-multi-option:hover:not(:has(input:is(:disabled, :checked))) {
        background: var(--lg-field-active-fill);
    }
}
.glass-multi-option:has(input:focus-visible) {
    outline: 2px solid var(--liquid-focus);
    outline-offset: -2px;
}
.glass-multi-option:has(input:disabled) {
    opacity: 0.55;
    cursor: default;
}
.glass-multi-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
}
.glass-multi-mark {
    box-sizing: border-box;
    display: grid;
    flex: none;
    place-items: center;
    width: calc(15px * var(--fs-scale));
    height: calc(15px * var(--fs-scale));
    border: 1px solid color-mix(in srgb, var(--liquid-muted) 60%, transparent);
    border-radius: 4px;
    --icon-size: calc(12px * var(--fs-scale));
}
.glass-multi-mark .app-icon {
    visibility: hidden;
}
.glass-multi-option input:checked + .glass-multi-mark {
    border-color: transparent;
    background: var(--liquid-focus);
    color: light-dark(#fff, #172b24);
}
.glass-multi-option input:checked + .glass-multi-mark .app-icon {
    visibility: visible;
}
.glass-multi-label {
    min-width: 0;
    overflow-wrap: anywhere;
}
@media (forced-colors: active) {
    .glass-multi-option input {
        position: static;
        width: auto;
        height: auto;
        opacity: 1;
    }
    .glass-multi-mark {
        display: none;
    }
}
</style>
