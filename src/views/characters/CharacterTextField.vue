<script setup lang="ts">
import type { InputHTMLAttributes } from 'vue';
import { inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassCompactField from '../../components/liquid-glass/GlassCompactField.vue';

defineOptions({ inheritAttrs: false });
defineProps<FieldProps>();
interface FieldProps extends /* @vue-ignore */ Pick<
    InputHTMLAttributes,
    'required' | 'autocomplete' | 'maxlength' | 'placeholder' | 'type'
> {
    layout?: string;
    compact?: boolean;
}
const value = defineModel<string>({ default: '' });
const glass = inject(glassLedger, null);
</script>

<template>
    <GlassCompactField v-if="glass && compact" :class="layout">
        <input v-model="value" v-bind="$attrs" />
    </GlassCompactField>
    <GlassInput v-else-if="glass" :class="layout" class="character-text-field">
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
