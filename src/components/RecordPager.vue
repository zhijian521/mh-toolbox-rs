<script setup lang="ts">
import PressButton from './PressButton.vue';

withDefaults(
    defineProps<{
        modelValue: number;
        pages: number;
        label?: string;
        previousLabel?: string;
        nextLabel?: string;
    }>(),
    { label: '记录分页', previousLabel: '上一页', nextLabel: '下一页' },
);
const emit = defineEmits<{ 'update:modelValue': [page: number] }>();
</script>

<template>
    <nav v-if="pages > 1" class="record-pager" :aria-label="label">
        <PressButton
            text="上一页"
            :label="previousLabel"
            :disabled="modelValue <= 1"
            @click="emit('update:modelValue', modelValue - 1)"
        />
        <span aria-live="polite"
            ><slot>{{ modelValue }} / {{ pages }}</slot></span
        >
        <PressButton
            text="下一页"
            :label="nextLabel"
            :disabled="modelValue >= pages"
            @click="emit('update:modelValue', modelValue + 1)"
        />
    </nav>
</template>

<style scoped>
.record-pager {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
</style>
