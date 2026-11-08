<script setup lang="ts">
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import { PET_QUALITY_FIELDS, type Pet } from '../character';

/** 全部修改和单只快速修改共用的分组表单。 */
const pet = defineModel<Pet>({ required: true });

// 失焦后才拆分名单，输入过程不重排文本和光标。
function readNames(event: Event): string[] {
    return (event.target as HTMLTextAreaElement).value
        .split(/[,，、\s]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}
</script>

<template>
    <div class="pet-form">
        <div class="sec-head"><span class="section-mark"></span>基础</div>
        <div class="id7 pet-fields">
            <label class="id-cell slip-row sm span-2">
                <span class="id-k">名字</span>
                <input v-model="pet.name" class="field" aria-label="召唤兽名称" />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">等级</span>
                <NumberField
                    :model-value="pet.level"
                    label="等级"
                    zero-as-empty
                    @update:model-value="pet.level = $event"
                />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">参战等级</span>
                <NumberField
                    :model-value="pet.joinLevel"
                    label="参战等级"
                    zero-as-empty
                    @update:model-value="pet.joinLevel = $event"
                />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">成长</span>
                <input v-model="pet.growth" class="field num" aria-label="成长" />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">五行</span>
                <input v-model="pet.element" class="field" aria-label="五行" />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">寿命</span>
                <NumberField
                    :model-value="pet.life"
                    label="寿命"
                    zero-as-empty
                    @update:model-value="pet.life = $event"
                />
            </label>
            <label class="id-cell slip-row sm">
                <span class="id-k">灵性</span>
                <NumberField
                    :model-value="pet.spirit ?? 0"
                    label="进阶灵性"
                    zero-as-empty
                    @update:model-value="pet.spirit = $event || undefined"
                />
            </label>
        </div>

        <div class="sec-head"><span class="section-mark"></span>资质</div>
        <div class="q6 pet-fields">
            <label v-for="field in PET_QUALITY_FIELDS" :key="field.key" class="q-cell slip-row sm">
                <span class="id-k">{{ field.label }}</span>
                <NumberField
                    :model-value="pet.quality[field.key]"
                    :label="`${field.label}资质`"
                    zero-as-empty
                    @update:model-value="pet.quality[field.key] = $event"
                />
            </label>
        </div>

        <div class="sec-head">
            <span class="section-mark"></span>属性
            <PressButton
                class="sec-act"
                icon="add"
                text="新增"
                size="sm"
                label="新增战斗属性"
                @click="pet.attrs.push({ label: '', value: '' })"
            />
        </div>
        <div class="attrs slip-rows">
            <div v-for="(attr, index) in pet.attrs" :key="index" class="attr slip-row sm">
                <input v-model="attr.label" class="field attr-label" aria-label="属性名" />
                <input v-model="attr.value" class="field attr-value num" aria-label="属性值" />
                <PressButton
                    icon="trash"
                    size="sm"
                    label="删掉这条属性"
                    @click="pet.attrs.splice(index, 1)"
                />
            </div>
        </div>

        <div class="lists">
            <label class="list-block">
                <span class="sec-head">
                    <span class="section-mark"></span>技能
                    <span class="cnt num">{{ pet.skills.length }}</span>
                </span>
                <textarea
                    class="field area"
                    rows="2"
                    aria-label="已学技能，顿号或逗号分隔"
                    :value="pet.skills.join('、')"
                    @change="pet.skills = readNames($event)"
                />
            </label>
            <label class="list-block">
                <span class="sec-head">
                    <span class="section-mark"></span>内丹
                    <span class="cnt num">{{ pet.innerPills.length }}</span>
                </span>
                <textarea
                    class="field area"
                    rows="2"
                    aria-label="内丹名，顿号或逗号分隔"
                    :value="pet.innerPills.join('、')"
                    @change="pet.innerPills = readNames($event)"
                />
            </label>
        </div>
    </div>
</template>

<style scoped>
.pet-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
}
.sec-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 6px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.sec-act,
.cnt {
    margin-left: auto;
}
.cnt {
    color: var(--num);
    font-size: var(--fs-sm);
}
.pet-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
}
.span-2 {
    grid-column: span 2;
}
.id-cell,
.q-cell,
.attr {
    min-width: 0;
    gap: 7px;
}
.id-k {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.id-cell .field,
.q-cell .field {
    flex: 1;
    min-width: 0;
    width: 0;
}
.pet-form .field {
    height: calc(28px * var(--fs-scale));
    padding: 0 6px;
    text-align: center;
}
.attr .attr-label {
    flex: 2;
    min-width: 0;
    width: 0;
}
.attr .attr-value {
    flex: 1;
    min-width: 0;
    width: 0;
}
.lists,
.list-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
}
.pet-form .area {
    width: 100%;
    height: auto;
    min-height: 64px;
    padding: 8px;
    line-height: 1.5;
    text-align: left;
    resize: vertical;
}
</style>
