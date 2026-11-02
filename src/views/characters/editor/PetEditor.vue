<script setup lang="ts">
import { ref } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import type { Pet } from '../character';

/**
 * 召唤兽：一只一行，展开填细节。
 *
 * 与装备同一个折叠逻辑（一次只开一只），但**理由不同**：装备是十二件全展开太长，
 * 召唤兽是「一屏四五只、只有一两只值得细填」——五开五个号，每个号的召唤兽
 * 往往只有主力的那一只能看，其余的能记住名字与等级就够。
 *
 * 资质六项写死标签、只给数值格子：这六项是游戏面板的固定行，让用户自己敲
 * 「攻击资质」四个字，等于每次录入都重抄一遍面板。
 */
const pets = defineModel<Pet[]>({ required: true });

const openIndex = ref<number | null>(null);

function toggle(index: number) {
    openIndex.value = openIndex.value === index ? null : index;
}

/* 标签照游戏面板的顺序：攻 / 防 / 血 / 法 / 速 / 闪。 */
const QUALITY_FIELDS = [
    { key: 'attack', label: '攻击' },
    { key: 'defense', label: '防御' },
    { key: 'hp', label: '气血' },
    { key: 'mp', label: '魔法' },
    { key: 'speed', label: '速度' },
    { key: 'dodge', label: '闪避' },
] as const;

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
    openIndex.value = pets.value.length - 1;
}

function removePet(index: number) {
    pets.value.splice(index, 1);
    // 删掉的是展开的那只（或它前面的一只）时，收起——否则展开的是「上一只」，
    // 谁都没点它却开着，看起来像删错了。
    if (openIndex.value !== null && openIndex.value >= index) openIndex.value = null;
}

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
    <div class="pet-editor">
        <div v-for="(pet, index) in pets" :key="index" class="pet-block">
            <div class="erow pet-head">
                <input
                    v-model="pet.name"
                    class="field name-field"
                    aria-label="召唤兽名称"
                    placeholder="召唤兽名称"
                />
                <!-- 两个数字框必须带**看得见的**标签：卡上那只列表读的是「136 级 · 参战 65」，
                     而两个 0 并排放着，光靠 aria-label 只有读屏知道谁是谁。 -->
                <span class="field-label">等级</span>
                <NumberField
                    :model-value="pet.level"
                    label="等级"
                    class="narrow-field"
                    @update:model-value="pet.level = $event"
                />
                <span class="field-label">参战</span>
                <NumberField
                    :model-value="pet.joinLevel"
                    label="参战等级"
                    class="narrow-field"
                    @update:model-value="pet.joinLevel = $event"
                />
                <PressButton
                    :icon="openIndex === index ? 'chevron-down' : 'chevron-right'"
                    :label="`${openIndex === index ? '收起' : '展开'} ${pet.name || '这只召唤兽'} 的详情`"
                    @click="toggle(index)"
                />
                <PressButton
                    icon="trash"
                    :label="`删掉 ${pet.name || '这只召唤兽'}`"
                    @click="removePet(index)"
                />
            </div>

            <div v-if="openIndex === index" class="detail">
                <div class="erow">
                    <span class="field-label">寿命</span>
                    <NumberField
                        :model-value="pet.life"
                        label="寿命"
                        class="narrow-field"
                        @update:model-value="pet.life = $event"
                    />
                    <span class="field-label">成长</span>
                    <input
                        v-model="pet.growth"
                        class="field growth-field"
                        aria-label="成长"
                        placeholder="1.202"
                    />
                    <span class="field-label">五行</span>
                    <input
                        v-model="pet.element"
                        class="field element-field"
                        aria-label="五行"
                        placeholder="火"
                    />
                    <span class="field-label">灵性</span>
                    <NumberField
                        :model-value="pet.spirit ?? 0"
                        zero-as-empty
                        label="进阶灵性"
                        placeholder="未进阶"
                        class="narrow-field"
                        @update:model-value="pet.spirit = $event || undefined"
                    />
                </div>

                <div class="sub-head"><span class="section-mark"></span>资质</div>
                <div class="quality-grid">
                    <div v-for="field in QUALITY_FIELDS" :key="field.key" class="erow">
                        <span class="field-label quality-label">{{ field.label }}</span>
                        <NumberField
                            :model-value="pet.quality[field.key]"
                            :label="`${field.label}资质`"
                            class="narrow-field"
                            @update:model-value="pet.quality[field.key] = $event"
                        />
                    </div>
                </div>

                <div class="sub-head">
                    <span class="section-mark"></span>战斗属性
                    <span class="meta">只记上限</span>
                </div>
                <div v-for="(attr, ai) in pet.attrs" :key="ai" class="erow">
                    <input
                        v-model="attr.label"
                        class="field attr-label"
                        aria-label="属性名"
                        placeholder="气血"
                    />
                    <input
                        v-model="attr.value"
                        class="field attr-value"
                        aria-label="属性值"
                        placeholder="1773"
                    />
                    <PressButton
                        icon="trash"
                        label="删掉这条属性"
                        @click="pet.attrs.splice(ai, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条战斗属性"
                        @click="pet.attrs.push({ label: '', value: '' })"
                    />
                </div>

                <div class="erow lists">
                    <label class="list-block">
                        <span class="field-label">技能</span>
                        <textarea
                            class="field area"
                            rows="2"
                            aria-label="已学技能，顿号或逗号分隔"
                            placeholder="连击、必杀、吸血"
                            :value="nameList(pet.skills)"
                            @change="pet.skills = readNames($event)"
                        />
                    </label>
                    <label class="list-block">
                        <span class="field-label">内丹</span>
                        <textarea
                            class="field area"
                            rows="2"
                            aria-label="内丹名，顿号或逗号分隔"
                            placeholder="狂怒、坚甲"
                            :value="nameList(pet.innerPills)"
                            @change="pet.innerPills = readNames($event)"
                        />
                    </label>
                </div>
            </div>
        </div>

        <div class="pet-foot">
            <PressButton icon="add" text="加一只" label="加一只召唤兽" @click="addPet" />
            <span class="hint">名字留空的保存时会被丢掉</span>
        </div>
    </div>
