<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import { useOcrImage } from './use-ocr-image';
import { recognizePetPanel } from './pet-recognition';
import type { PetPanelResult } from './pet-panel';

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ recognize: [value: PetPanelResult]; busy: [value: boolean] }>();
const host = ref<HTMLElement | null>(null);
const picker = ref<HTMLInputElement | null>(null);
const { result, busy, error, rawLines, shotUrl, takeFile } = useOcrImage(async (lines, image) => {
    const value = await recognizePetPanel(lines, image);
    return { result: value, error: value.hit ? '' : '没认出召唤兽，请截取完整的属性或资质窗口' };
});
watch(
    result,
    (value) => {
        if (value?.hit && !props.disabled) emit('recognize', value);
    },
    { flush: 'sync' },
);
watch(busy, (value) => emit('busy', value), { flush: 'sync' });
function pick(file?: File) {
    if (file?.type.startsWith('image/') && !busy.value && !props.disabled) void takeFile(file);
}
function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    pick(input.files?.[0]);
    input.value = '';
}
function onPaste(event: ClipboardEvent) {
    if (props.disabled || !host.value?.getClientRects().length) return;
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
    if (host.value.closest('[role="dialog"]') !== dialogs.at(-1)) return;
    const item = [...(event.clipboardData?.items ?? [])].find((one) =>
        one.type.startsWith('image/'),
    );
    if (!item) return;
    event.preventDefault();
    pick(item.getAsFile() ?? undefined);
}
onMounted(() => document.addEventListener('paste', onPaste));
onBeforeUnmount(() => {
    document.removeEventListener('paste', onPaste);
    emit('busy', false);
});
</script>

<template>
    <div
        ref="host"
        class="pet-screenshot"
        :aria-busy="busy"
        aria-label="召唤兽截图识别"
        @dragover.prevent
        @drop.prevent.stop="pick($event.dataTransfer?.files[0])"
    >
        <input
            ref="picker"
            class="upload-file"
            type="file"
            accept="image/*"
            aria-label="召唤兽截图文件"
            :disabled="disabled || busy"
            @change="onPick"
        />
        <section class="upload-left" aria-label="召唤兽截图">
            <div v-if="$slots.navigation" class="upload-navigation"><slot name="navigation" /></div>
            <figure :class="{ empty: !shotUrl }">
                <img v-if="shotUrl" :src="shotUrl" alt="召唤兽原始截图" />
                <div v-else class="upload-empty">
                    <span>{{ disabled ? '先新增或选择一只召唤兽' : 'Ctrl + V 粘贴截图' }}</span>
                    <small>识别将覆盖当前召唤兽，建议一起截取属性与资质</small>
                    <PressButton
                        icon="upload"
                        text="选择截图"
                        label="上传召唤兽截图"
                        :disabled="disabled || busy"
                        @click="picker?.click()"
                    />
                </div>
                <span v-if="busy" class="reading">识别中…</span>
            </figure>
            <div class="upload-bar">
                <PressButton
                    v-if="shotUrl"
                    icon="upload"
                    text="更换截图"
                    label="上传召唤兽截图"
                    size="sm"
                    :disabled="disabled || busy"
                    @click="picker?.click()"
                />
                <span class="status" role="status">{{
                    busy
                        ? '识别中…'
                        : result?.hit
                          ? `已覆盖 ${result.hit} 项，技能 ${result.skillCount} 项`
                          : ''
                }}</span>
            </div>
            <p v-if="error && !busy" class="error" role="alert">{{ error }}</p>
            <details v-if="rawLines.length">
                <summary>识别原文 · {{ rawLines.length }} 行</summary>
                <p v-for="(line, index) in rawLines" :key="index">{{ line.text }}</p>
            </details>
        </section>
        <div class="upload-detail"><slot /></div>
    </div>
</template>

<style scoped>
.pet-screenshot {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    min-width: 0;
    min-height: 0;
}
.upload-left {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
}
.upload-navigation {
    display: grid;
    flex: none;
    gap: 12px;
}
.upload-detail {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
.upload-file {
    display: none;
}
figure {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    margin: 0;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--well);
    overflow: hidden;
}
figure.empty {
    border-style: dashed;
    background: transparent;
}
figure img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.upload-empty {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 18px 6px;
    color: var(--ink-2);
    text-align: center;
    font-size: var(--fs-sm);
}
small,
.status,
details {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.upload-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: none;
}
.reading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--paper) 85%, transparent);
    color: var(--ink-2);
}
.error {
    margin: 0;
    color: var(--cinnabar);
    font-size: var(--fs-sm);
}
details {
    flex: none;
    max-height: 120px;
    overflow-y: auto;
}
summary {
    cursor: pointer;
}
details p {
    margin: 3px 0;
}
@media (max-width: 640px) {
    .pet-screenshot {
        grid-template-columns: minmax(0, 1fr);
        overflow-y: auto;
    }
    .upload-left {
        overflow: visible;
    }
    figure {
        flex: none;
        height: 220px;
    }
    .upload-detail {
        min-height: 400px;
    }
}
</style>
