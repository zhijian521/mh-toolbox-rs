<script setup lang="ts">
import { computed } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import SelectField from '../../../components/SelectField.vue';
import AssistIcon from '../AssistIcon.vue';
import SkillRow from '../SkillRow.vue';
import { type AssistKind, type AssistSkill, type SkillRow as SkillRowData } from '../character';
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
 * 辅助不预设上限：名录（`game/data/skills.json`）里只有名字，两类尺子又不同
 * （生活按等级段、剧情 5 级），编不出来。**新增的辅助行因此没有 `cap`**，
 * 卡上那格也就不会判满级（`isMaxed` 缺分母时不猜），旧数据里已有的 `cap` 照旧生效。
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
 * 「强身术 100」与「调息 5」是同一把尺子还是两把。
 *
 * 2026-11-03 之后这一页没有「类别」这个控件了（用户：「去掉上限和已学未学」那一批
 * 顺手收的）：两个 `SkillEditor` 各自绑一类（`group`），类别由**在哪一块**决定，
 * 不再由行上的开关决定。`kind` 字段仍是数据的一部分，`addRow` 照旧写它。 */
const kindOf = (row: SkillRowData): AssistKind => (row as AssistSkill).kind ?? 'life';

/* 分组模式只看本类；不分组时就是整个数组（师门技能那条路一点没变）。 */
const visible = computed(() =>
    props.group ? rows.value.filter((row) => kindOf(row) === props.group) : rows.value,
);

/* 上限只有一个来源：行上存着就用行上的（老数据可能是别的值），否则读表级常量。
 * 写成函数而不是在模板里 `row.cap ?? schoolSkillCap()` 两遍——两处各写一次，
 * 将来「上限从哪来」一改，就会只剩一半跟着改。 */
function capOf(row: SkillRowData): number {
    return row.cap ?? schoolSkillCap();
}

/* 名字与等级格的关联：`<label for>` + 输入格的 `id`。
 *
 * 为什么不给整行包 `<label>`：一行里除了输入格还有框选区域，而 label 只认第一个
 * 可标记元素；直接挂 `for` 就不必依赖「谁是第一个」这个前提。
 * 按**行下标**编号而不是按名字：名字理论上唯一，但用下标就不必依赖这个前提
 * （同一门派重复一项时也不会撞 id）。
 *
 * `id` 能落到 `<input>` 上靠的是 `NumberField` 的属性透传——它单根、没关 inheritAttrs，
 * 所以这里不必为它加一个 prop。」 */
