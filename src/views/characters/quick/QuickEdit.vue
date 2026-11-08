<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import CounterField from '../../../components/CounterField.vue';
import PressButton from '../../../components/PressButton.vue';
import { assistIcon, schoolSkillIcon } from '../../../services/game-icons';
import IconTile from '../IconTile.vue';
import GearQuick from './GearQuick.vue';
import PetQuick from './PetQuick.vue';
import { applyQuick, isScalarTarget, quickPanel, type QuickTarget } from './quick-target';
import type { CharacterData } from '../character';

/**
 * 快速修改：**点哪一项就改哪一项**。
 *
 * ---- 它是个分发器，不是唯一那张表单 ----
 * 五类单值项（属性 / 经验 / 技能 / 辅助 / 修炼）在这份文件里——窄窗、字段表驱动，
 * 一屏只有一两格。装备与召唤兽不行：一件装备八段、一只兽二十来格，压成几格之后
 * 用户的原话是「太简单了」。所以它们各有整份表单（`GearQuick` / `PetQuick`），
 * 这里只负责把「点了什么」转过去。
 *
 * ---- 为什么不就地改（像截图识别那样把签换成格） ----
 * 那一条的前提是「周围还有二十个同类读数要一起核对」，格与签同尺寸才不打断扫视。
 * 而日常修正只改一项，就地开格会把卡面变成一张表单，还挤掉 `--tag-w` 那个固定宽度。
 * 弹窗保留卡的原样，改完抬眼就能看见结果——和识别那条的取舍正好相反，因为目的不同。
 *
 * ---- 保存是一次整体替换 ----
 * 三条路都返回新的整份 `CharacterData`，交给 `CharactersView` 的 `update()`
 * （按 id 整条替换 + 落盘）。这里不碰存储：写库的闸门全在 `roster.ts`
 * 与 `persist.ts` 那一层，多一条写入路径就等于多绕一道闸。
 */
const props = defineProps<{ character: CharacterData; target: QuickTarget }>();
const emit = defineEmits<{ save: [character: CharacterData]; close: [] }>();

/* 当前该画哪几格。点开之后数据被别处改掉、或者传错了定位键时是 `null`——
 * 那时窗里什么都不画，保存也点不动（见下面的 `canSave`）。
 *
 * 装备与召唤兽在这里恒为 `null`：它们不画字段表，走下面模板里的两个整份表单。 */
const scalar = computed(() => (isScalarTarget(props.target) ? props.target : null));
const panel = computed(() => (scalar.value ? quickPanel(props.character, scalar.value) : null));
const skillName = computed(() => {
    const target = props.target;
    return target.kind === 'skill' || target.kind === 'assist' ? target.name : '';
});
const skillIcon = computed(() => {
    const target = props.target;
    if (target.kind === 'skill') return schoolSkillIcon(target.name);
    if (target.kind === 'assist') return assistIcon(target.name, target.assist);
    return undefined;
});

/* 装备与召唤兽各自要的那一个参数。写成 computed 而不是在模板里直接 `target.slot`：
 * 判别联合在模板里的收窄不可靠（`target` 是 `QuickTarget`，`v-if` 收窄跨属性时
 * Volar 会退回联合类型，于是 `:slot` 收到 `string | number`）。 */
const gearSlot = computed(() => (props.target.kind === 'gear' ? props.target.slot : null));
const petIndex = computed(() => (props.target.kind === 'pet' ? props.target.index : null));

/* 草稿：**一律字符串**。数字格也存字符串，因为 `NumberField` 的 `0` 与「空」在这个
 * 窗里是两件事（上限空 = 不知道），而 `NumberField` 自己已经把「空 → 0」处理过一轮，
 * 这里只需要在保存时把 0 当成「没填」。 */
const draft = ref<Record<string, string>>({});
for (const field of panel.value?.fields ?? []) draft.value[field.key] = field.value;

/* 必填只有召唤兽的名字。`trim` 之后再判：全是空格的名字与空名字一样，
 * 存下去会被 `normalizePet` 丢掉。
 *
 * 另外：找不到那一项（`panel` 为 `null`）时保存必须点不动——否则按下去什么都不发生，
 * 读起来像「保存坏了」。 */
const canSave = computed(() => {
    const current = panel.value;
    if (!current) return false;
    return current.fields.every(
        (field) => !field.required || (draft.value[field.key] ?? '').trim() !== '',
    );
});

function save() {
    const current = panel.value;
    if (!current || !canSave.value || !scalar.value) return;
    emit('save', applyQuick(props.character, scalar.value, draft.value));
}

