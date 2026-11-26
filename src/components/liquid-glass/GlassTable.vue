<script setup lang="ts">
defineProps<{ stickyHeader?: boolean }>();
</script>

<template>
    <table class="glass-table" :class="{ 'has-sticky-header': stickyHeader }">
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
    box-shadow: var(--lg-edge-rim);
    color: var(--liquid-ink);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.glass-table :deep(:where(th, td)) {
    padding: 8px 10px;
    text-align: start;
    vertical-align: middle;
}
.glass-table :deep(:is(th, td)[data-align='end']) {
    text-align: end;
}
.glass-table :deep(thead) {
    border-start-start-radius: 11px;
    border-start-end-radius: 11px;
    background: var(--lg-table-header-fill);
}
/* 整条表头共用一层磨砂，避免跨列断开，也压住从下方滚过的文字。 */
@media not (prefers-reduced-transparency: reduce) {
    .glass-table :deep(thead) {
        backdrop-filter: blur(10px);
    }
}
@media (prefers-reduced-transparency: reduce) {
    .glass-table :deep(thead) {
        background: var(--lg-popup-solid);
    }
}
.glass-table :deep(thead th) {
    box-shadow:
        inset 0 1px 0 var(--lg-edge-light),
        inset 0 -1px 0 var(--liquid-outline);
    color: var(--liquid-muted);
    font-size: var(--fs-xs);
    font-weight: 400;
}
.glass-table :deep(thead tr:first-child th:first-child) {
    border-start-start-radius: 11px;
}
.glass-table :deep(thead tr:first-child th:last-child) {
    border-start-end-radius: 11px;
}
.glass-table :deep(tbody:last-child tr:last-child > :first-child) {
    border-end-start-radius: 11px;
}
.glass-table :deep(tbody:last-child tr:last-child > :last-child) {
    border-end-end-radius: 11px;
}
.glass-table :deep(tbody tr:nth-child(even) > :is(th, td)) {
    background: color-mix(in srgb, var(--lg-field-fill) 45%, transparent);
}
.glass-table :deep(tbody tr:is(:hover, :focus-within) > :is(th, td)) {
    background: color-mix(in srgb, var(--liquid-focus) 10%, var(--lg-field-fill));
}
.glass-table.has-sticky-header :deep(thead) {
    position: sticky;
    top: 0;
    z-index: 1;
}
</style>
