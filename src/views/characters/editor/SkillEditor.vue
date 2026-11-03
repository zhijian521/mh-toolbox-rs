<script setup lang="ts">
import { computed, ref } from 'vue';
import CostSwitch from '../../../components/CostSwitch.vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import PressTile from '../../../components/PressTile.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import SelectField from '../../../components/SelectField.vue';
import {
    isMaxed,
    skillTicks,
    tickLevel,
    type AssistKind,
    type AssistSkill,
    type SkillRow,
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

/* 师门那一页要读的第二个数：七项里练成几项。 */
const maxedCount = computed(() => rows.value.filter(isMaxed).length);

/* 上限只有一个来源：行上存着就用行上的（老数据可能是别的值），否则读表级常量。
 * 写成函数而不是在模板里 `row.cap ?? schoolSkillCap()` 两遍——两处各写一次，
 * 将来「上限从哪来」一改，就会只剩一半跟着改。 */
function capOf(row: SkillRow): number {
    return row.cap ?? schoolSkillCap();
}

/* ---------- 点刻度直接设档（2026-11-03 用户要求） ----------
 * 七行都是「二十级一档」，而填数要先把光标点进格子、全选、敲数字、再确认——
 * 只想把某一项从 0 拉到 120 时，点第六格是一步。
 *
 * 点第 N 格 = 前 N 格全满（`tickLevel` 与 `skillTicks` 共用同一个格数，不会错位）。
 * 只有鼠标能点：`tabindex="-1"`、`aria-hidden`，键盘走旁边那个等级格——
 * 七行 × 九格 = 六十三个 Tab 停靠点会把这张表变成一个走不出去的地方。
 *
 * 指针停在刻度上时**整条先演示一遍点下去的样子**（前 N 格亮、其余空）：
 * 一格只有七像素高，没有这层预览，那一下点的是第几档全靠猜。 */
const hoverTick = ref<{ name: string; index: number } | null>(null);

function setLevel(row: SkillRow, index: number) {
    row.level = tickLevel(index, capOf(row));
}

function prefilled(row: SkillRow, index: number): boolean {
    const hover = hoverTick.value;
    return hover?.name === row.name && index <= hover.index;
}

function tickStyle(row: SkillRow, index: number, fill: number) {
    /* 正在预览这一行时按「点下去的结果」重画：前 N 格满、后面全空——
     * 已经填到六格的行，指着第四格也要能看出「点了会降到 80」。 */
    const hovering = hoverTick.value?.name === row.name;
    const value = hovering ? (prefilled(row, index) ? 100 : 0) : fill;
    return { '--fill': `${value}%` };
}

/* 字印：技能名首字（与卡上同一枚）。见 `CharacterCard.vue` 的 `sealOf`——
 * 两处都得有，但不合到一个模块里：一处是「卡片怎么画」，一处是「编辑器怎么画」，
 * 谁先变都不该把另一处拖着改。 */
function sealOf(name: string): string {
    return [...name][0] ?? '';
}

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
        <!-- ---------- 门派技能：七行纸带，能填的只有等级 ----------
             名字与上限都是门派带进来的（`game/data/schools.json`），所以这一页**没有
             「加一项」、也没有删行**：那七项不是自选题，是游戏按门派给的。
             没有门派就没有这七项——那时也不该显示一张空表，而是一句话说清缺什么。 -->
        <template v-if="props.fixedNames">
            <p v-if="!rows.length" class="skill-empty">
                {{ props.school ? `${props.school} 没有查到门派技能` : '先选择门派' }}
            </p>
            <template v-else>
                <div class="skill-head">
                    <span class="section-mark"></span>门派技能
                    <span class="skill-sum num">已满 {{ maxedCount }}/{{ rows.length }}</span>
                </div>
                <div class="paper-rows skill-rows">
                    <!-- 整行是 `<label>`：点名字也能落进等级格，比只点那一小格宽得多
                         （与属性页那几行同一个做法）。 -->
                    <label
                        v-for="row in rows"
                        :key="row.name"
                        class="paper-row school-erow"
                        :class="{ full: isMaxed(row), idle: row.level === 0 }"
                    >
                        <PressTile
                            class="seal"
                            still
                            :tone="isMaxed(row) ? 'seal' : 'paper'"
                            aria-hidden="true"
                        >
                            <span class="seal-text">{{ sealOf(row.name) }}</span>
                        </PressTile>
                        <!-- 名称与刻度包成一层（`.school-main`），与卡上同一个结构：
                             三列各按中线对齐，中间那列自己两行。 -->
                        <span class="school-main">
                            <span class="name-text">{{ row.name }}</span>
                            <!-- 刻度与卡上是同一套算法（`character.ts` 的 `skillTicks`）：
                                 填完一个数，这里立刻是回卡上会看到的那几格。
                                 每格都能点，点第 N 格就是这一档（见脚本里 `setLevel`）。 -->
                            <span class="ticks" aria-hidden="true" @pointerleave="hoverTick = null">
                                <button
                                    v-for="(fill, index) in skillTicks(row.level, capOf(row))"
                                    :key="index"
                                    type="button"
                                    class="tick"
                                    tabindex="-1"
                                    :class="{ preview: prefilled(row, index) }"
                                    :style="tickStyle(row, index, fill)"
                                    :title="`${tickLevel(index, capOf(row))} 级`"
                                    @click.stop.prevent="setLevel(row, index)"
                                    @pointerenter="hoverTick = { name: row.name, index }"
                                ></button>
                            </span>
                        </span>
                        <!-- 上限不写出来（2026-11-03 用户：「180 大家默认都知道」）。
                             `cap` 仍在数据里：刻度按它分格、点刻度按它算档位，
                             只是不再占一列。 -->
                        <NumberField
                            :model-value="row.level"
                            label="等级"
                            class="lv-field"
                            @update:model-value="row.level = $event"
                        />
                    </label>
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
                    class="lv-field"
                    @update:model-value="row.level = $event"
                />
                <!-- 自由列表（辅助）上限留空 = 不知道。存 0 会把「不知道」变成
                     「不可能是满级」，所以这里写回的是 `undefined`（见 `SkillRow.cap`）。 -->
                <NumberField
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
/* 组头与卡上同一句：`section-mark` + 标题 + 右端小计。弹窗里也要有一处说明
 * 「这七项是谁给的」，否则一列只有名字、数字、刻度，看着像一张无主的表。 */
.skill-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.14em;
}
.skill-head .section-mark {
    --mark-w: 4px;
    --mark-h: 13px;
}
.skill-sum {
    margin-left: auto;
    color: var(--num);
    letter-spacing: 0;
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
 * 上一版是两行 grid（26 的输入格 + 6 的缝 + 7 的刻度），行高 51、字印 28、数字格 26：
 * 单看没问题，但把卡和弹窗并排，同一项技能在两处的行高、印的大小、数字格的厚薄
 * 全不一样，填完回卡上核对时眼睛要重新找位置。现在两边都走「印 39 / 名称 + 刻度 /
 * 数字格 34」，行高 55（`min-height`，内容撑不到时按卡上的高度铺）。
 *
 * 为什么还是 flex 不是 grid：卡上那枚字印要按行内容高居中撑着，grid 两行轨道的总高
 * 只有 32（名称 16 + 缝 9 + 刻度 7），39 的块会顶破轨道。flex 的行高由容器给，
 * `align-items: center` 让三列落在同一条中线上——与卡上逐条对应。 */
.school-erow {
    display: flex;
    align-items: center;
    gap: 10px;
    /* 55 与卡上的行高同一个数；`min-height` 而不是 `height`：字号档更大或内容更高时
     * 允许长高，不把内容挤扁。
     *
     * **不乘 `--fs-scale`**：卡上那七行是容器均分出来的（1.0 档 55、1.1 档 54，字放大
     * 反而更矮），跟着字号一起放大到 60.5 会让七行多出 44px——1.1 档实测溢出 6px，
     * 编辑区多出一条滚动条。字印与数字格自己乘档位，行高只认「卡上那个数」。 */
    min-height: 55px;
    padding: 4px 10px;
}
/* 名称 + 刻度：同一列的两行，整块在行内居中。与卡上 `.school-main` 逐条同值
 * （列内间距 9、`min-width: 0` 给省略号留位置）。 */
.school-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 9px;
    min-width: 0;
}
/* 字印：与卡上同一枚、同一尺寸（39 × 字号档，卡上是「行内容高 − 8」算出来的同一个数）。
 * 落地影也回到 0.85——上一版 28 的块用 0.7，放大到 39 之后按比例仍是这一档
 * （牌记 34 同用 0.85）。 */
