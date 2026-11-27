<script setup lang="ts">
import LiquidLedgerPage from '../../components/liquid-glass/LiquidLedgerPage.vue';
import { loadLiquidGoals, loadLiquidRoster } from '../../liquid-ledger-data';
import GoalsView from './GoalsView.vue';

function loadPage() {
    return Promise.all([loadLiquidGoals(), loadLiquidRoster()]);
}
</script>

<template>
    <LiquidLedgerPage
        title="目标"
        description="正在读取目标和角色…"
        overlay-class="liquid-ledger liquid-goals"
        :load="loadPage"
    >
        <GoalsView :reload-goals="loadLiquidGoals" :reload-roster="loadLiquidRoster" />
    </LiquidLedgerPage>
</template>
