<script setup lang="ts">
import { GlassCard } from './index';
</script>

<template>
    <GlassCard class="glass-empty-state" :radius="14" role="status">暂无数据</GlassCard>
</template>

<style scoped>
.glass-empty-state {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: block;
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
    padding: 14px 24px;
    font-size: var(--fs-base);
    text-align: center;
}
</style>
