<script setup lang="ts">
defineProps<{
    items: readonly { key: string; label: string; text: string; unit?: string; exact?: string }[];
}>();
</script>

<template>
    <dl class="resource-grid">
        <div v-for="item in items" :key="item.key" class="resource-cell">
            <dt>{{ item.label }}</dt>
            <dd :title="item.exact ? item.label + ' ' + item.exact : undefined">
                <span>{{ item.text }}</span
                ><small v-if="item.unit">{{ item.unit }}</small>
            </dd>
        </div>
    </dl>
</template>

<style scoped>
.resource-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 0;
}
.resource-cell {
    display: grid;
    grid-template-rows: auto 1fr;
    flex: 1 1 92px;
    min-width: min(100%, 92px);
    max-width: 100%;
    min-height: 50px;
    box-sizing: border-box;
    padding: 5px 10px;
    border-radius: var(--r-2);
    background: var(--ledger-surface, var(--paper-2));
}
.resource-grid dt {
    color: var(--ink-2);
    font-size: var(--fs-xs);
    line-height: 1.3;
    overflow-wrap: anywhere;
}
.resource-grid dd {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 4px;
    align-self: center;
    margin: 3px 0 0;
    color: var(--goal-progress-color, var(--accent));
    font-size: var(--fs-md);
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    text-align: center;
    overflow-wrap: anywhere;
}
.resource-grid dd small {
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
