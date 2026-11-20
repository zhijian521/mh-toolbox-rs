<script setup lang="ts">
/** 设置领域共用的标签／控件排版；不持有偏好或账本状态。 */
defineProps<{ label: string }>();
</script>

<template>
    <div class="settings-row">
        <span class="field-label">{{ label }}</span>
        <div class="settings-control">
            <div class="settings-options"><slot /></div>
            <slot name="detail" />
        </div>
    </div>
</template>

<style scoped>
.settings-row {
    display: grid;
    grid-template-columns: 3em minmax(0, 1fr);
    align-items: start;
    gap: 12px;
}
.field-label {
    padding-top: 7px;
    white-space: nowrap;
}
.settings-control {
    min-width: 0;
}
.settings-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.settings-row + .settings-row {
    margin-top: 16px;
}
</style>
