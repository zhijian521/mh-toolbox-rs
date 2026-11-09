<script setup lang="ts">
import { computed, onMounted } from 'vue';
import PaperCard from '../../../components/PaperCard.vue';
import NumberField from '../../../components/NumberField.vue';
import { PET_QUALITY_FIELDS, PET_SKILL_SLOTS, type Pet } from '../character';
import { loadPetAssets, petAssets } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';
import { petDetailSlots } from '../pets';
import PetPortraitPicker from './PetPortraitPicker.vue';

/** 全部修改和单只快速修改共用的分组表单。 */
const pet = defineModel<Pet>({ required: true });
const attrs = computed(
    () => petAssets.value?.panel.attributes ?? pet.value.attrs.map((row) => row.label),
);
const points = computed(
    () => petAssets.value?.panel.points ?? pet.value.points?.map((row) => row.label) ?? [],
);
const skillSlots = computed(() => petDetailSlots(pet.value.skills, PET_SKILL_SLOTS));
const groups = computed(() => [
    { key: 'attrs' as const, title: '属性', labels: attrs.value },
    { key: 'points' as const, title: '加点', labels: points.value },
]);
const assetError = computed(() => !petAssets.value);
onMounted(() => {
    void loadPetAssets().catch(() => {});
});
function valueFor(kind: 'attrs' | 'points', label: string): string {
    return pet.value[kind]?.find((row) => row.label === label)?.value ?? '';
}
function setValue(kind: 'attrs' | 'points', label: string, event: Event) {
    const rows = (pet.value[kind] ??= []);
    const value = (event.target as HTMLInputElement).value;
    const row = rows.find((one) => one.label === label);
    if (row) row.value = value;
    else rows.push({ label, value });
}

// 失焦后才拆分名单，输入过程不重排文本和光标。
function readNames(event: Event): string[] {
    return (event.target as HTMLTextAreaElement).value
        .split(/[,，、\s]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}
</script>

<template>
    <PaperCard class="pet-form">
        <div class="pet-content">
            <header class="pet-identity">
                <PetPortraitPicker
                    :model-value="pet.portrait || ''"
                    @update:model-value="pet.portrait = $event"
                />
                <div class="id7 pet-fields">
                    <label class="id-cell pet-name-field span-2">
                        <input
                            v-model="pet.name"
                            class="field"
                            aria-label="召唤兽名称"
                            placeholder="召唤兽名称"
                        />
                    </label>
                    <label class="id-cell slip-row sm">
                        <span class="slip-name">等级</span>
                        <NumberField
                            class="num-slot value-field"
                            :model-value="pet.level"
                            label="等级"
                            zero-as-empty
                            @update:model-value="pet.level = $event"
                        />
                    </label>
                    <label class="id-cell slip-row sm">
                        <span class="slip-name">参战等级</span>
                        <NumberField
                            class="num-slot value-field"
                            :model-value="pet.joinLevel"
                            label="参战等级"
                            zero-as-empty
                            @update:model-value="pet.joinLevel = $event"
                        />
                    </label>
                </div>
            </header>

            <div class="pet-layout">
                <section
                    v-for="group in groups"
                    :key="group.key"
                    class="pet-group"
                    :data-pet-group="group.key"
                >
                    <div class="group-head">
                        <span class="section-mark"></span>{{ group.title }}
                    </div>
                    <div class="slip-rows sm" :class="group.key">
                        <label
                            v-for="label in group.labels"
                            :key="label"
                            class="id-cell slip-row sm"
                        >
                            <span class="slip-name">{{ label }}</span>
                            <input
                                class="field num num-slot value-field"
                                inputmode="numeric"
                                :aria-label="'召唤兽' + label"
                                :value="valueFor(group.key, label)"
                                @input="setValue(group.key, label, $event)"
                            />
                        </label>
                    </div>
                </section>
                <section class="pet-group wide" data-pet-group="quality">
                    <div class="group-head"><span class="section-mark"></span>资质</div>
                    <div class="q6 pet-fields slip-rows sm">
                        <label
                            v-for="field in PET_QUALITY_FIELDS"
                            :key="field.key"
                            class="q-cell slip-row sm"
                        >
                            <span class="slip-name">{{ field.label }}</span>
                            <NumberField
                                class="num-slot value-field"
                                :model-value="pet.quality[field.key]"
                                :label="field.label + '资质'"
                                zero-as-empty
                                @update:model-value="pet.quality[field.key] = $event"
                            />
                        </label>
                    </div>
                    <div class="pet-facts">
                        <label class="slip-row sm"
                            ><span class="slip-name">成长</span
                            ><input
                                v-model="pet.growth"
                                class="field num num-slot value-field"
                                inputmode="decimal"
                                aria-label="成长"
                        /></label>
                        <label class="slip-row sm"
                            ><span class="slip-name">寿命</span
                            ><NumberField
                                class="num-slot value-field"
                                :model-value="pet.life"
                                label="寿命"
                                zero-as-empty
                                @update:model-value="pet.life = $event"
                        /></label>
                        <label class="slip-row sm"
                            ><span class="slip-name">五行</span
                            ><input
                                v-model="pet.element"
                                class="field num-slot value-field"
                                aria-label="五行"
                        /></label>
                    </div>
                </section>
                <section class="pet-group wide list-block" data-pet-group="skills">
                    <div class="group-head">
                        <span class="section-mark"></span>技能<span class="cnt num"
                            >{{ pet.skills.length }} 项</span
                        >
                    </div>
                    <div class="skill-icons">
                        <span
                            v-for="(name, index) in skillSlots"
                            :key="index"
                            class="slot"
                            :class="{ off: !name }"
                        >
                            <PetImage v-if="name" :name="name" /><small>{{ name || '—' }}</small>
                        </span>
                    </div>
                    <textarea
                        class="field area"
                        rows="2"
                        aria-label="已学技能，顿号或逗号分隔"
                        placeholder="技能名称，用顿号或逗号分隔"
                        :value="pet.skills.join('、')"
                        @change="pet.skills = readNames($event)"
                    />
                </section>
            </div>
            <p v-if="assetError" class="note">召唤兽字段表未加载，可重新打开此窗口重试。</p>
        </div>
    </PaperCard>
</template>

<style scoped src="./pet-detail-form.css"></style>
