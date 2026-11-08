<script setup lang="ts">
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import { PET_PILL_SLOTS, PET_QUALITY_FIELDS, PET_SKILL_SLOTS, type Pet } from '../character';

/**
 * 一只召唤兽的**全部字段**：身份七项 + 六项资质 + 战斗属性 + 技能 12 格 + 内丹 8 格。
 *
 * ---- 为什么单独成组件 ----
 * 与 `GearDetailForm` 同一条理由：这份表单原先只长在 `PetEditor` 的右栏里，2026-11-07
 * 快速修改也要能改整只兽（用户：「装备和宝宝比较复杂，直接展示……所有内容进行修改」）。
 * 复制一份的话，「加一项资质」这种改动必然漏一边，而漏掉的那一边不报错，只是
 * 「在编辑器里能填、在快捷窗里看不见」。
 *
 * ---- 它不管的那些 ----
 * 左栏那只目录、行尾的删除、页脚的「删掉这一只」都属于外壳：那些回答的是
 * 「在改哪一只」，不是「这一只长什么样」。
 */
const pet = defineModel<Pet>({ required: true });

/* 技能与内丹都是「一串名字」。用 textarea + `@change`（失焦才解析）而不是 `v-model`：
 * 每敲一个字就 split 再 join 会把用户正在输入的那一格重排，光标跳到行首。
 * 顿号、逗号、空格、换行都当分隔符——手抄游戏面板时四种都会出现。 */
