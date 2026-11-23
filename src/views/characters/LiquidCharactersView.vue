<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { glassLedger } from '../../components/glass-ledger';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { loadLiquidGoals, loadLiquidRoster } from '../../liquid-ledger-data';
import CharactersView from '../CharactersView.vue';

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: 'liquid-ledger liquid-characters',
});
const loading = ref(true);
onBeforeRouteLeave(confirmDiscardDrafts);

onMounted(async () => {
    try {
        await loadLiquidRoster();
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <section v-if="loading" class="liquid-ledger liquid-ledger-page" aria-labelledby="characters-loading-title">
        <h1 id="characters-loading-title">角色</h1>
        <p role="status">正在读取角色名册…</p>
    </section>
    <CharactersView v-else :reload-roster="loadLiquidRoster" :ensure-goals="loadLiquidGoals" />
</template>

<style src="./liquid-characters.css"></style>
