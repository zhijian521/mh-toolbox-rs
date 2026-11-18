<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import FormActions from '../../../components/FormActions.vue';
import PetDetailForm from '../editor/PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import { applyPetPanel } from '../ocr/pet-panel';
import { cloneDraft } from './clone-draft';
import { applyPet } from './quick-target';
import { EDITOR_H, EDITOR_W } from '../editor-metrics';
import { focusInput } from '../focus-input';
import { hasPetName, type Pet } from '../pets';
import type { ReadonlyCharacter } from '../character';
import { useDraftGuard } from '../../../composables/use-draft-guard';
import OcrSummary from '../ocr/OcrSummary.vue';
import CharacterAssetPicker from '../../warehouse/CharacterAssetPicker.vue';
import { normalizeWarehouseItem, type ReadonlyWarehouseItem } from '../../warehouse/warehouse';
import {
    petSnapshot,
    changeReport,
    petReview,
    REPLACE_NOTE,
    type OcrReport,
} from '../ocr/change-summary';

/** 快速修改与整份编辑共用截图入口和四组表单，取消不修改原记录。 */
const props = withDefaults(
    defineProps<{
        character: ReadonlyCharacter;
        index: number;
        saving?: boolean;
        locked?: boolean;
        retrying?: boolean;
        saveError?: string;
    }>(),
    { saving: false, locked: false, retrying: false, saveError: '' },
);
const emit = defineEmits<{ save: [character: ReadonlyCharacter]; close: [] }>();

const source = computed(() => props.character.pets[props.index] ?? null);

/* 深拷贝的理由与坑见 `clone-draft.ts`：Esc 该是「什么都没发生」。 */
const pet = ref<Pet | null>(source.value ? cloneDraft<Pet>(source.value) : null);

const reading = ref(false);
const reports = ref<OcrReport[]>([]);
const original = JSON.stringify(pet.value);
const { requestClose } = useDraftGuard(
    () => !props.retrying && (reading.value || JSON.stringify(pet.value) !== original),
    () => props.saving,
    () => emit('close'),
);
const canSave = computed(
    () =>
        !reading.value &&
        !props.saving &&
        (!props.locked || props.retrying) &&
        pet.value !== null &&
        hasPetName(pet.value),
);

function save() {
    if (!pet.value || !canSave.value) return;
    emit('save', applyPet(props.character, props.index, pet.value));
}

function recognize(result: Parameters<typeof applyPetPanel>[1]) {
    if (props.locked || props.saving) return;
    if (pet.value) {
        const before = petSnapshot(pet.value);
        pet.value = applyPetPanel(pet.value, result);
        reports.value = [
            changeReport('召唤兽', before, petSnapshot(pet.value), petReview(result), REPLACE_NOTE),
        ];
    }
}
function setReading(value: boolean) {
    reading.value = value;
    if (value) reports.value = [];
}
function pickWarehouse(items: readonly ReadonlyWarehouseItem[]) {
    const item = normalizeWarehouseItem(items[0]);
    if (item?.kind === 'pet') pet.value = { ...item.pet, warehouseId: item.id };
}

const form = ref<HTMLElement | null>(null);

onMounted(() => focusInput(form, 'input[aria-label="召唤兽名称"]'));
</script>

<template>
    <ModalShell
        class="character-theme"
        :data-school="character.school || ''"
        :title="`快速修改 · 召唤兽 ${pet?.name.trim() || '未命名'}`"
        :width="EDITOR_W"
        :height="EDITOR_H"
        fill
        initial-focus="none"
        @close="requestClose"
    >
        <div v-if="pet" ref="form" :inert="locked || saving" class="pet-quick">
            <PetScreenshot @recognize="recognize" @busy="setReading">
                <PetDetailForm v-model="pet">
                    <template #name-extra>
                        <CharacterAssetPicker
                            kind="pet"
                            single
                            :disabled="reading || locked || saving"
                            @pick="pickWarehouse"
                        />
                    </template>
                </PetDetailForm>
            </PetScreenshot>
        </div>
        <p v-else class="note pet-missing-note">这只召唤兽已经不在了。</p>
        <OcrSummary :reports="reports" />

        <template #footer>
            <FormActions
                :error="saveError"
                cancel-label="放弃这次修改"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                submit-label="保存这只召唤兽"
                :submit-disabled="!canSave"
                @cancel="requestClose"
                @submit="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.pet-quick {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
}
.pet-missing-note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: center;
}
</style>
