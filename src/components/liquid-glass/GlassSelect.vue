<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import AppIcon from '../AppIcon.vue';
import { GlassCard, GlassMenu, GlassMenuItem } from './index';

const props = defineProps<{
    label: string;
    hideLabel?: boolean;
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
        <label :id="id + '-label'" :for="id" :hidden="hideLabel">{{ label }}</label>
        <GlassMenu v-model:open="open" class="lg-popup-menu lg-select-menu" @select="select">
            <template #trigger>
                <button
                    :id="id"
                    type="button"
                    class="glass-select-trigger lg-popup-trigger"
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
    width: 100%;
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
</style>
