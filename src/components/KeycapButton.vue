<script setup lang="ts">
/** 原生键帽按钮；active 只标记业务状态，点击、禁用和焦点仍由按钮及调用方负责。 */
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

withDefaults(
    defineProps<{
        label: string;
        text?: string;
        icon?: IconName;
        active?: boolean;
        indicator?: boolean;
        disabled?: boolean;
    }>(),
    { text: '', active: false, indicator: false, disabled: false },
);
</script>

<template>
    <button
        type="button"
        class="keycap-btn"
        :class="{ 'is-active': active }"
        :title="label"
        :aria-label="label"
        :disabled="disabled"
    >
        <span class="keycap-face">
            <span v-if="indicator" class="keycap-indicator" aria-hidden="true" />
            <AppIcon v-if="icon" :name="icon" />
            <slot
                ><span v-if="text">{{ text }}</span></slot
            >
        </span>
    </button>
</template>

<style scoped>
.keycap-btn {
    --icon-size: calc(15px * var(--fs-scale));

    position: relative;
    display: flex;
    min-width: 0;
    min-height: var(--keycap-min-h, calc(42px * var(--fs-scale)));
    padding: 2px 3px 5px;
    border: var(--w-hair) solid var(--keycap-edge);
    border-radius: var(--keycap-radius, 9px);
    background: var(--keycap-base);
    box-shadow: var(--keycap-shadow);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-base);
    line-height: 1.3;
    text-align: center;
    cursor: pointer;
}
.keycap-face {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    padding: var(--keycap-pad, 6px 10px);
    border-radius: calc(var(--keycap-radius, 9px) - 2px);
    background-color: var(--keycap-face);
    background-image: var(--keycap-face-image);
    box-shadow: var(--keycap-face-shadow);
    transition:
        transform var(--t-quick) var(--ease-snap),
        background-color var(--t-quick) var(--ease-soft);
}
/* 悬停不移动；按压只下沉键面，不改变按钮占位或相邻控件的位置。 */
.keycap-btn:active:not(:disabled) > .keycap-face {
    transform: translateY(1.5px);
}
.keycap-indicator {
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--keycap-indicator);
    box-shadow: inset 0 1px 0 var(--bevel-hi);
}
.keycap-btn.is-active {
    color: var(--ink);
    opacity: 1;
}
.keycap-btn:disabled {
    cursor: default;
}
.keycap-btn:disabled:not(.is-active) {
    opacity: 0.45;
}
.keycap-btn:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
</style>
