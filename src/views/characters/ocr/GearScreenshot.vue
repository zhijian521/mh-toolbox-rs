<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ScreenshotUpload from './ScreenshotUpload.vue';
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

async function takeFiles(images: File[]) {
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

onBeforeUnmount(() => {
    disposed = true;
    ++generation;
    for (const shot of Object.values(shots.value)) {
        if (shot) URL.revokeObjectURL(shot.url);
    }
    emit('busy', false);
});
</script>

<template>
    <ScreenshotUpload
        class="gear-upload"
        label="装备"
        :src="currentShot?.url"
        :alt="currentShot ? '装备原始截图：' + currentShot.name : undefined"
        :multiple="multiple"
        :busy="pending"
        :status="message"
        :error="batchError || error"
        @files="takeFiles"
    >
        <template v-if="$slots.navigation" #navigation>
            <slot name="navigation" :shots="shots" />
        </template>
        <slot />
    </ScreenshotUpload>
</template>
