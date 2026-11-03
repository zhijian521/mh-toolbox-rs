<script setup lang="ts">
import { computed } from 'vue';
import CostSwitch from '../../../components/CostSwitch.vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import SelectField from '../../../components/SelectField.vue';
import type { AssistKind, AssistSkill, SkillRow } from '../character';
import { lifeSkills, schoolSkillCap, storySkills } from '../../../services/game-data';

/**
 * 师门 / 辅助共用一张表：形状一样（名字 + 等级 + 上限），只差一列「未学」。
 *
 * 合成一个组件而不是两个，是因为**行本身是同一件东西**——两边都是游戏里一列技能，
 * 只是辅助那一页会显示「没学的也占一行」。分成两个组件，将来加一列（比如修炼进度）
 * 就要改两处，而这两处永远该一起变。
 *
 * `kind` 不叫 `variant`：它不改变这一行的长相，只决定**有没有额外那一列**。
 */
const props = withDefaults(
    defineProps<{
        kind?: 'skill' | 'assist';
        /**
         * 名字不许改、也不许增删——门派技能就是这种：选了门派就有那七项，
         * 名字是游戏给的（见 `game/data/schools.json`）。名字一栏改成纯文字，行尾的删
         * 与底部的「加一项」一起收起来，用户只剩「填等级」这一件事。
         */
        fixedNames?: boolean;
        /** 只为空表时那句提示：读屏与人都要知道「七项从哪来」。 */
        school?: string;
        /**
         * 只显示某一类（`life` / `story`）——辅助技能页把它拆成**上下两块**：
         * 上面生活、下面剧情（2026-11-03 用户要求，卡片那一页也是这个读法）。
         *
         * 两个实例绑的是**同一个** `draft.assists`：这里只过滤显示、加项时带上本块的
         * `kind`、删项时按对象身份回到原数组去删。分成两个数组要改存档结构，
         * 而存档里「属于哪一类」本来就是每一行自己的字段。
         *
         * 传了它，行内的「生活 / 剧情」切换就不该再出现——块已经说明了类别，
         * 再给一个能改的开关，等于允许「剧情技能」这一块里放进生活技能。
         */
        group?: AssistKind;
    }>(),
    { kind: 'skill', fixedNames: false, school: '', group: undefined },
);

/* 行数组走 `v-model`：增删要写回数组本身，只读 prop 过不了 `vue/no-mutating-props`。
 * 传进来的仍是草稿里那一个数组（同一个引用），没有第二份副本。 */
const rows = defineModel<SkillRow[]>({ required: true });

/* 师门技能上限一直 180（用户 2026-11-02 确认；数值在 `game/data/schools.json` 的 `cap`，
 * 由 `schoolSkillCap()` 读），新增时就带上——否则每加一项都要手填一次。
 * 辅助不预设上限：生活技能按等级段走、剧情技能 5 级，两类不同，名录里也没存这个数，
 * 留空由用户填（留空 = 不知道，见 `SkillRow.cap`）。
 * 名字也从空开始：**不能替他选一个**——「加了一行」不等于「这个号学了第一项」。 */
function addRow() {
    if (props.kind === 'assist') {
        rows.value.push({ name: '', level: 0, kind: props.group ?? 'life' } as AssistSkill);
    } else {
        rows.value.push({ name: '', level: 0, cap: schoolSkillCap() });
    }
}

/* 删的是**原数组里那一个对象**：分组模式下 `visible` 是过滤出来的新数组，
 * 用它的下标去 splice 会删错行（两类的下标本来就不连续）。 */
function removeRow(row: SkillRow) {
    const index = rows.value.indexOf(row);
    if (index >= 0) rows.value.splice(index, 1);
}

/* 辅助技能要把「生活 / 剧情」带上：两类在同一张表里，没有这个字段就分不出
 * 「强身术 100」与「调息 5」是同一把尺子还是两把。 */
const TYPE_OPTIONS: { value: AssistKind; label: string }[] = [
    { value: 'life', label: '生活' },
    { value: 'story', label: '剧情' },
];

const kindOf = (row: SkillRow): AssistKind => (row as AssistSkill).kind ?? 'life';

function setKind(row: SkillRow, kind: AssistKind) {
    (row as AssistSkill).kind = kind;
}

/* 分组模式只看本类；不分组时就是整个数组（师门技能那条路一点没变）。 */
const visible = computed(() =>
    props.group ? rows.value.filter((row) => kindOf(row) === props.group) : rows.value,
);

/* ---------- 名字改成下拉（2026-11-03 用户要求） ----------
 * 辅助技能的名字本来在 `game/data/skills.json` 里就是一份**固定名录**（生活 21、剧情 11），
 * 手敲只会敲出三种结果：错字、同音字、表里没有的名字——而卡片按名字查图标
 * （下标即图标序号），名字错一个字，那一格就没有图，还不报错。
 *
 * 与门派下拉同一条兜底：**表外的名字保留一项**。老存档里手敲过的名字（或者游戏改版
 * 删掉/新增的技能）如果不补进选项，下拉会显示成「选择技能」，看起来像名字被清空了——
 * 用户一保存，那一项就真的没了。
 */
const lifeOptions = computed(() => lifeSkills().map((name) => ({ value: name, label: name })));
const storyOptions = computed(() => storySkills().map((name) => ({ value: name, label: name })));

