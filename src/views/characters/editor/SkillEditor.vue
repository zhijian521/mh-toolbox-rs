<script setup lang="ts">
import { computed } from 'vue';
import CostSwitch from '../../../components/CostSwitch.vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import SelectField from '../../../components/SelectField.vue';
import SkillRow from '../SkillRow.vue';
import {
    isMaxed,
    type AssistKind,
    type AssistSkill,
    type SkillRow as SkillRowData,
} from '../character';
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
const rows = defineModel<SkillRowData[]>({ required: true });

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
function removeRow(row: SkillRowData) {
    const index = rows.value.indexOf(row);
    if (index >= 0) rows.value.splice(index, 1);
}

/* 辅助技能要把「生活 / 剧情」带上：两类在同一张表里，没有这个字段就分不出
 * 「强身术 100」与「调息 5」是同一把尺子还是两把。 */
const TYPE_OPTIONS: { value: AssistKind; label: string }[] = [
    { value: 'life', label: '生活' },
    { value: 'story', label: '剧情' },
];

const kindOf = (row: SkillRowData): AssistKind => (row as AssistSkill).kind ?? 'life';

function setKind(row: SkillRowData, kind: AssistKind) {
    (row as AssistSkill).kind = kind;
}

/* 分组模式只看本类；不分组时就是整个数组（师门技能那条路一点没变）。 */
const visible = computed(() =>
    props.group ? rows.value.filter((row) => kindOf(row) === props.group) : rows.value,
);

/* 师门那一页要读的第二个数：七项里练成几项。 */
const maxedCount = computed(() => rows.value.filter(isMaxed).length);

/* 上限只有一个来源：行上存着就用行上的（老数据可能是别的值），否则读表级常量。
 * 写成函数而不是在模板里 `row.cap ?? schoolSkillCap()` 两遍——两处各写一次，
 * 将来「上限从哪来」一改，就会只剩一半跟着改。 */
function capOf(row: SkillRowData): number {
    return row.cap ?? schoolSkillCap();
}

/* 名字与等级格的关联：`<label for>` + 输入格的 `id`。
 *
 * 为什么不给整行包 `<label>`：一行里现在有三类可标记元素的前身（<button> 刻度、
 * <input> 等级），而 label 只认第一个，点名字会把焦点送给第一格刻度。
 * 按**行下标**编号而不是按名字：名字理论上唯一，但用下标就不必依赖这个前提
 * （同一门派重复一项时也不会撞 id）。
 *
 * `id` 能落到 `<input>` 上靠的是 `NumberField` 的属性透传——它单根、没关 inheritAttrs，
 * 所以这里不必为它加一个 prop。」 */
function levelId(index: number): string {
    return `school-skill-lv-${index}`;
}

/* ---------- 点刻度直接设档（2026-11-03 用户要求） ----------
 * 七行都是「二十级一档」，而填数要先把光标点进格子、全选、敲数字、再确认——
 * 只想把某一项从 0 拉到 120 时，点第六格是一步。
 *
 * 交互本身（哪一格、预览、键盘不该进）全在 `SkillTicks` 里：它抛出的是**等级**，
 * 这里只负责写回草稿。原先这段判断（`hoverTick` / `prefilled` / `tickStyle`）
 * 长在本文件，本质是「刻度怎么显示」，跟着刻度走才对——卡上没有这份逻辑，
 * 却要共用同一套视觉，写在两处迟早对不上。 */

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

function optionsFor(row: SkillRowData): { value: string; label: string }[] {
    const base = (props.group ?? kindOf(row)) === 'story' ? storyOptions.value : lifeOptions.value;
    const current = row.name;
    return current && !base.some((option) => option.value === current)
        ? [{ value: current, label: `${current}（不在表里）` }, ...base]
        : base;
}
</script>

<template>
    <div class="skill-editor">
        <!-- ---------- 门派技能：七行纸带，能填的只有等级 ----------
             名字与上限都是门派带进来的（`game/data/schools.json`），所以这一页**没有
             「加一项」、也没有删行**：那七项不是自选题，是游戏按门派给的。
             没有门派就没有这七项——那时也不该显示一张空表，而是一句话说清缺什么。 -->
        <template v-if="props.fixedNames">
            <p v-if="!rows.length" class="skill-empty">
                {{ props.school ? `${props.school} 没有查到门派技能` : '先选择门派' }}
            </p>
            <template v-else>
                <div class="group-head skill-head">
                    <span class="section-mark"></span>门派技能
                    <span class="group-sum num">已满 {{ maxedCount }}/{{ rows.length }}</span>
                </div>
                <div class="paper-rows skill-rows">
                    <!-- 一行是 `SkillRow`（与卡上同一个组件）：`editable` 把等级换成
                         输入格、刻度换成可点的。名字由门派带入，不在这里增删。
                         `input-id` 给名字的 `<label for>` 用——行里现在有九个刻度按钮，
                         整行包 `<label>` 会让焦点落到第一个按钮上，而不是等级格。 -->
                    <SkillRow
                        v-for="(row, index) in rows"
                        :key="row.name"
                        class="school-erow"
                        :row="row"
                        editable
                        :cap="capOf(row)"
                        :input-id="levelId(index)"
                        @update:level="row.level = $event"
                    />
                </div>
                <p class="hint skill-hint">
                    名字由门派带入；点刻度直接设档，换门派会按名字保留已填的等级
                </p>
            </template>
        </template>

        <!-- ---------- 辅助技能：自由列表（名字从名录里选，可增删） ---------- -->
        <template v-else>
            <div
                v-for="row in visible"
                :key="rows.indexOf(row)"
                class="erow"
                :class="{ off: row.off }"
            >
                <!-- 辅助技能的名字是一份查表来的名录（`game/data/skills.json`），
                     所以同样是**选**而不是写：见脚本里 `optionsFor` 上面那段。 -->
                <SelectField
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
                    class="lv-field num-slot"
                    @update:model-value="row.level = $event"
                />
                <!-- 自由列表（辅助）上限留空 = 不知道。存 0 会把「不知道」变成
                     「不可能是满级」，所以这里写回的是 `undefined`（见 `SkillRow.cap`）。 -->
                <NumberField
                    :model-value="row.cap ?? 0"
                    zero-as-empty
                    label="上限"
                    placeholder="上限"
                    class="cap-field num-slot"
                    @update:model-value="row.cap = $event || undefined"
                />
                <CostSwitch
                    v-if="props.kind === 'assist'"
                    :model-value="row.off === true"
                    off-label="已学"
                    on-label="未学"
                    @update:model-value="row.off = $event || undefined"
                />
                <PressButton icon="trash" label="删掉这一项" @click="removeRow(row)" />
            </div>

            <div class="skill-foot">
                <PressButton
                    icon="add"
                    text="加一项"
                    :label="
                        props.group
                            ? `加一项${props.group === 'story' ? '剧情' : '生活'}技能`
                            : '加一项技能'
                    "
                    @click="addRow"
                />
                <span class="hint">没选技能名的行，保存时会被丢掉</span>
            </div>
        </template>
    </div>
