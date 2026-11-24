<script setup lang="ts">
import { GlassCard } from './index';
</script>

<template>
    <GlassCard class="glass-empty-state" :radius="14" :bezel="3" :refraction="5" :specular="0.48" shadow="none" role="status"><slot>暂无数据</slot></GlassCard>
</template>

<style scoped>
.glass-empty-state {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: block;
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
    padding: 10px 20px;
    font-size: var(--fs-sm);
    text-align: center;
}
</style>