.seal {
    flex: none;
    --tile-w: calc(39px * var(--fs-scale));
    --tile-h: calc(39px * var(--fs-scale));
    --tile-r: var(--r-2);
    --tile-drop: 0.85;
    /* 块面给不透明的纸：与卡上同一条理由（纸带底是 `--paper-2`，92% 半透明叠上去
     * 亮色下几乎与带子同色）。暗色再提一档——`--paper` 在那里比纸带还暗，直接用会读成凹。
     * 满级时被 `PressTile` 的 `.tone-seal` 盖掉。 */
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper) 84%, var(--ink)));
}
/* 字色在内层：块的 `color` 由 `PressTile` 统一给（纸面 `--ink-2` / 朱面 `--on-seal`），
 * 这一枚要的是朱字，满级时再翻纸白。字号与卡上同一个算式（`--fs-md + 2`）：
 * 印从 28 长到 39，字还停在 14 就变成「一个大框里一个小字」。 */
.seal-text {
    color: var(--cinnabar);
    font-size: calc(var(--fs-md) + 2px);
    line-height: 1;
}
.name-text {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 等级格：与卡上那枚数值签同尺寸（56 × 34 × 字号档），字号也同一个算式。
 *
 * 上一版是「跨两行、26 高」——为了在 grid 里居中，还得给 row 1 钉一条 `minmax`。
 * 改成 flex 之后三列都按中线对齐，不需要任何居中补丁：`align-items: center` 直接对齐。
 *
 * 字号取 `--fs-md + 3`、颜色取 `--num`：与卡上一致——同一个数在两处不该一个大一个小、
 * 一个赭一个墨。满级转朱，与卡上同一条。 */
.school-erow .lv-field {
    flex: none;
    width: calc(56px * var(--fs-scale));
    /* 30 与卡上那枚数值签同高（2026-11-03 用户两次说「再小一点」）：39 → 34 → 30。
     * 34 时仍厚；30 才读作「一条读数被框住」（字 18.5，上下各 5.75）。
     * 行高由 `.school-erow` 的 `min-height: 55px` 定，格子不撑行；再收就得先收字号。 */
    height: calc(30px * var(--fs-scale));
    padding: 0 4px;
    color: var(--num);
    font-size: calc(var(--fs-md) + 3px);
    line-height: 1;
    /* 数字居中，与卡上那枚数值签同一条（2026-11-03 用户：「数字居中展示」）。
     * 宽度也从 66 收到 56——这一列只有三位数，右边空一截看着像没填完。 */
    text-align: center;
}
/* ---------- 等级格：纸带上挖出的一小格 ----------
 *
 * 与属性页那排数字格同一副材质（`AttrEditor` 的 `.value-field`），也就是卡上那枚
 * 只读的 `NumTag`：淡槽底、无边框、数右对齐（2026-11-03 用户：「技能等级数字用个
 * 类似修改属性数字里的样式包裹一下」）。
 *
 * 为什么要盖掉 `.field` 那套：`.field` 是**表单里的标准格**——1px 边、整道 `.well` 底、
 * 26px 高。摆在纸带行里，它与左边凸起的字印不是一套语言（一个是被挖开的输入框，
 * 一个是压在纸上的印）。这一格要读作「纸带上挖出来的小格子」，所以只借 `.well` 的
 * 45% 槽色，不借它的边与顶壁渐变。
 *
 * 高度不写在通用那条里：等级格由 `.school-erow .lv-field` 定到 34（与卡上的数值签同高），
 * 上限格仍在辅助行里、保持 `.field` 的 26——那一行没有纸带，也不需要与字印对齐。
 *
 * 上限格（`.cap-field`）一起进来：辅助那一行里两个数字格并排，只改一个会在同一行里
 * 出现两种材质（一个淡格、一个实槽）。 */
.lv-field,
.cap-field {
    border-width: 0;
    padding: 0 6px;
    background-color: color-mix(in srgb, var(--well) 45%, transparent);
    text-align: right;
    transition: background-color var(--t-quick) var(--ease-soft);
}
/* 悬停只加深底色：这一页的格子都可以填，加深是「这里能写」的提示。
 * 不改边框——边框已经归零，改的是被盖掉的那条 `--lip-shade`，看不见。 */
.lv-field:hover:not(:disabled),
.cap-field:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--well) 68%, transparent);
}
/* 聚焦：实槽 + 一道加厚的顶壁影，**不描朱边**（与 `.field` 的焦点同一套读数：
 * 焦点是「这一格被按住了」，不是「这一格被涂红」）。特异性 0,4,0，
 * 压得过 `.field:focus:not(:disabled)` 的 0,3,0，否则焦点时底色停在 45%。 */
