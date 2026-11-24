<script setup lang="ts">
import NumberField from '../NumberField.vue';
import GlassInput from './GlassInput.vue';

defineOptions({ inheritAttrs: false });
defineProps<{ label: string; updateOnInput?: boolean }>();
const value = defineModel<number>({ required: true });
</script>

<template>
    <GlassInput class="glass-number-field">
        <NumberField v-model="value" bare :label="label" :update-on-input="updateOnInput" v-bind="$attrs" />
    </GlassInput>
</template>

<style scoped>
.glass-number-field {
    padding-inline: 8px;
    font-variant-numeric: tabular-nums;
}
.glass-number-field :deep(input.number-field) {
    width: 100%;
    min-width: 0;
    padding: 0;
    text-align: var(--number-align, end);
}
</style>
