<script setup lang="ts">
import { computed, inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';

defineOptions({ inheritAttrs: false });
const props = defineProps<{ layout?: string; modelValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const value = computed({
    get: () => props.modelValue ?? '',
    set: (next: string) => emit('update:modelValue', next),
});
const glass = inject(glassLedger, null);
</script>

<template>
    <GlassInput v-if="glass" :class="layout" class="character-text-field">
        <input v-model="value" v-bind="$attrs" />
    </GlassInput>
    <input v-else v-model="value" v-bind="$attrs" class="field" :class="layout" />
</template>

<style scoped>
.character-text-field {
    min-height: var(--character-input-h, 28px);
    padding-inline: 7px;
}
.character-text-field input {
    text-align: inherit;
}
</style>
