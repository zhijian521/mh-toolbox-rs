<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import ScreenshotUpload from './ScreenshotUpload.vue';
import { useOcrImage } from './use-ocr-image';
import { recognizePetPanel } from './pet-recognition';
import type { PetPanelResult } from './pet-panel';

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ recognize: [value: PetPanelResult]; busy: [value: boolean] }>();
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
function takeFiles(files: File[]) {
    if (!busy.value && !props.disabled && files[0]) void takeFile(files[0]);
}
onBeforeUnmount(() => emit('busy', false));
</script>

<template>
    <ScreenshotUpload
        class="pet-screenshot"
        label="召唤兽"
        :src="shotUrl"
        :disabled="disabled || busy"
        :busy="busy"
        :status="result?.hit ? `已覆盖 ${result.hit} 项，技能 ${result.skillCount} 项` : ''"
        :error="error"
        :raw-lines="rawLines"
        :empty-text="disabled ? '先新增或选择一只召唤兽' : 'Ctrl + V 粘贴截图'"
        hint="识别将覆盖当前召唤兽，建议一起截取属性与资质"
        @files="takeFiles"
    >
        <template v-if="$slots.navigation" #navigation><slot name="navigation" /></template>
        <template #feedback>
            <p v-if="!busy && result?.ambiguousSkills?.length" class="note" role="status">
                {{ result.ambiguousSkills.length }} 个技能图标需要确认：
                {{ result.ambiguousSkills.map((names) => names.join(' / ')).join('；') }}。
                请在右侧技能中选择。
            </p>
        </template>
        <slot />
    </ScreenshotUpload>
</template>