function levelId(index: number): string {
    return `school-skill-lv-${index}`;
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
                <div class="group-head skill-head"><span class="section-mark"></span>门派技能</div>
                <div class="slip-rows slip-cols">
                    <!-- 一行是 `SkillRow`（与卡上同一个组件）：`editable` 把等级换成
                         输入格、名字变成 `<label>`。名字由门派带入，不在这里增删。
                         `input-id` 给名字的 `<label for>` 用。 -->
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
            </template>
        </template>

        <!-- ---------- 辅助技能：自由列表（名字从名录里选，可增删） ----------
             一格四样：**图标 / 名字 / 等级 / 删**（2026-11-03 从「纸带 / 目录表 /
             网格横排 / 小票卡」四个方案里选了小票卡，于是这一页也跟着变成了票）。
             砍掉的两样不是「不好用」，是这一页根本不需要：
               - **上限**：卡上早就不写 `/180` 了（§37），辅助技能的上限本来就随技能表来，
                 让人手填一个只有刻度用得上的数，等于让他抄一遍表；
               - **已学 / 未学**：那一枚是给「这个号没学这一项」用的，可编辑页是**逐个录**
                 已学的技能——录进来的就是学了，没学的行直接删掉更干脆。
             两样都从数据里留着（老存档里可能有），只是这一版不再给入口，见 `SkillRow.cap`
             与 `.slip-row.off`：卡上遇到旧数据仍然按原样退灰。 -->
        <template v-else>
            <div class="slip-rows slip-cols">
                <!-- 一项一张票：图标 ｜ 名字 ｜ 等级 ｜ 删。票面与卡上是同一份
                     （`base.css` 的 `.slip-row`），行高也一样 42——26 高的下拉与数字格
                     在里面上下各留 8。 -->
                <div
                    v-for="row in visible"
                    :key="rows.indexOf(row)"
                    class="slip-row"
                    :class="{ off: row.off }"
                >
                    <!-- 图标跟着名字走：名字还没选时是一块空块，不留破图。
                         与卡上同一个组件（`AssistIcon`），换名字时它自己重查。 -->
                    <AssistIcon :name="row.name" :kind="kindOf(row)" />
                    <!-- 辅助技能的名字是一份查表来的名录（`game/data/skills.json`），
                         所以同样是**选**而不是写：见脚本里 `optionsFor` 上面那段。 -->
                    <SelectField
                        v-model="row.name"
                        class="name-select"
                        label="技能名"
                        placeholder="选择技能"
                        :options="optionsFor(row)"
                    />
                    <NumberField
                        :model-value="row.level"
                        label="等级"
                        class="lv-field num-slot"
                        @update:model-value="row.level = $event"
                    />
                    <PressButton icon="trash" label="删掉这一项" @click="removeRow(row)" />
                </div>
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
/* 一行两格（2026-11-03 用户：「一行现在只展示一个辅助技能，调整为一行两个」，
 * 之后又说「中间多加点边距」，最后从四个方案里选了「票面两列」）。
 *
 * 编辑区 622 宽：两列各 299（gap 12）。生活 11 项从 11 行落到 6 行，剧情的 6 项 3 行——
 * 这一页原本是弹窗里最长的一页，改成两列之后不用滚到底才看到「加一项」。
 *
 * 2026-11-04 四页统一之后，两列与列距、票面与行高 42 全由 `.slip-rows.slip-cols` /
 * `.slip-row` 给（卡上是同一套），这一页只剩「四样怎么摆」。原先这里写死的
 * `.assist-slips`（两列 + 8/12）与 `height: 38px` 随统一删掉——那个 38 是「要塞 26 的
 * 控件」，而 42 同样塞得下，还换来与卡上同一个行高。
 *
 * 每一格塞四样（图标 / 名字 / 等级 / 删）：名字必须**吃满剩下的宽度**，
 * `min-width: 0` 是让它能被压缩——flex 项的默认 `min-width: auto` 之下，
 * 长名字会把等级格挤出格子。
 */
/* 选择器带上 `.slip-row`（而不是只写 `.name-select`）：`SelectField` 的根自己带着
 * `flex: 1`，两条规则特异性相同时谁生效取决于样式注入顺序——不押这个。 */
.slip-row .name-select {
    flex: 1;
    min-width: 0;
}
.lv-field {
    flex: none;
    /* 52 与另三页的签同值：辅助这一格原先 44，是「两列 299 里只剩这么宽」的结果；
     * 四页统一之后同宽才对得上——同一个「等级」在四页不该两种宽度。 */
    width: calc(52px * var(--fs-scale));
    /* 高度原先由 `.field` 给 26，这里必须显式覆写：卡上那枚签已收到 24（2026-11-04），
     * 而 `.field` 的 26 是「表单里与 md 按钮并排」的标准，不该为一个格子改小。
     * 于是由这一格自己声明——同一条算式，两处来源不同。 */
    height: calc(24px * var(--fs-scale));
    /* 字号跟卡上那枚签走。**尺寸对了字号不对，等于没对齐**：填完抬眼核对时，
     * 卡上 15.5、这里 12，同一行数看起来像两份记录。师门那一格在 `SkillRow` 里
     * 已经是 15.5，这一条补的是辅助——它也走 `.slip-row`，本来就该同值。 */
    font-size: calc(var(--fs-md) + 1px);
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
/* 三列 flex：图标 / 名称 / 等级格——**与卡上同一个结构、同一套尺寸**
 * （2026-11-03 用户：「同步一下师门技能编辑页的技能列表样式和角色卡片保持一致」）。
 *
 * 那一行的解剖在 `SkillRow.vue`，与卡共用一份。这里只剩**这一页的行高**：
 * 两页都是 40（2026-11-04 起），弹窗要自己能确定，所以写死。 */
/* 行高也不在这一页：`.slip-row` 的 42 与卡上同一个数（卡上不再由
 * `grid-auto-rows` 单独给，四页都用同一个默认档）。
 *
 * 这里**不能再写 height**：写了就是「同一个数有两个源」，而 `.slip-row` 的 42 还带着
 * 「块 28 + 上下各 7」那道算式，改一处忘一处会出现半截白边。 */
.school-erow {
    min-width: 0;
}
/* ---------- 等级格 / 上限格（辅助那一行） ----------
 *
 * 材质来自 `base.css` 的 `.num-slot`（45% 槽色、两道棱、悬停 68%、聚焦实槽），
 * 也就是卡上那枚只读的 `NumTag` 与属性页那排数字格用的同一份。三处各写一遍时，
 * 这处用 `background-color` 长写、属性页用 `background` 简写，前者把 `.field` 的
 * 顶壁渐变留了下来——同一个数在卡上与弹窗里深浅不同，就是从这儿开始的。
 *
 * 师门那一行的等级格不归这里：它在 `SkillRow` 里（56 × 24、居中），尺寸与卡上
 * 那枚数值签同源。这一条只给辅助行——52 宽 24 高（高度自己声明，`.field` 会给 26）、
 * 右对齐。 */
.lv-field {
    padding: 0 6px;
    text-align: right;
}
/* 满级与 0 级的着色（印、数、名字）也在 `SkillRow` 里：三个状态由那个组件自己判，
 * 父级只传 `editable`——父级的类名一改（`.school-erow` / `.school-row`）不该让
 * 子组件的状态静默失效。 */
</style>