/* 打开就落在**第一格输入**上，不落在第一个可聚焦元素上。
 *
 * 数字格里第一个可聚焦的是那枚减号：`ModalShell` 的 `initialFocus: 'first'` 会让
 * 它一进来就带一圈朱色焦点环，屏幕上读起来像「减号已被选中」——而用户想改的是数字。
 * 所以这里传 `none` 自己定位（`ModalShell` 那条 `none` 就是为这种窗留的）。 */
const form = ref<HTMLElement | null>(null);

onMounted(async () => {
    await nextTick();
    form.value?.querySelector<HTMLInputElement>('input')?.focus();
});
</script>

<template>
    <!-- 装备与召唤兽：整份表单，宽度按内容给（一件装备八段、一只兽二十来格）。
         它们不经过下面那张字段表——一条装备的属性、状态、特殊都是「行」，不是「格」。
         Esc / 点遮罩两条路都通，与窄窗同一个 `use-modal`。 -->
    <GearQuick
        v-if="gearSlot"
        :character="props.character"
        :slot-name="gearSlot"
        @save="emit('save', $event)"
        @close="emit('close')"
    />
    <PetQuick
        v-else-if="petIndex !== null"
        :character="props.character"
        :index="petIndex"
        @save="emit('save', $event)"
        @close="emit('close')"
    />
    <ModalShell
        v-else
        class="character-theme"
        :data-school="character.school || ''"
        :title="skillName ? '快速修改' : (panel?.title ?? '快速修改')"
        :width="340"
        initial-focus="none"
        @close="emit('close')"
    >
        <div v-if="panel" ref="form" class="quick-form">
            <div v-if="skillName" class="quick-skill">
                <IconTile v-if="skillIcon" class="quick-icon" :src="skillIcon" aria-hidden="true" />
                <span class="quick-skill-name">{{ skillName }}</span>
            </div>
            <!-- 一项 = 一小段：**名字在上、控件在下占满一行并居中**，照记价窗那一枚
                 （`PriceField` 的排法）。先前是「标签在左、格在右」的表单行，那样
                 数字只有一条窄缝，加减印块挤在两端，读起来是「表格里的一格」；
                 这里要的是「一个读数」——所以它值得单独一行、也值得大一号。
                 外面不是 `<label>`：数字格里有加减按钮，`<label>` 会把「点按钮」
                 也当成「聚焦输入框」。 -->
            <div v-for="field in panel.fields" :key="field.key" class="quick-field">
                <span class="field-label">{{ field.label }}</span>
                <CounterField
                    v-if="field.numeric"
                    :model-value="draft[field.key] ?? ''"
                    :label="field.label"
                    :precision="field.precision"
                    :step="field.step"
                    :unit="field.unit"
                    @update:model-value="draft[field.key] = $event"
                />
                <input
                    v-else
                    v-model="draft[field.key]"
                    class="field"
                    :aria-label="field.label"
                    :required="field.required"
                    autocomplete="off"
                />
            </div>
        </div>

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
                label="保存这一项"
                seal
                :disabled="!canSave"
                @click="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 一列「小段」：每项自己成一格，段与段之间 14——比行内的 10 松一档，
 * 因为现在每一段有两行（名字 + 控件），段距太小会读成三行挤在一起。 */
.quick-form {
    display: grid;
    gap: 14px;
}
.quick-skill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}
.quick-form .quick-icon {
    --tile-w: calc(48px * var(--fs-scale));
    --tile-h: calc(48px * var(--fs-scale));
    --shot: calc(40px * var(--fs-scale));
    flex-shrink: 0;
}
.quick-skill-name {
    font-size: calc(var(--fs-base) + 2px);
    font-weight: 600;
}
.quick-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
}
/* 名字居中、字距放开一档：它是这一段的标题，不是表单左侧的字段名。 */
.quick-field .field-label {
    width: auto;
    letter-spacing: 0.18em;
}
/* 文本格与数字格**同宽同高**（272 × 42）：同一窗里两种器件若宽度不同，
 * 一列读下来左右缘会像被啃掉一口。文字也居中——它现在是「一个值」，
 * 不是「一行待填的表单」。 */
.quick-field > .field {
    width: min(calc(272px * var(--fs-scale)), 100%);
    height: calc(42px * var(--fs-scale));
    padding: 0 12px;
    border-radius: var(--r-3);
    font-size: calc(var(--fs-base) + 1px);
    text-align: center;
}
</style>
