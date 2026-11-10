<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppIcon from '../../../components/AppIcon.vue';
import PaperCard from '../../../components/PaperCard.vue';
import NumberField from '../../../components/NumberField.vue';
import { PET_QUALITY_FIELDS, type Pet } from '../character';
import { loadPetAssets, petAssets } from '../../../services/pet-assets';
import PetPortraitPicker from './PetPortraitPicker.vue';
import PetSkillPicker from './PetSkillPicker.vue';

/** 全部修改和单只快速修改共用的分组表单。 */
const pet = defineModel<Pet>({ required: true });
const attrs = computed(
    () => petAssets.value?.panel.attributes ?? pet.value.attrs.map((row) => row.label),
);
const points = computed(
    () => petAssets.value?.panel.points ?? pet.value.points?.map((row) => row.label) ?? [],
);
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

/* 新增一格填一张图标就选掉的**现成技能**，不留空名：空格子在网格里既看不出内容，
 * 也点不开（没有名字就没有可搜的关键词）。挑清单里第一招还没学的——它是图标墙最上面
 * 那一枚，用户点开纸片看到的也是它。清单没加载出来时先塞空串，纸片里选中即补上。 */
function addSkill() {
    const all = petAssets.value?.skills ?? [];
    const used = new Set(pet.value.skills);
    pet.value.skills.push(all.find((one) => !used.has(one.name))?.name ?? '');
}
</script>

<template>
    <PaperCard class="pet-form">
        <div class="pet-content">
            <!-- 头像只占一枚头像位，名称 / 等级 / 参战等级挪到它右边（2026-11-10 用户：
                 「选择召唤兽头像占据了很大一行，只占据个头像就行，后面我们可以把名称 等级
                 参战等级提上去放到右边」）。左侧是头像选择器（展开时是浮层，不撑高这一行），
                 右侧两段：名称一条、等级与参战等级并排一条——两段合起来约 62 高，
                 与左边那枚 64 的头像第一行对齐。 -->
            <header class="pet-identity">
                <PetPortraitPicker
                    :model-value="pet.portrait || ''"
                    @update:model-value="pet.portrait = $event"
                />
                <div class="pet-id">
                    <!-- 名字与「删除这一只」同一条：名字框收窄一点，右边放一枚删除。
                         插槽由外壳给（整份编辑窗传删除，快速修改窗不传，它就只剩名字框）。
                         用插槽而不是把删除写进表单：这张表单两处共用，删除属于外壳的职责。 -->
                    <div class="pet-name-row">
                        <label class="pet-name-field">
                            <input
                                v-model="pet.name"
                                class="field"
                                aria-label="召唤兽名称"
                                placeholder="召唤兽名称"
                            />
                        </label>
                        <slot name="name-extra" />
                    </div>
                    <div class="id-pair">
                        <label class="slip-row sm">
                            <span class="slip-name">等级</span>
                            <NumberField
                                class="num-slot value-field"
                                :model-value="pet.level"
                                label="等级"
                                zero-as-empty
                                @update:model-value="pet.level = $event"
                            />
                        </label>
                        <label class="slip-row sm">
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
                    <!-- 技能改成**一格一枚图标**：已学的一格一枚（点开下拉换），末尾一格「+」
                         添一格（2026-11-10 用户：「技能添加不使用输入框，可以在技能最后一个后面
                         通过 + 号图标添加，点击图标添加默认技能，然后点击技能图标可以下拉切换」）。
                         不再画固定十二个虚线空格：那些格子只是「还能学几招」的留白，点不动，
                         而这一版每一格都是能改的控件。 -->
                    <div class="skill-icons">
                        <PetSkillPicker
                            v-for="(name, index) in pet.skills"
                            :key="index"
                            :index="index"
                            :model-value="name"
                            @update:model-value="pet.skills[index] = $event"
                            @remove="pet.skills.splice(index, 1)"
                        />
                        <button
                            type="button"
                            class="slot skill-add"
                            aria-label="添加一个技能格"
                            @click="addSkill"
                        >
                            <AppIcon name="add" />
                            <small>添加</small>
                        </button>
                    </div>
                </section>
            </div>
            <p v-if="assetError" class="note">召唤兽字段表未加载，可重新打开此窗口重试。</p>
        </div>
    </PaperCard>
</template>

<style scoped src="./pet-detail-form.css"></style>
