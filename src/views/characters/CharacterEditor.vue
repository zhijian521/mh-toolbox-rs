<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import CharacterCard from './CharacterCard.vue';
import { hasPetName } from './pets';
import {
    PANE_OPTIONS,
    PANES,
    type CharacterData,
    type ReadonlyCharacter,
    type PaneKey,
} from './character';
import type { OcrLine } from './ocr/attr-panel';
import { createCharacterPanelReader } from './ocr/character-panel';
import type { ScreenshotIntake } from './ocr/screenshot-input';
import { useOcrImage } from './ocr/use-ocr-image';
import { useOcrDraft } from './ocr/use-ocr-draft';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import ScreenshotUpload from './ocr/ScreenshotUpload.vue';
import { normalizeCharacter } from './roster';
import { EDITOR_H, EDITOR_W } from './editor-metrics';
import { focusInput } from './focus-input';
import { ocrFrame } from '../../services/ocr';
import { base64Of, swapToBgra } from './ocr/pixels';
import { useDraftGuard } from '../../composables/use-draft-guard';

/** 新建、手工修改和截图识别共用独立草稿，保存后由名册统一落库。 */
const props = withDefaults(
    defineProps<{
        character: ReadonlyCharacter;
        pane?: PaneKey;
        isNew?: boolean;
        saving?: boolean;
        locked?: boolean;
        retrying?: boolean;
        saveError?: string;
    }>(),
    { pane: 'attrs', isNew: false, saving: false, locked: false, retrying: false, saveError: '' },
);
const emit = defineEmits<{ save: [character: CharacterData]; cancel: [] }>();
const gearReading = ref(false);
const petReading = ref(false);
const {
    draft,
    changed,
    recognize,
    setValue,
    setSkill,
    setAssist,
    addAssist,
    removeAssist,
    setTraining,
} = useOcrDraft(props.character);

const pane = ref<PaneKey>(props.pane);
const openedPanes = ref(new Set<PaneKey>([props.pane]));
const content = ref<HTMLElement | null>(null);
const petEditor = ref<InstanceType<typeof PetEditor> | null>(null);
const gearEditor = ref<InstanceType<typeof GearEditor> | null>(null);
const validationId = useId();
const wide = computed(() => pane.value === 'gear' || pane.value === 'pets');
const paneLabel = computed(() => PANES.find(({ key }) => key === pane.value)?.label ?? '角色');

const readPanel = createCharacterPanelReader();
let readingPane = props.pane;
const { result, shotUrl, rawLines, busy, error, takeFile } = useOcrImage(
    parse,
    undefined,
    () => readingPane !== 'assist',
);
const queued = ref(false);
const batchError = ref('');
let disposed = false;
let generation = 0;
const intake = computed<ScreenshotIntake>(() => ({
    busy: busy.value || queued.value,
    error: batchError.value || error.value,
    rawLines: rawLines.value,
    takeFiles,
}));

const hitCount = computed(() => result.value?.value?.hit ?? 0);
const totalCount = computed(() => {
    const value = result.value?.value;
    return value && 'total' in value ? value.total : (value?.hit ?? 0);
});

const preview = computed(() => ({ ...draft.value, id: `${draft.value.id}-preview` }));
const saveIssue = computed(() => {
    if (!draft.value.name.trim()) return { message: '请填写角色名称', petIndex: -1 };
    const petIndex = draft.value.pets.findIndex((pet) => !hasPetName(pet));
    return petIndex < 0 ? null : { message: `第 ${petIndex + 1} 只召唤兽尚未命名`, petIndex };
});
const canSave = computed(
    () =>
        (props.retrying || !saveIssue.value) &&
        !intake.value.busy &&
        !gearReading.value &&
        !petReading.value &&
        !props.saving &&
        (!props.locked || props.retrying) &&
        (props.retrying || props.isNew || changed.value),
);

const { requestClose } = useDraftGuard(
    () =>
        !props.retrying &&
        (changed.value || intake.value.busy || gearReading.value || petReading.value),
    () => props.saving,
    () => emit('cancel'),
);

async function fillRequired() {
    const issue = saveIssue.value;
    if (!issue) return;
    pane.value = issue.petIndex < 0 ? 'attrs' : 'pets';
    await nextTick();
    if (issue.petIndex < 0) await focusInput(content, 'input[aria-label="角色名"]');
    else await petEditor.value?.focusName(issue.petIndex);
}

async function takeFiles(files: File[]) {
    if (props.locked || props.saving || !files.length) return;
    const version = ++generation;
    const currentBatch = () => !disposed && version === generation;
    queued.value = true;
    batchError.value = '';
    const failures: string[] = [];
    try {
        for (const file of files) {
            if (!currentBatch()) return;
            readingPane = pane.value;
            await takeFile(file);
            if (!currentBatch()) return;
            const current = result.value;
            if (!current || error.value) {
                failures.push(`${file.name}：${error.value || '未识别'}`);
                continue;
            }
            pane.value = current.pane;
            await nextTick();
            if (!currentBatch()) return;
            if (current.pane === 'gear') {
                gearEditor.value?.acceptScreenshot(file, current.value, rawLines.value);
            } else if (current.pane === 'pets') {
                petEditor.value?.acceptScreenshot(file, current.value, rawLines.value);
            } else {
                recognize(current, shotUrl.value);
            }
        }
    } finally {
        if (currentBatch()) {
            if (files.length > 1) batchError.value = failures.join('；');
            queued.value = false;
        }
    }
}

