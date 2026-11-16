<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import GearDetailForm from '../editor/GearDetailForm.vue';
import GearScreenshot from '../ocr/GearScreenshot.vue';
import { mergeGearPanel, type GearPanelResult } from '../ocr/gear-panel';
import { cloneDraft } from './clone-draft';
import { applyGear } from './quick-target';
import { EDITOR_H, EDITOR_W } from '../editor-metrics';
import { focusInput } from '../focus-input';
import type { GearDetail, GearSlotName } from '../gear';
import type { ReadonlyCharacter } from '../character';
import { normalizeGear } from '../roster';
import { useDraftGuard } from '../../../composables/use-draft-guard';
import OcrSummary from '../ocr/OcrSummary.vue';
import {
    gearSnapshot,
    changeReport,
    gearReview,
    REPLACE_NOTE,
    type OcrReport,
} from '../ocr/change-summary';

/** 手改与识别都只动深拷贝，保存前不会触及角色，取消即丢弃。 */
const props = withDefaults(
    defineProps<{
        character: ReadonlyCharacter;
        slotName: GearSlotName;
        saving?: boolean;
        locked?: boolean;
        retrying?: boolean;
        saveError?: string;
    }>(),
    { saving: false, locked: false, retrying: false, saveError: '' },
);
const emit = defineEmits<{ save: [character: ReadonlyCharacter]; close: [] }>();
const source = props.character.gear.find((one) => one.slot === props.slotName);
const caption = ref<string | undefined>(source?.caption ?? '');
const detail = ref<GearDetail>(
    source?.detail
        ? cloneDraft<GearDetail>(source.detail)
        : { name: caption.value ?? '', kind: '', stats: [] },
);
const reading = ref(false);
const reports = ref<OcrReport[]>([]);
const form = ref<HTMLElement | null>(null);
const snapshot = () =>
    JSON.stringify(
        normalizeGear([{ slot: props.slotName, caption: caption.value, detail: detail.value }]),
    );
const original = snapshot();
const { requestClose } = useDraftGuard(
    () => !props.retrying && (reading.value || snapshot() !== original),
    () => props.saving,
    () => emit('close'),
);

function recognize(result: GearPanelResult) {
    if (props.locked || props.saving) return;
    const before = gearSnapshot(detail.value, props.slotName);
    const merged = mergeGearPanel(
        { slot: props.slotName, caption: caption.value, detail: detail.value },
        result,
    );
    caption.value = merged.caption ?? '';
    if (merged.detail) detail.value = merged.detail;
    reports.value = [
        changeReport(
            props.slotName,
            before,
            gearSnapshot(detail.value, props.slotName),
            gearReview(result),
            REPLACE_NOTE,
        ),
    ];
}
function setReading(value: boolean) {
    reading.value = value;
    if (value) reports.value = [];
}
function save() {
    if (reading.value || props.saving || (props.locked && !props.retrying)) return;
    emit(
        'save',
        applyGear(props.character, props.slotName, {
            caption: caption.value,
            detail: detail.value,
        }),
    );
}
/* `.gear-name input` 这条选择器一直没有匹配到东西（类名是 `gear-name-field` /
 * `gear-name-input`，没有 `gear-name` 这个 token），于是快速修改窗从来不会把焦点
 * 落到名字上。2026-11-11 顺手改成真实类名。 */
onMounted(() => focusInput(form, '.gear-name-input'));
</script>

<template>
    <ModalShell
        class="character-theme"
        :data-school="character.school || ''"
        :title="'快速修改 · ' + props.slotName"
        :width="EDITOR_W"
        :height="EDITOR_H"
        fill
        initial-focus="none"
        @close="requestClose"
    >
        <div ref="form" :inert="locked || saving" class="gear-quick">
            <GearScreenshot :slot-name="slotName" @recognize="recognize" @busy="setReading">
                <GearDetailForm v-model="detail" v-model:caption="caption" :slot-name="slotName" />
            </GearScreenshot>
        </div>
        <OcrSummary :reports="reports" />
        <template #footer>
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次修改"
                :disabled="saving"
                @click="requestClose"
            />
            <PressButton
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                label="保存这件装备"
                seal
                :disabled="reading || saving || (locked && !retrying)"
                @click="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.gear-quick {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
}
</style>