.lv-field:focus:not(:disabled),
.cap-field:focus:not(:disabled) {
    background-color: var(--well);
    box-shadow:
        inset 0 1px 3px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    caret-color: var(--cinnabar);
}
/* 刻度：与卡上同一个算法（`skillTicks`），也是同一副材质：**凹槽里嵌一截红条**。
 *
 * 一格刻度同时是一个按钮：外观仍是那根 7px 的条，热区靠 `::after` 上下各撑 5px
 * ——条本身只有七像素高，直接点它容易落空；撑出去的部分仍在纸带的上内边距里，
 * 不会盖到上一行 / 下一行的刻度上。
 *
 * 填充走 `::before` 而不是一条横向渐变：横向渐变只答得出「填了多少」，
 * 答不出「嵌进去的那一截有厚度」。槽影、红条的纵向渐变与内棱见 `character-card.css`
 * 同名那段（两处必须同源，卡上填完、弹窗里看到的要是同一条）。 */
.ticks {
    display: flex;
    gap: 3px;
}
.tick {
    position: relative;
    flex: 1;
    height: 7px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background-color: var(--well);
    /* 与卡上同一道槽：借全局 `.well` 的上暗下亮渐变，不加它的 1px 边框。 */
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 72%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--rule-2) 48%, transparent);
    appearance: none;
    cursor: pointer;
}
/* 填充条：宽度 = 这一格的 `--fill`；右端同样 2px 圆角（半格读作「一截短红条」）。 */
.tick::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--fill, 0%);
    border-radius: 2px;
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--seal) 74%, var(--paper-base)) 0%,
        var(--seal) 42%,
        color-mix(in srgb, var(--seal) 82%, var(--ink-base)) 100%
    );
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal) 42%, var(--paper-base)),
        inset 0 -1px 0 color-mix(in srgb, var(--seal) 72%, var(--ink-base));
}
/* 热区：条只有 7px 高，上下各撑 5px 才点得准。 */
.tick::after {
    content: '';
    position: absolute;
    inset: -5px -1px;
}
/* 指针停在这一档：槽的描边转朱，说明「这一格可以按」。不放在 `:hover` 之外——
 * 触屏上那一下就走了，用不到悬停态。 */
