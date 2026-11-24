<script setup lang="ts">
import AppNotice from './AppNotice.vue';
import SlotButton from './SlotButton.vue';

defineProps<{ error: string; pending: number }>();
defineEmits<{ retry: [] }>();
</script>

<template>
    <AppNotice v-if="error" tone="error" class="note error" role="status">
        {{ error }}
        <SlotButton
            text="重试保存"
            label="重试保存未落盘的改动"
            :disabled="pending > 0"
            @click="$emit('retry')"
        />
    </AppNotice>
</template>
