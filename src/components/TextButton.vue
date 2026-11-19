<script setup lang="ts">
/** 低频辅助操作只显示文字，可附图标；保留原生禁用、焦点及透传事件。 */
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

withDefaults(
    defineProps<{
        text: string;
        label?: string;
        icon?: IconName;
        disabled?: boolean;
    }>(),
    { label: '', disabled: false },
);
</script>

<template>
    <button
        type="button"
        class="text-btn"
        :title="label || text"
        :aria-label="label || text"
        :disabled="disabled"
    >
        <AppIcon v-if="icon" :name="icon" />
        <span>{{ text }}</span>
    </button>
</template>

<style scoped>
.text-btn {
    --icon-size: calc(12px * var(--fs-scale));

    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: var(--text-button-h, calc(26px * var(--fs-scale)));
    padding: 0 4px;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--fs-xs);
    line-height: 1.3;
    white-space: nowrap;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 3px;
    transition:
        color var(--t-quick) var(--ease-soft),
        text-decoration-color var(--t-quick) var(--ease-soft);
}
.text-btn:hover:not(:disabled) {
    color: var(--accent);
    text-decoration-color: currentColor;
}
.text-btn:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.text-btn:disabled {
    opacity: 0.42;
    cursor: default;
}
</style>
