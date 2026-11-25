<script setup lang="ts">
import AppIcon from '../AppIcon.vue';
import { GlassButton } from './index';

defineProps<{ pages: number; label: string }>();
const page = defineModel<number>('page', { required: true });
</script>

<template>
    <nav v-if="pages > 1" class="glass-compact-pager" :aria-label="label">
        <GlassButton
            class="lg-inline-action"
            size="small"
            shape="circle"
            aria-label="上一页"
            :disabled="page <= 1"
            @click="page--"
        >
            <AppIcon name="chevron-left" />
        </GlassButton>
        <span aria-live="polite">{{ page }} / {{ pages }}</span>
        <GlassButton
            class="lg-inline-action"
            size="small"
            shape="circle"
            aria-label="下一页"
            :disabled="page >= pages"
            @click="page++"
        >
            <AppIcon name="chevron-right" />
        </GlassButton>
    </nav>
</template>

<style scoped>
.glass-compact-pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.glass-compact-pager glass-button {
    --icon-size: 14px;
}
</style>
