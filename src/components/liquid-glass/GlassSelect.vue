<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import GlassMenuTrigger from './GlassMenuTrigger.vue';
import { GlassMenu, GlassMenuItem } from './index';

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
                <GlassMenuTrigger
                    :id="id"
                    :disabled="disabled"
                    :aria-labelledby="id + '-label ' + id + '-value'"
                    :value-id="id + '-value'"
                    :text="selected?.label ?? '请选择'"
                />
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
</style>
