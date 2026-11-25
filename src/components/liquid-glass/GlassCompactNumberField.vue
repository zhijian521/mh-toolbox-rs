<script setup lang="ts">
import NumberField from '../NumberField.vue';

defineOptions({ inheritAttrs: false });
defineProps<{ label: string; wide?: boolean; updateOnInput?: boolean }>();
const value = defineModel<number>({ required: true });
</script>

<template>
    <span class="glass-compact-number-field" :class="{ 'is-wide': wide }">
        <NumberField
            v-model="value"
            bare
            class="compact-number-input"
            :label="label"
            :update-on-input="updateOnInput"
            v-bind="$attrs"
        />
    </span>
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
.glass-compact-number-field .compact-number-input {
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
    text-align: var(--number-align);
}
.glass-compact-number-field .compact-number-input:focus {
    outline: none;
    background: var(--lg-field-active-fill);
}
.glass-compact-number-field .compact-number-input[aria-invalid='true'] {
    border-color: var(--liquid-up);
}
.compact-number-input:disabled {
    opacity: 0.55;
}
@media (forced-colors: active) {
    .glass-compact-number-field .compact-number-input:focus-visible {
        outline: 2px solid Highlight;
        outline-offset: -2px;
    }
}
</style>
