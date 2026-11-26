<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { glassLedger } from '../../components/glass-ledger';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { loadLiquidLedger, loadLiquidRoster } from '../../liquid-ledger-data';
import AccountsView from './AccountsView.vue';

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: 'liquid-ledger liquid-accounts',
});
const loading = ref(true);
onBeforeRouteLeave(confirmDiscardDrafts);

onMounted(async () => {
    try {
        await loadLiquidLedger();
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <section
        v-if="loading"
        class="liquid-ledger liquid-ledger-page"
        aria-labelledby="accounts-loading-title"
    >
        <h1 id="accounts-loading-title">账号</h1>
        <p role="status">正在读取账号账本…</p>
    </section>
    <AccountsView v-else :reload-ledger="loadLiquidLedger" :reload-roster="loadLiquidRoster" />
</template>

<style src="./liquid-accounts.css"></style>
