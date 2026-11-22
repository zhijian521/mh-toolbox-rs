<script setup lang="ts">
import { ref, watch, watchPostEffect } from 'vue';
import { GlassSheet } from './index';

const props = defineProps<{ open: boolean; bottom?: boolean; noDismiss?: boolean; detents?: string; label: string }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const panel = ref<HTMLDialogElement | null>(null);
const desktop = ref(false);
let backdropPress = false;

// 每次打开时选取呈现方式，调整窗口大小不会卸载正在编辑的表单。
watch(
    () => props.open,
    (open) => {
        if (open) desktop.value = window.matchMedia('(min-width: 640px)').matches;
    },
    { immediate: true },
);
watchPostEffect(() => {
    const dialog = panel.value;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
});

function dismiss() {
    if (!props.noDismiss) emit('update:open', false);
}
</script>

<template>
    <dialog
        v-if="desktop && !bottom"
        ref="panel"
        class="glass-dialog"
        :aria-label="label"
        @cancel.prevent="dismiss"
        @pointerdown="backdropPress = $event.target === panel"
        @click.self="backdropPress && dismiss()"
    >
        <div class="glass-dialog-body"><slot /></div>
    </dialog>
    <GlassSheet
        v-else
        :open="open"
        :detents="detents"
        :no-dismiss="noDismiss"
        :aria-label="label"
        modal
        @update:open="emit('update:open', $event)"
    >
        <slot />
    </GlassSheet>
</template>

<style scoped>
.glass-dialog {
    width: min(var(--glass-dialog-width, 460px), calc(100% - 32px));
    max-height: calc(100dvh - 48px);
    margin: auto;
    padding: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid light-dark(#ffffffbb, #c5dad849);
    border-radius: 20px;
    color: var(--liquid-ink);
    background: light-dark(rgb(245 252 249 / 0.66), rgb(21 34 35 / 0.74));
    box-shadow: 0 16px 54px rgb(12 28 25 / 0.19), inset 0 1px rgb(255 255 255 / 0.13);
    backdrop-filter: blur(10px);
    font: inherit;
}
.glass-dialog::backdrop {
    background: rgb(12 23 24 / 0.22);
    backdrop-filter: blur(3px);
}
.glass-dialog-body {
    padding: 18px 20px;
}
@media (prefers-reduced-transparency: reduce) {
    .glass-dialog {
        background: light-dark(#f4f8f6, #182426);
        backdrop-filter: none;
    }
}
</style>