</template>

<style scoped>
/* ======================================================================
 * 辅助技能那一页（自由列表）
 * ==================================================================== */
/* 与修炼那一列同宽：两个页签的行如果宽度不同，来回切换时整列会左右跳。
 * 固定宽而不是 flex: 1——撑满会把等级推进行尾，中间空一片。
 *
 * 选择器带上 `.erow`（而不是只写 `.name-select`）：`SelectField` 的根自己带着
 * `flex: 1`，两条规则特异性相同时谁生效取决于样式注入顺序——不押这个。 */
.erow .name-select {
    flex: none;
    width: 200px;
}
.lv-field {
    width: 66px;
}
.cap-field {
    width: 66px;
}
/* 未学那一行整行降一档：与卡内那张表同一个说法（`.school-row.off`），
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

/* ======================================================================
 * 门派技能那一页（七行纸带，只有等级能填）
 * ==================================================================== */
/* 组头与卡上同一句：`section-mark` + 标题 + 右端小计（样式在 `base.css` 的
 * `.group-head`）。这一页只在它下面多留 8px：弹窗里的组头接的是一整叠纸带，
 * 不像卡上那样紧贴着页签条。 */
.skill-head {
    --gh-mb: 8px;
}

/* 没有门派时那一句。与卡上的 `.empty-note` 同一个读法：一条纸带都没有时，
 * 空着会读成「没画完」，一句话才说得清缺的是门派。 */
.skill-empty {
    margin: 0;
    padding: 22px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
}
/* 行与行之间 8px：**与卡上同一个数**（2026-11-03 同步）。上一版是 6，理由是「这里每行
 * 还多一条外框内边距」——但两页的行已经不靠外框对位，缝就该是同一个值。 */
.skill-rows {
    display: grid;
    row-gap: 8px;
}
/* 说明与最后一条纸带之间让出 12px：纸带自己带 2px 的底影，再紧贴一行小字，
 * 读作「这张表还没结束」。 */
.skill-hint {
    margin: 12px 0 0;
}
.skill-rows .paper-row + .paper-row {
    margin-top: 0;
}
/* 三列 flex：印 / 名称 + 刻度 / 等级——**与卡上同一个结构、同一套尺寸**
 * （2026-11-03 用户：「同步一下师门技能编辑页的技能列表样式和角色卡片保持一致」）。
 *
 * 那一行的解剖（三列、内边距、印与数字格的尺寸）在 `SkillRow.vue`，与卡共用一份。
 * 这里只剩**这一页的行高**：卡上那七行是容器均分出来的（1.0 档 55、1.1 档 54），
 * 弹窗得自己钉住。 */
.school-erow {
    /* 55 与卡上的行高同一个数。
     *
     * `height` 而不是 `min-height`：印的 `--tile-h: calc(100% - …)` 要求行高**确定**，
     * 不定的高度会让百分比解析成 `auto`，印直接缩成内容大小。名字有 `nowrap` + 省略号，
     * 不会换行，所以也不存在「内容比 55 高」的情况。
     *
     * **不乘 `--fs-scale`**：跟着字号放大到 60.5 会让七行多出 44px——1.1 档实测溢出 6px，
     * 编辑区多出一条滚动条。字印与数字格自己乘档位，行高只认「卡上那个数」。 */
    height: 55px;
}
/* ---------- 等级格 / 上限格（辅助那一行） ----------
 *
 * 材质来自 `base.css` 的 `.num-slot`（45% 槽色、两道棱、悬停 68%、聚焦实槽），
 * 也就是卡上那枚只读的 `NumTag` 与属性页那排数字格用的同一份。三处各写一遍时，
 * 这处用 `background-color` 长写、属性页用 `background` 简写，前者把 `.field` 的
 * 顶壁渐变留了下来——同一个数在卡上与弹窗里深浅不同，就是从这儿开始的。
 *
 * 师门那一行的等级格不归这里：它在 `SkillRow` 里（56 × 30、居中），尺寸与卡上
 * 那枚数值签同源。这两条只给辅助行——66 宽、26 高（`.field` 给的）、右对齐。 */
.lv-field,
.cap-field {
    padding: 0 6px;
    text-align: right;
}
/* 满级与 0 级的着色（印、数、名字）也在 `SkillRow` 里：三个状态由那个组件自己判，
 * 父级只传 `editable`——父级的类名一改（`.school-erow` / `.school-row`）不该让
 * 子组件的状态静默失效。 */
</style>
