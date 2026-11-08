<script setup lang="ts">
import { computed, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from './PetDetailForm.vue';
import type { Pet } from '../character';

/** 左侧目录与分区导航常驻，右侧只编辑选中的召唤兽，长详情独立滚动。 */
const pets = defineModel<Pet[]>({ required: true });
const selected = ref(0);
const current = computed(() => pets.value[selected.value] ?? null);
const petName = (pet: Pet) => pet.name.trim() || '未命名';

function addPet() {
    pets.value.push({
        name: '',
        level: 0,
        joinLevel: 0,
        quality: { attack: 0, defense: 0, hp: 0, mp: 0, speed: 0, dodge: 0 },
        life: 0,
        growth: '',
        element: '',
        attrs: [],
        skills: [],
        innerPills: [],
    });
    selected.value = pets.value.length - 1;
}

function removeAt(index: number) {
    pets.value.splice(index, 1);
    if (index < selected.value) selected.value -= 1;
    selected.value = Math.max(0, Math.min(selected.value, pets.value.length - 1));
}
</script>

<template>
    <div class="pet-editor">
        <section class="pet-navigation">
            <slot name="tabs" />
            <div class="pet-list-head">
                <span
                    >召唤兽 <span class="pet-count">{{ pets.length }}</span></span
                >
                <PressButton icon="add" text="新增" label="新增召唤兽" @click="addPet" />
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
                        @click="selected = index"
                    >
                        <span class="pet-mark" aria-hidden="true">{{ pet.element || '兽' }}</span>
                        <span class="pet-name">{{ petName(pet) }}</span>
                        <span class="pet-level num">{{ pet.level }}</span>
                    </button>
                    <PressButton
                        icon="trash"
                        size="sm"
                        :label="`删除第 ${index + 1} 只召唤兽：${petName(pet)}`"
                        @click="removeAt(index)"
                    />
                </div>
            </nav>
        </section>

        <section v-if="current" class="pet-block well upright">
            <div class="pet-content">
                <PetDetailForm
                    :key="selected"
                    :model-value="current"
                    @update:model-value="pets[selected] = $event"
                />
            </div>
        </section>
        <div v-else class="pet-empty well upright">暂无召唤兽</div>
    </div>
</template>

<style scoped>
.pet-editor {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) var(--char-w);
    grid-template-rows: minmax(0, 1fr);
    gap: 16px;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
.pet-navigation {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    min-height: 0;
    overflow-y: auto;
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
.pet-mark {
    color: var(--ochre);
    font-size: var(--fs-sm);
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
    min-width: 0;
    min-height: 0;
    border-radius: var(--r-2);
    overflow: hidden;
}
.pet-block {
    display: flex;
    flex-direction: column;
}
.pet-content {
    flex: 1;
    min-height: 0;
    padding: 14px;
    overflow-y: auto;
}
.pet-empty {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
