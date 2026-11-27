<script setup lang="ts">
import { nextTick, onMounted, provide, ref, useId } from 'vue';
import { glassLedger } from '../glass-ledger';
import { startLiquidTiming } from '../../liquid-timing';
import { GlassButton, GlassCard } from './index';

const props = defineProps<{
    title: string;
    description: string;
    overlayClass: string;
    load: () => Promise<unknown>;
}>();
const titleId = useId();
const loading = ref(true);
const error = ref('');

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: props.overlayClass,
});

async function read() {
    const endReading = startLiquidTiming('账本读取', props.title);
    loading.value = true;
    error.value = '';
    try {
        await props.load();
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '读取失败，请重试';
    } finally {
        endReading?.();
        const endMount = !error.value && startLiquidTiming('账本内容挂载', props.title);
        loading.value = false;
        if (endMount) await nextTick(endMount);
    }
}

onMounted(read);
</script>

<template>
    <section
        v-if="loading || error"
        class="liquid-ledger liquid-ledger-page"
        :class="overlayClass"
        :aria-labelledby="titleId"
    >
        <h1 :id="titleId">{{ title }}</h1>
        <p v-if="loading" role="status">{{ description }}</p>
        <template v-else>
            <p role="alert">{{ error }}</p>
            <GlassButton size="small" @click="read">重试</GlassButton>
        </template>
    </section>
    <slot v-else />
</template>
