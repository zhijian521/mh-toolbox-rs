<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { glassLedger } from '../../components/glass-ledger';
import { loadLiquidIncome } from '../../liquid-ledger-data';
import IncomeView from './IncomeView.vue';

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: 'liquid-ledger liquid-income',
});
const loading = ref(true);

onMounted(async () => {
    try {
        await loadLiquidIncome();
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <section
        v-if="loading"
        class="liquid-ledger liquid-ledger-page liquid-income liquid-income-page"
        aria-labelledby="liquid-income-loading-title"
    >
        <h1 id="liquid-income-loading-title">收益</h1>
        <p role="status">正在读取收益账本…</p>
    </section>
    <IncomeView v-else liquid />
</template>

<style src="./liquid-income.css"></style>
