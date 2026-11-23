<script setup lang="ts">
import { provide } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterView } from 'vue-router';
import { glassLedger } from '../../components/glass-ledger';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { loadLiquidRoster } from '../../liquid-ledger-data';

provide(glassLedger, {
    card: GlassCard,
    button: GlassButton,
    overlayClass: 'liquid-ledger liquid-tools',
});
onBeforeRouteLeave(confirmDiscardDrafts);
onBeforeRouteUpdate((to, from) => to.name === from.name || confirmDiscardDrafts());
</script>

<template>
    <RouterView v-slot="{ Component, route }">
        <component
            :is="Component"
            v-bind="route.name === 'tool-growth' ? { reloadRoster: loadLiquidRoster } : {}"
        />
    </RouterView>
</template>

<style src="./liquid-tools.css"></style>
