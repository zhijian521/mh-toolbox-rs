<script setup lang="ts">
import AppIcon from '../AppIcon.vue';
import PriceField from '../PriceField.vue';
import { GlassButton } from './index';
import GlassInput from './GlassInput.vue';

withDefaults(
    defineProps<{
        label?: string;
        unit?: '万' | '元';
        precision?: number;
        error?: string;
        disabled?: boolean;
        compact?: boolean;
        reserveError?: boolean;
    }>(),
    { label: '价格' },
);
const emit = defineEmits<{ blur: [event: FocusEvent] }>();
const value = defineModel<number | null>({ required: true });
</script>

<template>
    <PriceField
        v-model="value"
        class="glass-price-field"
        :class="{ compact }"
        :well-component="GlassInput"
        :label="label"
        :unit="unit"
        :precision="precision"
        :error="error"
        :disabled="disabled"
        :reserve-error="reserveError"
        :size="compact ? 'md' : 'lg'"
        placeholder="0"
        stepper
        @blur="emit('blur', $event)"
    >
        <template #step="control">
            <GlassButton
                size="small"
                shape="circle"
                :aria-label="control.label"
                :title="control.label"
                :disabled="control.disabled"
                @click="control.step()"
            >
                <AppIcon :name="control.icon" />
            </GlassButton>
        </template>
    </PriceField>
</template>

<style scoped>
.glass-price-field {
    --glass-input-height: 44px;
    --price-well-width: 180px;
    --price-figure-size: var(--fs-xl);
    align-items: center;
    width: 100%;
    min-width: 0;
    color: var(--liquid-ink);
}
.glass-price-field.compact {
    --glass-input-height: 36px;
    --price-well-width: 156px;
    --price-figure-size: var(--fs-amount);
}
.glass-price-field :deep(.field-label),
.glass-price-field :deep(.pf-unit) {
    color: var(--liquid-muted, var(--liquid-ink));
    font-size: var(--fs-sm);
}
.glass-price-field :deep(.glass-input) {
    flex: 0 1 var(--price-well-width);
    justify-content: center;
    gap: 3px;
}
.glass-price-field :deep(input.pf-input) {
    font-size: var(--price-figure-size);
    font-variant-numeric: tabular-nums;
    text-align: center;
}
.glass-price-field glass-button {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    --icon-size: 15px;
    flex: none;
}
.glass-price-field :deep(.pf-hint) {
    min-height: 1.4em;
    color: var(--liquid-up, light-dark(#923b3b, #ffb8ae));
    font-size: var(--fs-xs);
    text-align: center;
}
</style>
