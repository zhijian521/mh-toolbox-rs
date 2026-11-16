<script setup lang="ts">
import SlotButton from './SlotButton.vue';
import { useLoadRecovery } from '../composables/use-load-recovery';

const props = withDefaults(
    defineProps<{ error: string; load: () => Promise<void>; blocked?: boolean }>(),
    { blocked: false },
);
const { loading, failure, canRetry, retryLoad } = useLoadRecovery(
    props.load,
    () => props.error,
    () => props.blocked,
);
</script>

<template>
    <p v-if="error" class="note error" role="alert" :aria-busy="loading">
        {{ failure || error }}
        <SlotButton
            :text="loading ? '读取中…' : '重新读取'"
            label="重新读取数据"
            :disabled="!canRetry"
            @click="retryLoad"
        />
        <span v-if="blocked">请先结束编辑或重试保存，再重新读取。</span>
    </p>
</template>
