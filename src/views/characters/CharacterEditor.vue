<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import CharacterCard from './CharacterCard.vue';
import { hasPetName } from './pets';
import { PANE_OPTIONS, PANES, type CharacterData, type PaneKey } from './character';
import { schoolSkillNames } from './schools';
import { parseAttrPanel, type OcrLine } from './ocr/attr-panel';
import { createAssistReader } from './ocr/assist-reader';
import { useOcrImage } from './ocr/use-ocr-image';
import { parseSkillPanel } from './ocr/skill-panel';
import { parseTrainingPanel } from './ocr/training-panel';
import { useOcrDraft, type PanelResult } from './ocr/use-ocr-draft';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import ScreenshotUpload from './ocr/ScreenshotUpload.vue';
import { normalizeCharacter } from './roster';
import { EDITOR_MIN_H, EDITOR_W } from './editor-metrics';
import { focusInput } from './focus-input';

/** 新建、手工修改和截图识别共用独立草稿，保存后由名册统一落库。 */
const props = withDefaults(
    defineProps<{ character: CharacterData; pane?: PaneKey; isNew?: boolean; saving?: boolean }>(),
    { pane: 'attrs', isNew: false, saving: false },
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
const content = ref<HTMLElement | null>(null);
const petEditor = ref<InstanceType<typeof PetEditor> | null>(null);
const validationId = useId();
const wide = computed(() => pane.value === 'gear' || pane.value === 'pets');
const paneLabel = computed(() => PANES.find(({ key }) => key === pane.value)?.label ?? '角色');

const { result, shotUrl, rawLines, busy, error, takeFile, classify } =
    useOcrImage<PanelResult | null>(parse, undefined, () => pane.value !== 'assist');
const readAssist = createAssistReader();
watch(result, (current) => recognize(current, shotUrl.value), { flush: 'sync' });

const hitCount = computed(() => {
    const current = result.value;
    if (!current?.value) return 0;
    const rows = current.pane === 'attrs' ? current.value.fields : current.value.rows;
    return rows.filter((row) => row.state === 'ok' || row.state === 'guess').length;
});
const totalCount = computed(() => result.value?.value?.total ?? 0);

const preview = computed(() => ({ ...draft.value, id: `${draft.value.id}-preview` }));
const saveIssue = computed(() => {
    if (!draft.value.name.trim()) return { message: '请填写角色名称', petIndex: -1 };
    const petIndex = draft.value.pets.findIndex((pet) => !hasPetName(pet));
    return petIndex < 0 ? null : { message: `第 ${petIndex + 1} 只召唤兽尚未命名`, petIndex };
});
const canSave = computed(
    () =>
        !saveIssue.value &&
        !busy.value &&
        !gearReading.value &&
        !petReading.value &&
        !props.saving &&
        (props.isNew || changed.value),
);

async function fillRequired() {
    const issue = saveIssue.value;
    if (!issue) return;
    pane.value = issue.petIndex < 0 ? 'attrs' : 'pets';
    await nextTick();
    if (issue.petIndex < 0) await focusInput(content, 'input[aria-label="角色名"]');
    else await petEditor.value?.focusName(issue.petIndex);
}

function takeFiles(files: File[]) {
    if (files[0]) void takeFile(files[0]);
}

async function parse(lines: OcrLine[], image: ImageData) {
    if (wide.value) {
        return { result: null };
    }
    if (pane.value === 'attrs') {
        const value = parseAttrPanel(lines);
        return {
            result: { pane: 'attrs' as const, value },
            error: value.hit ? '' : '没认出属性字段',
        };
    }
    if (pane.value === 'assist') {
        const value = await readAssist(image);
        return {
            result: { pane: 'assist' as const, value },
            error: value.hit ? '' : '没认出辅助技能',
        };
    }
    if (pane.value === 'training') {
        const value = parseTrainingPanel(lines);
        return {
            result: { pane: 'training' as const, value },
            error: value.hit ? '' : '没认出修炼等级',
        };
    }
    const names = schoolSkillNames(draft.value.school);
    if (!names?.length) {
        return {
            result: { pane: 'skills' as const, value: null },
            error: '请先为角色选择门派',
        };
    }
    const value = parseSkillPanel(lines, names);
    return {
        result: { pane: 'skills' as const, value },
        error: value.hit ? '' : '没认出师门技能',
    };
}

// 分区共用编辑草稿；同一原图只覆盖一次，切回时保留手工修改。
watch(
    pane,
    (value) => {
        if (value !== 'gear' && value !== 'pets') void classify();
    },
    { flush: 'sync' },
);

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
        :height="EDITOR_MIN_H"
        fill
        :initial-focus="pane === 'attrs' ? 'none' : 'first'"
        @close="emit('cancel')"
    >
        <div ref="content" class="ocr" :class="{ 'ocr-wide': wide }">
            <GearEditor v-show="pane === 'gear'" v-model="draft.gear" @busy="gearReading = $event">
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
                v-show="pane === 'pets'"
                ref="petEditor"
                v-model="draft.pets"
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
                :busy="busy"
                :error="error"
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
                            认出 <b>{{ hitCount }}</b> / {{ totalCount }}
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
            <div v-if="saveIssue" :id="validationId" class="editor-validation" role="status">
                <span>{{ saveIssue.message }}</span>
                <PressButton
                    text="去填写"
                    label="定位未填写的名称"
                    size="sm"
                    :disabled="busy || gearReading || petReading || saving"
                    @click="fillRequired"
                />
            </div>
            <PressButton
                text="取消"
                label="放弃这次修改"
                data-modal-cancel
                @click="emit('cancel')"
            />
            <PressButton
                icon="check"
                text="保存"
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
.ocr :deep(.num) {
    font-weight: 700;
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
    font-weight: 700;
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
