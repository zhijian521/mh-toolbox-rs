<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from '../editor/PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import { applyPetPanel } from '../ocr/pet-panel';
import { applyPet } from './quick-target';
import { EDITOR_MIN_H, EDITOR_W } from '../editor-metrics';
import type { CharacterData, Pet } from '../character';

/** 快速修改与整份编辑共用截图入口和四组表单，取消不修改原记录。 */
const props = defineProps<{ character: CharacterData; index: number }>();
const emit = defineEmits<{ save: [character: CharacterData]; close: [] }>();

const source = computed(() => props.character.pets[props.index] ?? null);

/* 深拷贝的理由见 `GearQuick`：Esc 该是「什么都没发生」。 */
const pet = ref<Pet | null>(
    source.value ? (JSON.parse(JSON.stringify(source.value)) as Pet) : null,
);

const reading = ref(false);
const canSave = computed(() => !reading.value && (pet.value?.name ?? '').trim() !== '');

function save() {
    if (!pet.value || !canSave.value) return;
    emit('save', applyPet(props.character, props.index, pet.value));
}

function recognize(result: Parameters<typeof applyPetPanel>[1]) {
    if (pet.value) pet.value = applyPetPanel(pet.value, result);
}

const form = ref<HTMLElement | null>(null);

onMounted(async () => {
    await nextTick();
    form.value?.querySelector<HTMLInputElement>('input[aria-label="召唤兽名称"]')?.focus();
});
</script>

<template>
    <ModalShell
        class="character-theme"
        :data-school="character.school || ''"
        :title="`快速修改 · 召唤兽 ${pet?.name.trim() || '未命名'}`"
        :width="EDITOR_W"
        :min-height="EDITOR_MIN_H"
        fill
        initial-focus="none"
        @close="emit('close')"
    >
        <div v-if="pet" ref="form" class="pet-quick">
            <PetScreenshot @recognize="recognize" @busy="reading = $event">
                <PetDetailForm v-model="pet" />
            </PetScreenshot>
        </div>
        <p v-else class="note">这只召唤兽已经不在了。</p>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次修改"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                text="保存"
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
