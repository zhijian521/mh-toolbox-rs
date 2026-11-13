<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from '../editor/PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import { applyPetPanel } from '../ocr/pet-panel';
import { cloneDraft } from './clone-draft';
import { applyPet } from './quick-target';
import { EDITOR_H, EDITOR_W } from '../editor-metrics';
import { focusInput } from '../focus-input';
import { hasPetName, type Pet } from '../pets';
import type { CharacterData } from '../character';

/** 快速修改与整份编辑共用截图入口和四组表单，取消不修改原记录。 */
const props = withDefaults(
    defineProps<{
        character: CharacterData;
        index: number;
        saving?: boolean;
        locked?: boolean;
        retrying?: boolean;
        saveError?: string;
    }>(),
    { saving: false, locked: false, retrying: false, saveError: '' },
);
const emit = defineEmits<{ save: [character: CharacterData]; close: [] }>();

const source = computed(() => props.character.pets[props.index] ?? null);

/* 深拷贝的理由与坑见 `clone-draft.ts`：Esc 该是「什么都没发生」。 */
const pet = ref<Pet | null>(source.value ? cloneDraft(source.value) : null);

const reading = ref(false);
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
    if (pet.value) pet.value = applyPetPanel(pet.value, result);
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
        @close="!saving && emit('close')"
    >
        <div v-if="pet" ref="form" :inert="locked || saving" class="pet-quick">
            <PetScreenshot @recognize="recognize" @busy="reading = $event">
                <PetDetailForm v-model="pet" />
            </PetScreenshot>
        </div>
        <p v-else class="note">这只召唤兽已经不在了。</p>

        <template #footer>
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次修改"
                :disabled="saving"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                label="保存这只召唤兽"
                seal
                :disabled="!canSave"
                @click="save"
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
.note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: center;
}
</style>