function optionsFor(row: SkillRow): { value: string; label: string }[] {
    const base = (props.group ?? kindOf(row)) === 'story' ? storyOptions.value : lifeOptions.value;
    const current = row.name;
    return current && !base.some((option) => option.value === current)
        ? [{ value: current, label: `${current}（不在表里）` }, ...base]
        : base;
}
</script>

<template>
    <div class="skill-editor">
        <div
            v-for="row in visible"
            :key="rows.indexOf(row)"
            class="erow"
            :class="{ off: row.off, fixed: props.fixedNames }"
        >
            <!-- 名字由门派带入时只显示、不可编辑：这一栏是**查表来的**，
                 给人改的自由度只会让它与门派对不上（卡片、图标都按名字查）。 -->
            <span v-if="props.fixedNames" class="name-text">{{ row.name }}</span>
            <!-- 辅助技能的名字也是一份查表来的名录（`game/data/skills.json`），
                 所以同样是**选**而不是写：见脚本里 `optionsFor` 上面那段。 -->
            <SelectField
                v-else
                v-model="row.name"
                class="name-select"
                label="技能名"
                placeholder="选择技能"
                :options="optionsFor(row)"
            />
            <SegmentedPills
                v-if="props.kind === 'assist' && !props.group"
                :model-value="kindOf(row)"
                :options="TYPE_OPTIONS"
                radius="sm"
                label="技能类别"
                @update:model-value="setKind(row, $event)"
            />
            <NumberField
                :model-value="row.level"
                label="等级"
                class="lv-field"
                @update:model-value="row.level = $event"
            />
            <!-- 门派技能的上限是一个表级的数（`game/data/schools.json` 的 `cap`），
                 七行各摆一个「180」的输入格只是噪音，也不存在「这一项上限不是它」的情况。
                 所以这里只写出来、不给编辑。 -->
            <span v-if="props.fixedNames" class="cap-text num"
                >/{{ row.cap ?? schoolSkillCap() }}</span
            >
            <!-- 自由列表（辅助）上限留空 = 不知道。存 0 会把「不知道」变成
                 「不可能是满级」，所以这里写回的是 `undefined`（见 `SkillRow.cap`）。 -->
            <NumberField
                v-else
                :model-value="row.cap ?? 0"
                zero-as-empty
                label="上限"
                placeholder="上限"
                class="cap-field"
                @update:model-value="row.cap = $event || undefined"
            />
            <CostSwitch
                v-if="props.kind === 'assist'"
                :model-value="row.off === true"
                off-label="已学"
                on-label="未学"
                @update:model-value="row.off = $event || undefined"
            />
            <PressButton
                v-if="!props.fixedNames"
                icon="trash"
                label="删掉这一项"
                @click="removeRow(row)"
            />
        </div>

        <div class="skill-foot">
            <PressButton
                v-if="!props.fixedNames"
                icon="add"
                text="加一项"
                :label="
                    props.group
                        ? `加一项${props.group === 'story' ? '剧情' : '生活'}技能`
                        : '加一项技能'
                "
                @click="addRow"
            />
            <!-- 两种表的收尾文案不同：辅助那张的名字从名录里选（没选就等于没这一项），
                 门派这张是查表来的（改门派才算变更）。同一句话罩两件事，必然有一头是错的。 -->
            <span v-if="props.fixedNames" class="hint">
                {{
                    rows.length
                        ? '名字由门派带入；换门派会按名字重算，已填的等级留着'
                        : props.school
                          ? `${props.school} 没有查到门派技能`
                          : '上面选好门派，这七项会自己带进来'
                }}
            </span>
            <span v-else class="hint">没选技能名的行，保存时会被丢掉</span>
        </div>
    </div>
</template>

<style scoped>
/* 与修炼那一列同宽：两个页签的行如果宽度不同，来回切换时整列会左右跳。
 * 固定宽而不是 flex: 1——撑满会把等级推进行尾，中间空一片。
 *
 * 选择器带上 `.erow`（而不是只写 `.name-select`）：`SelectField` 的根自己带着
 * `flex: 1`，两条规则特异性相同时谁生效取决于样式注入顺序——不押这个。 */
.erow .name-select {
    flex: none;
    width: 200px;
}
/* 名字是查表来的，不是输入框：同一列起点，但不上凹槽——**凹槽的意思是
 * 「这里可以写」**，写不了却画成可以写，比少一个格子更糟。
 *
 * 定宽 200 时，右边那两格（等级 / 上限）会停在一行中间，离名字空出一大截，
 * 七行看下来像「数字漂在纸中间」。名字改成吃掉剩下的宽度，两个数字就贴到右缘、
 * 七行成列——与卡上「名目在左、数值在右」是同一个读法。 */
.name-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 上限的只读写法：`/180`，与卡上那枚签同一个意思（这里不挂签，是因为
 * 七行全一样，签会变成七枚重复的邮票）。 */
.cap-text {
    flex: none;
    width: 66px;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}
.lv-field {
    width: 66px;
}
.cap-field {
    width: 66px;
}
/* 未学那一行整行降一档：与卡内那张表同一个说法（`.skill-row.off`），
 * 编辑时也要一眼看出「这行是没学的」，否则录完回头核对得逐条读。
 * 下拉里的字是子组件的，要 `:deep` 才够得着。 */
.off .name-select :deep(.select-text) {
    color: var(--muted);
}
.skill-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
}
.erow :deep(.cost-opt) {
    padding: 3px 6px;
}
</style>
