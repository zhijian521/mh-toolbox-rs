<script setup lang="ts">
import { computed, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from './PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import PetImage from '../PetImage.vue';
import { applyPetPanel, emptyPet, type PetPanelResult } from '../ocr/pet-panel';
import type { Pet } from '../character';

/** 左侧目录与分区导航常驻，右侧只编辑选中的召唤兽，长详情独立滚动。 */
const pets = defineModel<Pet[]>({ required: true });
const emit = defineEmits<{ busy: [value: boolean] }>();
const reading = ref(false);
function setBusy(value: boolean) {
    reading.value = value;
    emit('busy', value);
}
function recognize(result: PetPanelResult) {
    if (current.value) pets.value[selected.value] = applyPetPanel(current.value, result);
}
const selected = ref(0);
const revision = ref(0);
const current = computed(() => pets.value[selected.value] ?? null);
const petName = (pet: Pet) => pet.name.trim() || '未命名';

function addPet() {
    pets.value.push({ ...emptyPet(), name: '' });
    selected.value = pets.value.length - 1;
    revision.value++;
}

function removeAt(index: number) {
    pets.value.splice(index, 1);
    if (index < selected.value) selected.value -= 1;
    selected.value = Math.max(0, Math.min(selected.value, pets.value.length - 1));
    revision.value++;
}
</script>

<template>
    <div class="pet-editor">
        <PetScreenshot
            :key="`${selected}:${revision}`"
            :disabled="!current"
            @recognize="recognize"
            @busy="setBusy"
        >
            <template #navigation>
                <slot name="tabs" />
                <div class="pet-list-head">
                    <span
                        >召唤兽 <span class="pet-count">{{ pets.length }}</span></span
                    >
                    <PressButton
                        icon="add"
                        text="新增"
                        label="新增召唤兽"
                        :disabled="reading"
                        @click="addPet"
                    />
                </div>
                <nav class="pet-list slip-rows" aria-label="召唤兽列表">
                    <div
                        v-for="(pet, index) in pets"
                        :key="index"
                        class="pet-list-row slip-row"
                        :class="{ selected: index === selected }"
                    >
                        <button
                            class="pet-choice"
                            type="button"
                            :aria-label="`编辑第 ${index + 1} 只召唤兽：${petName(pet)}`"
                            :aria-pressed="index === selected"
                            :disabled="reading"
                            @click="selected = index"
                        >
                            <PetImage :name="pet.portrait || ''" kind="portrait" />
                            <span class="pet-name">{{ petName(pet) }}</span>
                            <span class="pet-level num">{{ pet.level }}</span>
                        </button>
                        <PressButton
                            icon="trash"
                            size="sm"
                            :label="`删除第 ${index + 1} 只召唤兽：${petName(pet)}`"
                            :disabled="reading"
                            @click="removeAt(index)"
                        />
                    </div>
                </nav>
            </template>

            <section v-if="current" class="pet-block">
                <PetDetailForm
                    :key="selected"
                    :model-value="current"
                    @update:model-value="pets[selected] = $event"
                />
            </section>
            <div v-else class="pet-empty well upright">暂无召唤兽，点击左侧“新增”开始记录</div>
        </PetScreenshot>
    </div>
</template>

<style scoped>
.pet-editor {
    display: flex;
    flex: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
.pet-list-head {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.pet-count {
    margin-left: 6px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.pet-list {
    flex: none;
    max-height: 160px;
    min-height: 0;
    overflow-y: auto;
}
.pet-choice :deep(.portrait) {
    --pet-icon-size: 30px;
}
.pet-choice:disabled {
    cursor: wait;
}
.pet-list-row {
    flex: none;
    gap: 8px;
}
.pet-list-row.selected {
    box-shadow: inset 3px 0 0 var(--ochre);
}
.pet-choice {
    display: flex;
    flex: 1;
    align-items: center;
    align-self: stretch;
    gap: 10px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
}
.pet-choice:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.pet-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pet-level {
    margin-left: auto;
    color: var(--num);
    font-size: var(--fs-sm);
}
.pet-block,
.pet-empty {
    flex: 1;
    min-width: 0;
    min-height: 0;
    border-radius: var(--r-2);
    overflow: hidden;
}
.pet-block {
    display: flex;
    flex-direction: column;
}
.pet-empty {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
