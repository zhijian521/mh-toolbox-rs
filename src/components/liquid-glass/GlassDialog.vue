<script setup lang="ts">
import { ref, watch, watchPostEffect } from 'vue';
import { GlassSheet } from './index';

const props = defineProps<{
    open: boolean;
    bottom?: boolean;
    noDismiss?: boolean;
    lazy?: boolean;
    detents?: string;
    label: string;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const panel = ref<HTMLDialogElement | null>(null);
const desktop = ref(false);
const sheet = ref<{ el: HTMLElement | null } | null>(null);
const leavingContent = ref(false);
let backdropPress = false;

// 每次打开时选取呈现方式，调整窗口大小不会卸载正在编辑的表单。
watch(
    () => props.open,
    (open) => {
        if (open) desktop.value = window.matchMedia('(min-width: 640px)').matches;
    },
    { immediate: true },
);
watchPostEffect((onCleanup) => {
    const dialog = panel.value;
    if (dialog && props.open && !dialog.open) dialog.showModal();
    if (dialog && !props.open && dialog.open) dialog.close();
    if (!props.lazy) return;
    if (props.open) {
        leavingContent.value = true;
        return;
    }
    if (!leavingContent.value) return;

    // 原生 dialog 等实际过渡；sheet 在弹簧归位后才撤下 data-visible。
    if (dialog) {
        let canceled = false;
        onCleanup(() => { canceled = true; });
        void Promise.allSettled(dialog.getAnimations().map((motion) => motion.finished)).then(() => {
            if (!canceled && !props.open) leavingContent.value = false;
        });
        return;
    }
    const host = sheet.value?.el;
    if (!host?.hasAttribute('data-visible')) {
        leavingContent.value = false;
        return;
    }
    const observer = new MutationObserver(() => {
        if (!props.open && !host.hasAttribute('data-visible')) leavingContent.value = false;
    });
    observer.observe(host, { attributes: true, attributeFilter: ['data-visible'] });
    onCleanup(() => observer.disconnect());
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
        <div class="glass-dialog-body"><slot v-if="!lazy || open || leavingContent" /></div>
    </dialog>
    <GlassSheet
        ref="sheet"
        v-else
        :open="open"
        :detents="detents"
        :no-dismiss="noDismiss"
        :aria-label="label"
        modal
        @update:open="emit('update:open', $event)"
    >
        <slot v-if="!lazy || open || leavingContent" />
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
@media (prefers-reduced-motion: no-preference) {
    /* display 和 overlay 延后切换，原生 close() 归还焦点时玻璃仍能完成淡出。 */
    .glass-dialog,
    .glass-dialog::backdrop {
        opacity: 0;
        transition:
            opacity 160ms ease-in,
            transform 160ms ease-in,
            display 160ms allow-discrete,
            overlay 160ms allow-discrete;
    }
    .glass-dialog {
        transform: scale(0.975);
    }
    .glass-dialog[open],
    .glass-dialog[open]::backdrop {
        opacity: 1;
        transition-duration: 220ms;
        transition-timing-function: cubic-bezier(0.2, 0.8, 0.25, 1);
    }
    .glass-dialog[open] {
        transform: none;
    }
    @starting-style {
        .glass-dialog[open],
        .glass-dialog[open]::backdrop {
            opacity: 0;
        }
        .glass-dialog[open] {
            transform: scale(0.965);
        }
    }
    .glass-dialog:not([open]),
    .glass-dialog:not([open])::backdrop {
        pointer-events: none;
    }
}
@media (prefers-reduced-transparency: reduce) {
    .glass-dialog {
        background: light-dark(#f4f8f6, #182426);
        backdrop-filter: none;
    }
}
</style>
