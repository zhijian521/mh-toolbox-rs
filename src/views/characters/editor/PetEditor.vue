<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import AppIcon from '../../../components/AppIcon.vue';
import PressButton from '../../../components/PressButton.vue';
import PressTile from '../../../components/PressTile.vue';
import PetDetailForm from './PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import PetImage from '../PetImage.vue';
import { applyPetPanel, emptyPet, type PetPanelResult } from '../ocr/pet-panel';
import type { Pet } from '../pets';
import { focusInput } from '../focus-input';

const emit = defineEmits<{ busy: [value: boolean] }>();

/** 左侧目录与分区导航常驻，右侧只编辑选中的召唤兽，长详情独立滚动。 */
const pets = defineModel<Pet[]>({ required: true });
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
const form = ref<HTMLElement | null>(null);
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
async function focusName(index: number) {
    if (!pets.value[index]) return;
    selected.value = index;
    await nextTick();
    await focusInput(form, 'input[aria-label="召唤兽名称"]');
}
defineExpose({ focusName });
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
                </div>
                <nav class="pet-grid character-choice-grid" aria-label="召唤兽列表">
                    <button
                        v-for="(pet, index) in pets"
                        :key="index"
                        class="pet-choice character-choice"
                        type="button"
                        :class="{ selected: index === selected }"
                        :aria-label="`编辑第 ${index + 1} 只召唤兽：${petName(pet)}`"
                        :aria-pressed="index === selected"
                        :disabled="reading"
                        :title="`${petName(pet)} · ${pet.level} 级`"
                        @click="selected = index"
                    >
                        <PressTile class="pet-portrait" still>
                            <PetImage :name="pet.portrait || ''" kind="portrait" />
                        </PressTile>
                        <span class="pet-mark character-choice-mark" aria-hidden="true"></span>
                        <span class="pet-name">{{ petName(pet) }}</span>
                    </button>
                    <button
                        class="pet-add character-choice"
                        type="button"
                        aria-label="新增召唤兽"
                        title="新增召唤兽"
                        :disabled="reading"
                        @click="addPet"
                    >
                        <span class="pet-add-icon" aria-hidden="true">
                            <AppIcon name="add" />
                        </span>
                        <span class="pet-mark character-choice-mark" aria-hidden="true"></span>
                        <span class="pet-name">新增</span>
                    </button>
                </nav>
            </template>

            <section v-if="current" ref="form" class="pet-block">
                <PetDetailForm
                    :key="selected"
                    :model-value="current"
                    @update:model-value="pets[selected] = $event"
                >
                    <!-- 删除这一只放在名字输入右边（2026-11-10 用户：左栏去掉删除按钮，
                         「删除按钮添加在右侧召唤兽详情的名字输入的后面」）。它读的是**当前选中**
                         那一只，不再像上一版那样每格各留一枚压在角落。 -->
                    <template #name-extra>
                        <PressButton
                            danger
                            icon="trash"
                            :label="`删除第 ${selected + 1} 只召唤兽：${petName(current)}`"
                            :disabled="reading"
                            @click="removeAt(selected)"
                        />
                    </template>
                </PetDetailForm>
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
.pet-grid {
    flex: none;
    max-height: 208px;
    min-height: 0;
    overflow-y: auto;
}
.pet-portrait {
    --tile-w: 52px;
    --tile-r: var(--r-3);
}
.pet-portrait :deep(.pet-image) {
    background: transparent;
}
.pet-add-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border: var(--w-hair) dashed var(--rule-2);
    border-radius: var(--r-3);
    color: var(--muted);
    --icon-size: calc(22px * var(--fs-scale));
}
.pet-add:hover:not(:disabled) .pet-add-icon {
    border-color: var(--ochre);
    color: var(--ink);
}
.pet-name {
    width: 100%;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-mini);
    text-overflow: ellipsis;
    white-space: nowrap;
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