.tick:hover {
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--cinnabar) 55%, transparent);
}
/* 满级：印翻朱面、字转纸白——与卡上同一套。 */
.school-erow.full .seal-text {
    color: var(--on-seal);
}
/* 满级那一行的数字也转朱（2026-11-03 与卡同步）：这一行里字印、九格、槽描边全是朱，
 * 只有数值还是赭的，读起来像「这一行练满了，但这一项还没」。
 *
 * 与卡上唯一的差别是没有「满」字：卡上是读数，用「满」把状态写出来；这里数字还在
 * 输入格里，朱色只表示「到头了」，不表示「不能改」——格子照旧能填。 */
.school-erow.full .lv-field {
    color: var(--cinnabar);
}
/* 满级：填充本来就是朱，靠**槽的描边转朱**收尾（另有数转朱、字印翻朱面）。 */
.school-erow.full .tick {
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--seal-edge) 55%, transparent);
}
/* 预览：点下去会填到这里。用**淡朱**而不是正朱——正朱是「已经填了」，预览还没落账。
 * 指针停住时整条已经按结果重画（哪几格亮才是信息），淡一档不影响读。 */
.school-erow .tick.preview::before {
    background-image: none;
    background-color: color-mix(in srgb, var(--seal) 42%, transparent);
    box-shadow: none;
}
/* 0 级：字与名字一起退灰，挡住「练了一半」与「还没开始」的区别。
 * 块面不跟着退——凸起是「这一项存在」，与练到几级无关。 */
.school-erow.idle .seal-text {
    color: var(--muted);
}
.school-erow.idle .name-text {
    color: var(--muted);
}
</style>