function readNames(event: Event): string[] {
    return (event.target as HTMLTextAreaElement).value
        .split(/[,，、\s]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}

const nameList = (list: string[]) => list.join('、');
</script>

<template>
    <div class="pet-form">
        <!-- 身份七格：名字占两格，其余各一格。标签在上、值在下——
             这一页的列宽只有 99，标签放左边会把输入格压到 60 以下。 -->
        <div class="id7">
            <label class="id-cell span-2">
                <span class="id-k">名字</span>
                <input
                    v-model="pet.name"
                    class="field"
                    aria-label="召唤兽名称"
                    placeholder="召唤兽名称"
                />
            </label>
            <label class="id-cell">
                <span class="id-k">等级</span>
                <NumberField
                    :model-value="pet.level"
                    label="等级"
                    @update:model-value="pet.level = $event"
                />
            </label>
            <label class="id-cell">
                <span class="id-k">参战等级</span>
                <NumberField
                    :model-value="pet.joinLevel"
                    label="参战等级"
                    @update:model-value="pet.joinLevel = $event"
                />
            </label>
            <label class="id-cell">
                <span class="id-k">成长</span>
                <input v-model="pet.growth" class="field" aria-label="成长" />
            </label>
            <label class="id-cell">
                <span class="id-k">五行</span>
                <input v-model="pet.element" class="field" aria-label="五行" placeholder="火" />
            </label>
            <label class="id-cell">
                <span class="id-k">寿命</span>
                <NumberField
                    :model-value="pet.life"
                    label="寿命"
                    @update:model-value="pet.life = $event"
                />
            </label>
            <label class="id-cell">
                <span class="id-k">灵性</span>
                <NumberField
                    :model-value="pet.spirit ?? 0"
                    zero-as-empty
                    label="进阶灵性"
                    @update:model-value="pet.spirit = $event || undefined"
                />
            </label>
        </div>

        <!-- 六项资质写死标签、只给数值：这六项是游戏面板的固定行，
             让用户自己敲「攻击资质」四个字，等于每次录入都重抄一遍面板。
             一行六格，从左到右就是面板那六行。 -->
        <div class="sec-head"><span class="section-mark"></span>资质</div>
        <div class="q6">
            <label v-for="field in PET_QUALITY_FIELDS" :key="field.key" class="q-cell">
                <span class="id-k">{{ field.label }}</span>
                <NumberField
                    :model-value="pet.quality[field.key]"
                    :label="`${field.label}资质`"
                    @update:model-value="pet.quality[field.key] = $event"
                />
            </label>
        </div>

        <!-- 战斗属性两列：只记上限，条目数不定，所以「加一条」跟着小标题走。 -->
        <div class="sec-head">
            <span class="section-mark"></span>战斗属性
            <span class="meta">只记上限</span>
            <PressButton
                class="sec-act"
                icon="add"
                text="加一条"
                label="加一条战斗属性"
                @click="pet.attrs.push({ label: '', value: '' })"
            />
        </div>
        <div class="attrs">
            <div v-for="(attr, ai) in pet.attrs" :key="ai" class="attr">
                <input
                    v-model="attr.label"
                    class="field attr-label"
                    aria-label="属性名"
                    placeholder="气血"
                />
                <input v-model="attr.value" class="field attr-value" aria-label="属性值" />
                <PressButton icon="trash" label="删掉这条属性" @click="pet.attrs.splice(ai, 1)" />
            </div>
        </div>
        <p v-if="!pet.attrs.length" class="hint">还没有记录战斗属性</p>

        <div class="lists">
            <label class="list-block">
                <span class="list-k">
                    技能
                    <i class="cnt num">{{ pet.skills.length }} / {{ PET_SKILL_SLOTS }}</i>
                </span>
                <textarea
                    class="field area"
                    rows="2"
                    aria-label="已学技能，顿号或逗号分隔"
                    placeholder="连击、必杀、吸血"
                    :value="nameList(pet.skills)"
                    @change="pet.skills = readNames($event)"
                />
                <!-- 一排小格：满没满不用数顿号。超出上限时前 N 格全实、计数仍说真话
                     （`13 / 12`）——这种数据不该被 `Math.min` 悄悄藏起来。 -->
                <span class="dots" aria-hidden="true">
                    <i
                        v-for="n in PET_SKILL_SLOTS"
                        :key="n"
                        :class="{ on: n <= pet.skills.length }"
                    ></i>
                </span>
            </label>
            <label class="list-block">
                <span class="list-k">
                    内丹
                    <i class="cnt num">{{ pet.innerPills.length }} / {{ PET_PILL_SLOTS }}</i>
                </span>
                <textarea
                    class="field area"
                    rows="2"
                    aria-label="内丹名，顿号或逗号分隔"
                    placeholder="狂怒、坚甲"
                    :value="nameList(pet.innerPills)"
                    @change="pet.innerPills = readNames($event)"
                />
                <span class="dots" aria-hidden="true">
                    <i
                        v-for="n in PET_PILL_SLOTS"
                        :key="n"
                        :class="{ on: n <= pet.innerPills.length }"
                    ></i>
                </span>
            </label>
        </div>
    </div>
</template>

<style scoped>
/* 一列字段，段距 7：编辑器右栏一直用的那个数（原来写在 `.pet-block` 上）。
 * 表单本身不设宽度与内衬——那是外壳的事。 */
.pet-form {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
}

/* ---------- 身份七格 ---------- */
.id7 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 14px;
}
.id-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.id-cell.span-2 {
    grid-column: span 2;
}
.id-k {
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
    line-height: 1;
}
/* 输入格吃掉整格宽：`NumberField` 自己兜的是 72，在 99 的列里会留一段空白；
 * 选择器要带 `.id-cell` / `.q6` 一层——`NumberField` 的 scoped 规则与这里同特异性，
 * 谁赢取决于注入顺序，多一层父选择器才稳（GearEditor 那条同一个坑）。 */
.id-cell .field,
.id-cell :deep(.number-field) {
    width: 100%;
}

/* ---------- 资质六格 ---------- */
.sec-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 4px;
}
.sec-head .section-mark {
    align-self: center;
}
/* 「加一条」推到右端：它属于这一段，但不像标题那样需要被读。 */
.sec-act {
    margin-left: auto;
}
.q6 {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
}
.q-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.q-cell :deep(.number-field) {
    width: 100%;
    text-align: right;
}

/* ---------- 战斗属性两列 ---------- */
.attrs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 18px;
}
.attr {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.attr-label {
    flex: none;
    width: 84px;
}
/* 数值右对齐：两列一左一右摆着时，扫的是同一列数字，不是同一列文字。 */
.attr-value {
    flex: 1;
    min-width: 0;
    text-align: right;
}

/* ---------- 技能 / 内丹 ---------- */
.lists {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-top: 3px;
}
.list-block {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.list-k {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
}
.cnt {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-style: normal;
    letter-spacing: 0.04em;
}
.list-block .area {
    width: 100%;
}
/* 一排小格。4px 高、圆角 1：再高就成进度条（那是另一个说法），
 * 再矮在暗色下会散成一条虚线。 */
.dots {
    display: flex;
    gap: 4px;
}
.dots i {
    flex: 1;
    height: 4px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--well) 62%, transparent);
}
.dots i.on {
    background: var(--num);
}
</style>
