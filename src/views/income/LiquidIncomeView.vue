<script setup lang="ts">
import LiquidLedgerPage from '../../components/liquid-glass/LiquidLedgerPage.vue';
import { loadLiquidIncome } from '../../liquid-ledger-data';
import IncomeView from './IncomeView.vue';
</script>

<template>
    <LiquidLedgerPage
        title="收益"
        description="正在读取收益账本…"
        overlay-class="liquid-ledger liquid-income"
        :load="loadLiquidIncome"
    >
        <IncomeView liquid />
    </LiquidLedgerPage>
</template>

<style src="./liquid-income.css"></style>
