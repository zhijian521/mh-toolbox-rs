<script setup lang="ts">
import LiquidLedgerPage from '../../components/liquid-glass/LiquidLedgerPage.vue';
import { loadLiquidLedger, loadLiquidRoster } from '../../liquid-ledger-data';
import AccountsView from './AccountsView.vue';
</script>

<template>
    <LiquidLedgerPage
        title="账号"
        description="正在读取账号账本…"
        overlay-class="liquid-ledger liquid-accounts"
        :load="loadLiquidLedger"
    >
        <AccountsView :reload-ledger="loadLiquidLedger" :reload-roster="loadLiquidRoster" />
    </LiquidLedgerPage>
</template>

<style src="./liquid-accounts.css"></style>
