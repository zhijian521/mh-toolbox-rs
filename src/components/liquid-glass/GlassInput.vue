<script setup lang="ts">
import type { InputHTMLAttributes } from 'vue';
import { GlassFieldSurface } from './index';

defineOptions({ inheritAttrs: false });
defineProps<FieldProps>();
interface FieldProps extends /* @vue-ignore */ Pick<
    InputHTMLAttributes,
    'autocomplete' | 'maxlength' | 'type' | 'placeholder' | 'required' | 'inputmode'
> {
    disabled?: boolean;
}
const value = defineModel<string>();
</script>

<template>
    <GlassFieldSurface radius="capsule" class="glass-input" v-bind="$slots.default ? $attrs : {}">
        <slot><input v-model="value" :disabled="disabled" v-bind="$attrs" /></slot>
    </GlassFieldSurface>
</template>

<style scoped>
.glass-input {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
    min-height: var(--lg-field-height);
    padding-inline: 14px;
    color: var(--liquid-ink);
    font-size: var(--fs-base);
}
.glass-input input,
.glass-input :slotted(input) {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
}
.glass-input:has(input:disabled) {
    opacity: 0.55;
}
</style>
