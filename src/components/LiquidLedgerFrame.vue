<script setup lang="ts">
import { useId } from 'vue';

defineProps<{ title: string; desc?: string }>();
const titleId = useId();
</script>

<template>
    <section class="liquid-ledger liquid-ledger-page" :aria-labelledby="titleId">
        <header class="liquid-ledger-header">
            <h1 :id="titleId">{{ title }}</h1>
            <div class="liquid-ledger-actions"><slot name="actions" /></div>
        </header>
        <slot />
    </section>
</template>
