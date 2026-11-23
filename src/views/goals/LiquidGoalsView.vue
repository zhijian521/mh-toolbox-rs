<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { glassLedger } from '../../components/glass-ledger';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { loadLiquidGoals, loadLiquidRoster } from '../../liquid-ledger-data';
import GoalsView from './GoalsView.vue';

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: 'liquid-ledger liquid-goals',
});
const loading = ref(true);
onBeforeRouteLeave(confirmDiscardDrafts);

onMounted(async () => {
    try {
        await Promise.all([loadLiquidGoals(), loadLiquidRoster()]);
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <section v-if="loading" class="liquid-ledger liquid-ledger-page" aria-labelledby="goals-loading-title">
        <h1 id="goals-loading-title">目标</h1>
        <p role="status">正在读取目标和角色…</p>
    </section>
    <GoalsView v-else :reload-goals="loadLiquidGoals" :reload-roster="loadLiquidRoster" />
</template>
