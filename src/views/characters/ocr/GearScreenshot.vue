<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import { loadEquipmentNames } from '../../../services/game-data';
import type { GearSlotName } from '../gear';
import type { GearPanelResult } from './gear-panel';
import { recognizeGearPanel } from './gear-recognition';
import { gearFrame } from './gear-image';
import { useOcrImage } from './use-ocr-image';

/** 各入口只更新自身草稿，批量上传依次识别，取消后不再写回。 */
const props = defineProps<{
    slotName?: GearSlotName;
    activeSlot?: GearSlotName;
    multiple?: boolean;
}>();
const emit = defineEmits<{
    recognize: [result: GearPanelResult];
    busy: [value: boolean];
}>();
const picker = ref<HTMLInputElement | null>(null);
const host = ref<HTMLElement | null>(null);
const message = ref('');
const batchError = ref('');
const queued = ref(false);
const shots = ref<Partial<Record<GearSlotName, { url: string; name: string }>>>({});
const currentShot = computed(() => {
    const slot = props.slotName ?? props.activeSlot;
    return slot ? shots.value[slot] : undefined;
});
const { result, busy, error, takeFile } = useOcrImage<GearPanelResult>(async (lines, image) => {
    const value = await recognizeGearPanel(
        lines,
        image,
        await loadEquipmentNames(),
        props.slotName,
    );
    const mismatch = props.slotName && value.slot && props.slotName !== value.slot;
    return {
        result: value,
        error: mismatch
            ? `这张是${value.slot}，请选择${props.slotName}截图`
            : !value.slot || !value.hit
              ? '没认出装备，请截取完整的装备详情'
              : '',
    };
}, gearFrame);
const pending = computed(() => queued.value || busy.value);
watch(pending, (value) => emit('busy', value), { flush: 'sync' });
let generation = 0;
let disposed = false;

function rememberShot(slot: GearSlotName | undefined, file: File) {
    if (!slot) return;
    const previous = shots.value[slot];
    if (previous) URL.revokeObjectURL(previous.url);
    shots.value[slot] = { url: URL.createObjectURL(file), name: file.name };
}

function clearShot(slot: GearSlotName) {
    const shot = shots.value[slot];
    if (shot) URL.revokeObjectURL(shot.url);
    delete shots.value[slot];
}
defineExpose({ clearShot });

async function takeFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    const current = ++generation;
    queued.value = true;
    message.value = '';
    batchError.value = '';
    let count = 0;
    const failures: string[] = [];
    for (const file of props.multiple ? images : images.slice(0, 1)) {
        if (disposed || current !== generation) return;
        const fallbackSlot = props.slotName ?? props.activeSlot;
        await takeFile(file);
        if (disposed || current !== generation) return;
        rememberShot(!error.value ? (result.value?.slot ?? fallbackSlot) : fallbackSlot, file);
        if (error.value || !result.value?.slot || !result.value.hit) {
            failures.push(`${file.name}：${error.value || '未识别'}`);
            continue;
        }
        emit('recognize', result.value);
        count++;
        message.value = `${result.value.detail.name || result.value.slot} · 已填入`;
    }
    if (images.length > 1 && props.multiple) {
        message.value = `已填入 ${count} 张${failures.length ? `，${failures.length} 张未识别` : ''}`;
    }
    batchError.value = failures.join('；');
    queued.value = false;
}

function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    void takeFiles([...(input.files ?? [])]);
    input.value = '';
}
function onDrop(event: DragEvent) {
    void takeFiles([...(event.dataTransfer?.files ?? [])]);
}
function onPaste(event: ClipboardEvent) {
    // 仅最上层且当前可见的编辑窗接收图片，不能让背景编辑器同时导入。
    if (!host.value?.getClientRects().length) return;
    const modal = host.value?.closest('[role="dialog"]');
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
    if (!modal || dialogs.at(-1) !== modal) return;
    const files = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
    if (!files.length) return;
    event.preventDefault();
    void takeFiles(files);
}
onMounted(() => document.addEventListener('paste', onPaste));
onBeforeUnmount(() => {
    disposed = true;
    ++generation;
    document.removeEventListener('paste', onPaste);
    for (const shot of Object.values(shots.value)) {
        if (shot) URL.revokeObjectURL(shot.url);
    }
    emit('busy', false);
});
</script>

<template>
    <div
        ref="host"
        class="gear-upload"
        :aria-busy="pending"
        @dragover.prevent
        @drop.prevent="onDrop"
    >
        <input
            ref="picker"
            class="upload-file"
            type="file"
            accept="image/*"
            :multiple="multiple"
            aria-label="装备截图文件"
            @change="onPick"
        />
        <section class="upload-left" aria-label="装备截图识别">
            <div v-if="$slots.navigation" class="upload-navigation">
                <slot name="navigation" :shots="shots" />
            </div>
            <figure class="upload-preview" :class="{ empty: !currentShot }">
                <img
                    v-if="currentShot"
                    :src="currentShot.url"
                    :alt="'装备原始截图：' + currentShot.name"
                />
                <div v-else class="upload-empty">
                    <p>Ctrl + V 粘贴截图</p>
                    <PressButton
                        icon="upload"
                        text="选择截图"
                        label="上传装备截图"
                        :disabled="pending"
                        @click="picker?.click()"
                    />
                </div>
                <span v-if="pending" class="upload-busy">识别中…</span>
            </figure>
            <div class="upload-bar">
                <PressButton
                    v-if="currentShot"
                    icon="upload"
                    text="更换截图"
                    label="上传装备截图"
                    size="sm"
                    :disabled="pending"
                    @click="picker?.click()"
                />
                <span class="upload-status" role="status">{{ pending ? '识别中…' : message }}</span>
            </div>
            <p v-if="(batchError || error) && !pending" class="upload-error" role="alert">
                {{ batchError || error }}
            </p>
        </section>
        <div class="upload-detail"><slot /></div>
    </div>
</template>

<style scoped>
/* 左栏钉 400、右栏吃剩下（2026-11-10 用户定：截图区 400、详情 420）。
 * 窗宽 860 时正文可用 836 = 400 + gap 16 + 420，所以右栏不用再写死数——
 * 写死两列各 1fr 会让 400/420 的意图丢掉，改窗宽时两栏一起漂。 */
.gear-upload {
    display: grid;
    grid-template-columns: 400px minmax(0, 1fr);
    flex: 1;
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
    gap: 10px;
}
.upload-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}
.upload-status {
    flex: 1;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.upload-file {
    display: none;
}
.upload-error {
    margin: 0;
    color: var(--cinnabar);
    font-size: var(--fs-sm);
}
.upload-preview {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 220px;
    margin: 0;
    overflow: hidden;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--well);
}
.upload-preview.empty {
    border-style: dashed;
    background: transparent;
}
.upload-preview img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.upload-empty {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 16px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.upload-busy {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--paper) 70%, transparent);
    color: var(--ink);
    font-size: var(--fs-sm);
}
.upload-detail {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
@media (max-width: 640px) {
    .gear-upload {
        grid-template-columns: minmax(0, 1fr);
        overflow: auto;
    }
    .upload-preview {
        min-height: 180px;
        height: 220px;
    }
    .upload-preview img {
        max-height: 210px;
        object-fit: contain;
    }
    .upload-detail {
        min-height: 360px;
    }
}
</style>
