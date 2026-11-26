<script setup lang="ts">
/** 日期区间共用边界与联动，外部仍分别持有起止日期。 */
import DateField from './DateField.vue';
import GlassDateField from './liquid-glass/GlassDateField.vue';

defineProps<{ fromLabel: string; toLabel: string; glass?: boolean }>();
const from = defineModel<string>('from', { required: true });
const to = defineModel<string>('to', { required: true });

function pickFrom(value: string) {
    from.value = value;
    if (to.value && to.value < value) to.value = value;
}
function pickTo(value: string) {
    to.value = value;
    if (from.value && from.value > value) from.value = value;
}
</script>

<template>
    <div class="date-range-field" role="group" aria-label="日期范围">
        <component
            :is="glass ? GlassDateField : DateField"
            :model-value="from"
            :label="fromLabel"
            :max="to"
            @update:model-value="pickFrom"
        />
        <span class="date-range-separator" aria-hidden="true">至</span>
        <component
            :is="glass ? GlassDateField : DateField"
            :model-value="to"
            :label="toLabel"
            :min="from"
            @update:model-value="pickTo"
        />
    </div>
</template>

<style scoped>
.date-range-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
}
.date-range-field > :is(.date-field, .glass-date-field) {
    flex: 0 1 var(--range-date-width, calc(168px * var(--fs-scale)));
    width: var(--range-date-width, calc(168px * var(--fs-scale)));
    min-width: 0;
    max-width: 100%;
}
.date-range-separator {
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>
