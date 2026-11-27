<script setup lang="ts">
import LiquidLedgerPage from '../../components/liquid-glass/LiquidLedgerPage.vue';
import { loadLiquidGoals, loadLiquidRoster } from '../../liquid-ledger-data';
import CharactersView from '../CharactersView.vue';
</script>

<template>
    <LiquidLedgerPage
        title="角色"
        description="正在读取角色名册…"
        overlay-class="liquid-ledger liquid-characters"
        :load="loadLiquidRoster"
    >
        <CharactersView :reload-roster="loadLiquidRoster" :ensure-goals="loadLiquidGoals" />
    </LiquidLedgerPage>
</template>

<style src="./liquid-characters.css"></style>
