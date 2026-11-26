<script setup lang="ts">
/** 收益与上线历史共用角色筛选，小计仍由各自账本计算。 */
import { inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import SteppedSlider from '../../components/SteppedSlider.vue';

defineProps<{ options: { value: string; label: string }[]; label: string }>();
const value = defineModel<string>({ required: true });
const glass = inject(glassLedger, null);
</script>

<template>
    <GlassSegmented
        v-if="glass"
        v-model:value="value"
        class="lg-status-tabs income-role-filter"
        data-size="compact"
        :aria-label="label"
    >
        <GlassSegment
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :title="option.label"
        >
            <slot name="option" :option="option">{{ option.label }}</slot>
        </GlassSegment>
    </GlassSegmented>
    <SteppedSlider v-else v-model="value" :options="options" :label="label">
        <template #option="{ option }">
            <slot name="option" :option="option">{{ option.label }}</slot>
        </template>
    </SteppedSlider>
</template>

<style scoped>
.income-role-filter {
    min-width: max-content;
}
.income-role-filter > glass-segment {
    display: flex;
    align-items: center;
    gap: 6px;
}
</style>
