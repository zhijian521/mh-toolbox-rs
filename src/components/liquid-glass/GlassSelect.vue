<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import AppIcon from '../AppIcon.vue';
import { GlassCard, GlassMenu, GlassMenuItem } from './index';

const props = defineProps<{
    label: string;
    options: readonly { value: string; label: string }[];
    disabled?: boolean;
}>();
const value = defineModel<string>({ required: true });
const id = useId();
const open = ref(false);
const disabled = computed(() => props.disabled || !props.options.length);
const selected = computed(() => props.options.find((option) => option.value === value.value));

watch(disabled, (locked) => {
    if (locked) open.value = false;
});

function select(next: string) {
    if (!disabled.value && next !== value.value) value.value = next;
}

function onEscape(event: KeyboardEvent) {
    // 菜单处理过的 Esc 只收起选项，下一次 Esc 才交给外层弹窗。
    if (event.defaultPrevented) event.stopPropagation();
}
</script>

<template>
    <div class="glass-select" @keydown.esc="onEscape" @toggle.stop>
        <label :id="id + '-label'" :for="id">{{ label }}</label>
        <GlassMenu v-model:open="open" @select="select">
            <template #trigger>
                <button
                    :id="id"
                    type="button"
                    class="glass-select-trigger"
                    :disabled="disabled"
                    :aria-labelledby="id + '-label ' + id + '-value'"
                >
                    <GlassCard class="glass-select-face" radius="capsule">
                        <span :id="id + '-value'">{{ selected?.label ?? '请选择' }}</span>
                        <AppIcon name="chevron-down" />
                    </GlassCard>
                </button>
            </template>
            <GlassMenuItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
                group="selection"
                checkable
                :checked="value === option.value"
                :aria-checked="value === option.value"
                :role="open ? 'menuitemradio' : undefined"
            >{{ option.label }}</GlassMenuItem>
        </GlassMenu>
    </div>
</template>

<style scoped>
.glass-select {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
    color: var(--liquid-ink);
}
.glass-select label {
    color: var(--glass-select-label-color, inherit);
    font-size: var(--fs-xs);
}
.glass-select-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--fs-base);
    text-align: start;
    cursor: pointer;
}
.glass-select-face {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--glass-select-height, var(--glass-search-height));
    padding-inline: 14px 12px;
    pointer-events: none;
}
.glass-select-face > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 菜单的展开动画会逐帧写入内联 opacity，选择器需要持续显示当前值。 */
.glass-select-trigger:enabled {
    opacity: 1 !important;
}
.glass-select-trigger[aria-expanded='true'] .glass-select-face {
    outline: 1px solid color-mix(in srgb, var(--liquid-focus) 48%, transparent);
    outline-offset: -1px;
}
.glass-select-trigger:disabled {
    opacity: 0.5;
    pointer-events: none;
}
.glass-select glass-menu {
    min-width: 0;
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
}
.glass-select glass-menu::part(panel) {
    background-color: light-dark(rgb(246 251 248 / 0.68), rgb(25 37 34 / 0.76));
}
.glass-select glass-menu:not([open])::part(panel) {
    opacity: 0;
    pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
    .glass-select glass-menu:not([open])::part(panel) {
        transition: opacity 80ms ease-out;
    }
}
.glass-select glass-menu-item {
    min-height: 32px;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    color: var(--liquid-ink);
    letter-spacing: normal;
    overflow-wrap: anywhere;
}
</style>
