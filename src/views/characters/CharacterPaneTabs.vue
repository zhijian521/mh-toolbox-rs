<script setup lang="ts">
import { inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { PANE_OPTIONS, type PaneKey } from './character';

defineProps<{ label: string; prefix?: string }>();
const pane = defineModel<PaneKey>({ required: true });
const glass = inject(glassLedger, null);
</script>

<template>
    <GlassSegmented v-if="glass" v-model:value="pane" :aria-label="label" class="character-tabs">
        <GlassSegment
            v-for="option in PANE_OPTIONS"
            :id="prefix && `${prefix}-tab-${option.value}`"
            :key="option.value"
            :value="option.value"
            :aria-controls="prefix && `${prefix}-pane-${option.value}`"
            >{{ option.label }}</GlassSegment
        >
    </GlassSegmented>
    <SteppedSlider
        v-else
        v-model="pane"
        :options="PANE_OPTIONS"
        :label="label"
        :prefix="prefix"
        :as="prefix ? 'tab' : 'radio'"
    />
</template>

<style scoped>
.character-tabs {
    max-width: 100%;
    min-width: 0;
}
.character-tabs > glass-segment {
    flex: 1 1 0;
    padding-inline: 3px;
    min-width: 0;
    white-space: nowrap;
}
</style>
