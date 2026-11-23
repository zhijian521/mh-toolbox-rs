<script setup lang="ts">
defineProps<{ title: string; desc?: string }>();
</script>

<template>
    <section class="liquid-income liquid-income-page" aria-labelledby="liquid-income-title">
        <header class="liquid-income-header">
            <h1 id="liquid-income-title">{{ title }}</h1>
            <div class="liquid-income-actions"><slot name="actions" /></div>
        </header>
        <slot />
    </section>
</template>
