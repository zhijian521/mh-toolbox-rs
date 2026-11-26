<script setup lang="ts">
import NumberField from '../NumberField.vue';
import GlassCompactField from './GlassCompactField.vue';

defineOptions({ inheritAttrs: false });
const props = defineProps<{
    class?: string;
    label: string;
    wide?: boolean;
    updateOnInput?: boolean;
}>();
const value = defineModel<number>({ required: true });
</script>

<template>
    <GlassCompactField :class="props.class" :wide="wide">
        <NumberField
            v-model="value"
            bare
            class="compact-number-input"
            :label="label"
            :update-on-input="updateOnInput"
            v-bind="$attrs"
        />
    </GlassCompactField>
</template>
