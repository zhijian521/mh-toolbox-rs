<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, useId, watch } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import FormActions from '../../components/FormActions.vue';
import CharacterPaneTabs from './CharacterPaneTabs.vue';
import CharacterCard from './CharacterCard.vue';
import { hasPetName } from './pets';
import {
    PANES,
    type CharacterData,
    type ReadonlyCharacter,
    type PaneKey,
} from './character';
import type { OcrLine } from './ocr/attr-panel';
import type { CharacterPanelResult } from './ocr/character-panel';
import type { ScreenshotIntake } from './ocr/screenshot-input';
import { useCharacterScreenshots } from './ocr/use-character-screenshots';
import { useOcrDraft } from './ocr/use-ocr-draft';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import ScreenshotUpload from './ocr/ScreenshotUpload.vue';
import { normalizeCharacter } from './roster';
import { EDITOR_H, EDITOR_W } from './editor-metrics';
import { focusInput } from './focus-input';
import { useDraftGuard } from '../../composables/use-draft-guard';
import OcrSummary from './ocr/OcrSummary.vue';

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
const editorId = useId();
const glass = inject(glassLedger, null);
function panelAttrs(key: PaneKey) {
    if (!glass) return {};
    return {
        id: `${editorId}-pane-${key}`,
        role: 'tabpanel',
        'aria-labelledby': `${editorId}-tab-${key}`,
    };
}
const wide = computed(() => pane.value === 'gear' || pane.value === 'pets');
const paneLabel = computed(() => PANES.find(({ key }) => key === pane.value)?.label ?? '角色');

const screenshots = useCharacterScreenshots(pane, draft, applyScreenshot);
const { preview: screenshot, reports } = screenshots;
function takeFiles(files: File[]) {
    if (!props.locked && !props.saving) void screenshots.takeFiles(files);
}
const intake = computed<ScreenshotIntake>(() => ({
    busy: screenshots.busy.value,
    error: screenshots.error.value,
    takeFiles,
}));

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

function applyScreenshot(
    file: File,
    panel: CharacterPanelResult,
    lines: OcrLine[],
    shot: string,
) {
    if (panel.pane === 'gear') gearEditor.value?.acceptScreenshot(file, panel.value, lines);
    else if (panel.pane === 'pets') petEditor.value?.acceptScreenshot(file, panel.value, lines);
    else recognize(panel, shot);
}

// 手工切分区只切展示，不再次解析旧截图或覆盖手工修正。
watch(pane, (value) => openedPanes.value.add(value), { flush: 'sync' });

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
        <div ref="content" :inert="locked || saving" class="ocr">
            <div class="ocr-bar">
                <CharacterPaneTabs
                    v-model="pane"
                    class="ocr-tabs"
                    :data-size="glass ? 'standard' : undefined"
                    :prefix="glass ? editorId : undefined"
                    label="修改分区"
                />
                <span v-if="screenshot?.total" class="ocr-count">
                    认出 <b class="num">{{ screenshot.hit }}</b> / {{ screenshot.total }}
                </span>
            </div>
            <GearEditor
                v-if="openedPanes.has('gear')"
                v-show="pane === 'gear'"
                v-bind="panelAttrs('gear')"
                ref="gearEditor"
                v-model="draft.gear"
                v-model:meta="draft.gearMeta"
                :intake="intake"
                @busy="gearReading = $event"
            />
            <PetEditor
                v-if="openedPanes.has('pets')"
                v-show="pane === 'pets'"
                v-bind="panelAttrs('pets')"
                ref="petEditor"
                v-model="draft.pets"
                :intake="intake"
                @busy="petReading = $event"
            />
            <ScreenshotUpload
                v-show="!wide"
                v-bind="wide ? {} : panelAttrs(pane)"
                class="ocr-standard"
                :label="paneLabel"
                :src="screenshot?.url"
                :busy="intake.busy"
                :error="intake.error"
                :raw-lines="screenshot?.lines"
                @files="takeFiles"
            >
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

        <OcrSummary :reports="reports" />
        <template #footer>
            <FormActions
                :error="saveError"
                cancel-label="放弃这次修改"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                submit-label="保存这个角色"
                :submit-disabled="!canSave"
                :submit-describedby="saveIssue ? validationId : undefined"
                @cancel="requestClose"
                @submit="save"
            >
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
            </FormActions>
        </template>
    </ModalShell>
</template>

<style scoped>
/* 六个分区共用截图布局，右栏宽度由 --char-editor-w 统一提供。 */
.ocr {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
.ocr-bar {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}
.ocr-tabs {
    width: max-content;
    max-width: 100%;
    --step-pad-y: 6px;
    --step-pad-x: 10px;
}
@container screenshot-editor (max-width: 480px) {
    .ocr-tabs[data-size='standard'] {
        --lg-choice-padding-inline: clamp(4px, 2cqi, 9px);
        --lg-choice-gap: 2px;
    }
}
.ocr-count {
    white-space: nowrap;
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
