<script setup lang="ts">
import PressButton from '../../components/PressButton.vue';

defineProps<{ modelValue: number; pages: number }>();
const emit = defineEmits<{ 'update:modelValue': [page: number] }>();
</script>

<template>
    <nav v-if="pages > 1" class="record-pager" aria-label="记录分页">
        <PressButton
            text="上一页"
            label="上一页"
            :disabled="modelValue <= 1"
            @click="emit('update:modelValue', modelValue - 1)"
        />
        <span aria-live="polite">{{ modelValue }} / {{ pages }}</span>
        <PressButton
            text="下一页"
            label="下一页"
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
