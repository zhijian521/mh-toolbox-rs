<template>
    <table class="glass-table">
        <slot />
    </table>
</template>

<style scoped>
.glass-table {
    width: 100%;
    border: 1px solid var(--liquid-outline);
    border-spacing: 0;
    border-collapse: separate;
    border-radius: 12px;
    background: var(--lg-bar-fill);
    color: var(--liquid-ink);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.glass-table :deep(:where(th, td)) {
    padding: 7px 9px;
    text-align: start;
    vertical-align: middle;
}
.glass-table :deep(th) {
    background: var(--lg-field-fill);
    color: var(--liquid-muted);
    font-weight: 400;
}
.glass-table :deep(th:first-child) { border-start-start-radius: 11px; }
.glass-table :deep(th:last-child) { border-start-end-radius: 11px; }
.glass-table :deep(tbody td) {
    border-block-start: 1px solid var(--liquid-outline);
}
</style>
