<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import type { OcrLine } from './attr-panel';
import { imageFiles, pastedImages } from './screenshot-input';

/** 只管理上传与展示，识别、批量队列和原图归属由调用方处理。 */
const props = withDefaults(
    defineProps<{
        label: string;
        src?: string;
        alt?: string;
        multiple?: boolean;
        disabled?: boolean;
        busy?: boolean;
        status?: string;
        error?: string;
        rawLines?: OcrLine[];
        emptyText?: string;
        hint?: string;
    }>(),
    { emptyText: 'Ctrl + V 粘贴截图' },
);
const emit = defineEmits<{ files: [files: File[]] }>();
const host = ref<HTMLElement | null>(null);
const picker = ref<HTMLInputElement | null>(null);

function takeFiles(files: Iterable<File>) {
    if (props.disabled) return;
    const images = imageFiles(files);
    if (images.length) emit('files', images);
}

function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    takeFiles(input.files ?? []);
    input.value = '';
}

function onPaste(event: ClipboardEvent) {
    if (props.disabled) return;
    const files = pastedImages(event, host.value);
    if (!files.length) return;
    event.preventDefault();
    emit('files', files);
}

onMounted(() => document.addEventListener('paste', onPaste));
onBeforeUnmount(() => document.removeEventListener('paste', onPaste));
</script>

<template>
    <div
        ref="host"
        class="screenshot-upload"
        :aria-label="`${label}截图识别`"
        :aria-busy="busy ?? false"
        @dragover.prevent
        @drop.prevent.stop="takeFiles($event.dataTransfer?.files ?? [])"
    >
        <input
            ref="picker"
            class="upload-file"
            type="file"
            accept="image/*"
            :multiple="multiple"
            :disabled="disabled || busy"
            :aria-label="`${label}截图文件`"
            @change="onPick"
        />
        <section class="upload-left" :aria-label="`${label}截图`">
            <div v-if="$slots.navigation" class="upload-navigation"><slot name="navigation" /></div>
            <figure class="upload-preview" :class="{ empty: !src }">
                <img v-if="src" :src="src" :alt="alt || `${label}原始截图`" />
                <div v-else class="upload-empty">
                    <p>{{ emptyText }}</p>
                    <small v-if="hint">{{ hint }}</small>
                    <PressButton
                        icon="upload"
                        text="选择截图"
                        :label="`上传${label}截图`"
                        :disabled="disabled || busy"
                        @click="picker?.click()"
                    />
                </div>
                <span v-if="busy" class="upload-busy">识别中…</span>
            </figure>
            <div class="upload-bar">
                <PressButton
                    v-if="src"
                    icon="upload"
                    text="更换截图"
                    :label="`上传${label}截图`"
                    size="sm"
                    :disabled="disabled || busy"
                    @click="picker?.click()"
                />
                <span class="upload-status" role="status">{{ busy ? '识别中…' : status }}</span>
            </div>
            <p v-if="error && !busy" class="upload-error" role="alert">{{ error }}</p>
            <slot name="feedback" />
            <details v-if="rawLines?.length" class="upload-raw">
                <summary>识别原文 · {{ rawLines.length }} 行</summary>
                <ul class="upload-raw-list">
                    <li
                        v-for="(line, index) in rawLines"
                        :key="index"
                        :class="{ low: (line.score ?? 0) < 0.6 }"
                    >
                        <span class="raw-text">{{ line.text }}</span>
                        <span class="raw-score">{{ (line.score ?? 0).toFixed(2) }}</span>
                    </li>
                </ul>
            </details>
        </section>
        <div class="upload-detail"><slot /></div>
    </div>
</template>

<style scoped src="./screenshot-upload.css"></style>
