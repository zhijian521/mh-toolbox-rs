<script setup lang="ts" generic="T extends string">
import { inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import SegmentedPills from '../../components/SegmentedPills.vue';

const props = defineProps<{
    label: string;
    options: { value: T; label: string }[];
    disabled?: boolean;
}>();
const value = defineModel<T>({ required: true });
const glass = inject(glassLedger, null);

function select(next: string) {
    const option = props.options.find((one) => one.value === next);
    if (option && !props.disabled) value.value = option.value;
}
</script>

<template>
    <GlassSegmented
        v-if="glass"
        :value="value"
        class="lg-status-tabs"
        data-size="compact"
        :aria-label="label"
        @update:value="select"
    >
        <GlassSegment
            v-for="one in options"
            :key="one.value"
            :value="one.value"
            :disabled="disabled"
        >
            {{ one.label }}
        </GlassSegment>
    </GlassSegmented>
    <SegmentedPills
        v-else
        v-model="value"
        :options="options"
        :label="label"
        :disabled="disabled"
        wrap
    />
</template>
