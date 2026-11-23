<script setup lang="ts">
import { GlassCard } from './index';

defineOptions({ inheritAttrs: false });
const value = defineModel<string>();
</script>

<template>
    <GlassCard radius="capsule" class="glass-input" v-bind="$slots.default ? $attrs : {}">
        <slot><input v-model="value" v-bind="$attrs" /></slot>
    </GlassCard>
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
    min-height: var(--glass-input-height, var(--glass-search-height));
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
