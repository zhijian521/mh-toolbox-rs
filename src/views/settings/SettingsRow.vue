<script setup lang="ts">
/** 设置领域共用的标签／控件排版；不持有偏好或账本状态。 */
defineProps<{ label?: string; layout?: 'grid' | 'glass' }>();
</script>

<template>
    <div class="settings-row" :class="{ 'settings-row--glass': layout === 'glass' }">
        <slot name="label">
            <span :class="{ 'field-label': layout !== 'glass' }">{{ label }}</span>
        </slot>
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
.settings-row--glass {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px 12px;
    min-height: 44px;
    padding-block: 6px;
    border-top: 1px solid var(--liquid-outline);
}
.settings-row + .settings-row--glass {
    margin-top: 0;
}
.settings-row--glass .settings-control {
    max-width: 100%;
}
.settings-row--glass .settings-options {
    justify-content: flex-end;
}
</style>