</template>

<style scoped>
.pet-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.pet-block {
    border: var(--w-hair) solid transparent;
}
.pet-block:has(.detail) {
    padding-bottom: 10px;
    border-color: var(--rule);
    background: var(--bg);
}
/* 与技能、修炼那两列同宽（200）：名册里四个分区来回切，第一列如果忽宽忽窄，
 * 眼睛每次都要重新找起点。召唤兽名最长是「天狗（人形）」六个字，200 放得下。 */
.name-field {
    width: 200px;
}
.narrow-field {
    width: 66px;
}
.growth-field {
    width: 72px;
}
.element-field {
    width: 46px;
}
.detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 2px;
}
.sub-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 4px;
}
.sub-head .section-mark {
    align-self: center;
}
/* 六项资质排三列：一项一行要占六行，而每行只有一个标签加一个数字，
 * 三列正好一屏放下，也顺带让数值成列对齐（比较两只兽时就是横着扫这几列）。
 *
 * 列宽写死 170 而不是 `1fr`：撑满时每列 210+，标签与数字之间空出一大片，
 * 六项读起来像六块互不相干的空地；170 = 标签 32 + 数字 66 + 两段间距还有余量。 */
.quality-grid {
    display: grid;
    grid-template-columns: repeat(3, 170px);
    gap: 5px 14px;
}
.quality-label {
    width: 32px;
}
.attr-label {
    width: 96px;
}
.attr-value {
    width: 96px;
}
.sub-foot {
    padding-left: 2px;
}
.lists {
    align-items: flex-start;
    gap: 10px;
    margin-top: 4px;
}
.list-block {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.list-block .area {
    width: 100%;
}
.pet-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
}
</style>