async function parse(lines: OcrLine[], image: ImageData) {
    const version = generation;
    const readText = async () => {
        const outcome = await ocrFrame(base64Of(swapToBgra(image.data)), image.width, image.height);
        if (outcome.status === 'failed') throw new Error(outcome.error);
        if (!disposed && version === generation) rawLines.value = outcome.lines;
        return outcome.lines;
    };
    const result = await readPanel(
        lines,
        image,
        draft.value.school,
        readingPane,
        readingPane === 'assist' ? readText : undefined,
    );
    return { result, error: result ? '' : '没认出可填写的内容，请截取完整的面板' };
}

// 手工切分区只切展示，不再次解析旧截图或覆盖手工修正。
watch(pane, (value) => openedPanes.value.add(value), { flush: 'sync' });
onBeforeUnmount(() => {
    disposed = true;
});

function save() {
    if (canSave.value) emit('save', normalizeCharacter(draft.value));
}

onMounted(() => focusInput(content, 'input[aria-label="角色名"]'));
</script>

<template>
    <ModalShell
        class="editor character-theme"
        :data-school="draft.school || ''"
        :title="isNew ? '新角色' : `修改角色 · ${character.name || '未命名'}`"
        :width="EDITOR_W"
        :height="EDITOR_H"
        fill
        :initial-focus="pane === 'attrs' ? 'none' : 'first'"
        @close="requestClose"
    >
        <div ref="content" :inert="locked || saving" class="ocr" :class="{ 'ocr-wide': wide }">
            <GearEditor
                v-if="openedPanes.has('gear')"
                v-show="pane === 'gear'"
                ref="gearEditor"
                v-model="draft.gear"
                :intake="intake"
                @busy="gearReading = $event"
            >
                <template #tabs>
                    <SteppedSlider
                        v-if="pane === 'gear'"
                        class="ocr-tabs"
                        :model-value="pane"
                        :options="PANE_OPTIONS"
                        label="修改分区"
                        @update:model-value="pane = $event"
                    />
                </template>
            </GearEditor>
            <PetEditor
                v-if="openedPanes.has('pets')"
                v-show="pane === 'pets'"
                ref="petEditor"
                v-model="draft.pets"
                :intake="intake"
                @busy="petReading = $event"
            >
                <template #tabs>
                    <SteppedSlider
                        v-if="pane === 'pets'"
                        class="ocr-tabs"
                        :model-value="pane"
                        :options="PANE_OPTIONS"
                        label="修改分区"
                        @update:model-value="pane = $event"
                    />
                </template>
            </PetEditor>
            <ScreenshotUpload
                v-show="!wide"
                class="ocr-standard"
                :label="paneLabel"
                :src="shotUrl"
                :busy="intake.busy"
                :error="intake.error"
                :raw-lines="rawLines"
                @files="takeFiles"
            >
                <template #navigation>
                    <div class="ocr-bar">
                        <SteppedSlider
                            v-if="!wide"
                            v-model="pane"
                            class="ocr-tabs"
                            :options="PANE_OPTIONS"
                            label="修改分区"
                        />
                        <span v-if="totalCount" class="ocr-count">
                            认出 <b class="num">{{ hitCount }}</b> / {{ totalCount }}
                        </span>
                    </div>
                </template>
                <div class="ocr-card">
                    <CharacterCard
                        :character="preview"
                        :pane="pane"
                        preview
                        :tabs="false"
                        editable
                        @edit-value="setValue"
                        @edit-level="setSkill"
                        @edit-assist="setAssist"
                        @add-assist="addAssist"
                        @remove-assist="removeAssist"
                        @edit-training="setTraining"
                    />
                </div>
            </ScreenshotUpload>
        </div>

        <template #footer>
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
            <div v-if="saveIssue" :id="validationId" class="editor-validation" role="status">
                <span>{{ saveIssue.message }}</span>
                <PressButton
                    text="去填写"
                    label="定位未填写的名称"
                    size="sm"
                    :disabled="intake.busy || gearReading || petReading || saving || locked"
                    @click="fillRequired"
                />
            </div>
            <PressButton
                text="取消"
                label="放弃这次修改"
                data-modal-cancel
                :disabled="saving"
                @click="requestClose"
            />
            <PressButton
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                label="保存这个角色"
                seal
                :disabled="!canSave"
                :aria-describedby="saveIssue ? validationId : undefined"
                @click="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 六个分区共用截图布局，右栏宽度由 --char-editor-w 统一提供。 */
.ocr {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
.ocr-bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.ocr-tabs {
    width: max-content;
    max-width: 100%;
    --step-pad-y: 6px;
    --step-pad-x: 10px;
}
.ocr-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.1em;
}
.ocr-count b {
    color: var(--num);
    font-size: var(--fs-sm);
}
.ocr-card {
    flex: 1;
    min-width: 0;
    min-height: 0;
    --char-w: 100%;
    --char-h: 100%;
}
.ocr-card :deep(.char-body) {
    padding-right: var(--card-pad-x);
    scrollbar-gutter: auto;
}
.editor-validation {
    display: flex;
    flex: 1;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    min-width: 0;
    color: var(--danger);
    font-size: var(--fs-sm);
}
</style>
