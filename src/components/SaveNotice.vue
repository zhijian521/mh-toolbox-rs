<script setup lang="ts">
import SlotButton from './SlotButton.vue';

defineProps<{ error: string; pending: number }>();
defineEmits<{ retry: [] }>();
</script>

<template>
    <p v-if="error" class="note error" role="status">
        {{ error }}
        <SlotButton
            text="重试保存"
            label="重试保存未落盘的改动"
            :disabled="pending > 0"
            @click="$emit('retry')"
        />
    </p>
</template>
