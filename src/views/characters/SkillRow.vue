<script setup lang="ts">
/**
 * 师门技能的一行：图标印 ｜ 名称 ｜ 等级。
 *
 * 卡上只读、弹窗里可编辑，但**行是同一件东西**——同一项技能在两处的行高、印的大小、
 * 数字格的厚薄必须一样，否则「填完回卡上核对」时眼睛要重新找位置。所以这一行只写
 * 「师门特有」的两件事（图标查哪张图、可编辑时那一格怎么摆），材质与尺寸全在
 * `base.css` 的 `.slip-row` 一族里——2026-11-04 起属性、师门、辅助、修炼四页同一张票。
 *
 * ## 2026-11-04：换成真图标，去掉九格刻度
 *
 * 之前行首是一枚**首字印**（技能名的第一个字，朱色），那是图标没到位时的替身：
 * 七个字（官 / 双 / 神 / 疾 / 十 / 紫 / 文）摆在一起，谁也认不出对应哪一项。图标
 * 2026-11-04 入库（147 枚，`game/data/school-icons.json`），这一格于是换成真图，
 * 纸化处理与辅助技能同一份（`IconTile`）。
 *
 * 同一天把**九格刻度也撤了**，判据与修炼那条进度条一样：`180` 与 `120` 的差别数字
 * 已经说了，九格只是把「180 ÷ 20 = 9」这道除法画了一遍。撤掉之后是同一个读法：
 * **图标 ｜ 名称 ｜ 数**。行高 42 由 `.slip-row` 给（装得下 28 的块、上下各留 7）。
 *
 * ## 三种状态各管一件事
 *
 *   - `full`：数转朱、「满」转朱；**印不换面**——深底金纹压在朱面上会变成一块脏斑
 *     （样张对照过），图没法跟着字一起变色。朱在这一页少了一处，「满了没有」仍由数字说清。
 *   - `idle`（0 级）：印与字一起退后（图降到 72% 不透明度）。
 *   - `off`（未学，只有辅助技能的老数据会有）：名字退灰。
 *
 * `idle` 与 `off` 是两件事——「学了但一级没练」与「这个号没学这一项」——但都要退后，
 * 退的程度也一样：不能让「练了一半」跟它们混在一起。
 *
 * ## 图查不到时退回首字印
 *
 * 老存档里手敲的名字、游戏新加还没切图的技能，`schoolSkillIcon()` 返回 `undefined`。
 * 那时画一块纸白的方块 + 首字（就是改版前那一枚）——**不留破图，也不留空格**：
 * 空格会被读成「这一行坏了」，而首字至少还是个落点。
 */
import { computed } from 'vue';
import NumberField from '../../components/NumberField.vue';
import NumTag from '../../components/NumTag.vue';
import PressTile from '../../components/PressTile.vue';
import { schoolSkillIcon } from '../../services/game-icons';
import IconTile from './IconTile.vue';
import { isMaxed, type SkillRow as SkillRowData } from './character';
import { quickRowBinds, useQuickable } from './quick-row';

const props = withDefaults(
    defineProps<{
        row: SkillRowData;
        /** 可填。卡上不给，弹窗里给。 */
        editable?: boolean;
        /** 等级格的 `id`，名字的 `for` 指向它。只在可编辑时有用。 */
        inputId?: string;
        /**
         * 点一行开「快速修改」。
         *
         * 与 `editable` 互斥（那一态里等级已经是输入格）；`quickable` 一处判断，
         * 免得两个条件在模板里各写一遍。
         */
        quick?: boolean;
    }>(),
    { editable: false, inputId: undefined, quick: false },
);

const emit = defineEmits<{ 'update:level': [level: number]; quick: [] }>();

const quickable = useQuickable(props);

function open() {
    if (!quickable.value) return;
    emit('quick');
}

/* 上限读行上存着的；没存（老数据）时判不出满级。数据层的 `schoolSkills` /
 * `skill-panel` 都会补上 `schoolSkillCap()`，所以这里不再接兜底 prop。 */
const full = computed(() => isMaxed({ level: props.row.level, cap: props.row.cap }));
const idle = computed(() => props.row.level === 0);

/** 图标地址。查不到就退回首字印，见文件头最后一段。 */
const icon = computed(() => schoolSkillIcon(props.row.name));

/* 首字印的替身字。用 `[...name][0]` 而不是 `name[0]`：遇上表情符号或生僻字
 * （代理对）时，后者会切出半个字符。 */
const seal = computed(() => [...props.row.name][0] ?? '');
</script>

<template>
    <div
        class="slip-row school-row"
        :class="{ full, idle, off: props.row.off, quickable }"
        v-bind="quickRowBinds(quickable, open, `快速修改 ${row.name}`)"
    >
        <!-- 有图走 `IconTile`（与辅助同一枚块）；没图退回压印块 + 首字。 -->
        <IconTile v-if="icon" :src="icon" />
        <PressTile v-else class="seal-tile" still aria-hidden="true">
            <span class="seal-text">{{ seal }}</span>
        </PressTile>

        <label v-if="editable" class="slip-name" :for="inputId">{{ row.name }}</label>
        <span v-else class="slip-name">{{ row.name }}</span>

        <!-- 只读：等级包在一枚「数值签」里（`NumTag`，票上挖出的一小格）。
             上限不写出来（2026-11-03 用户：「180 大家默认都知道」）；留下的「满」
             是**状态**，排在数字前面——读法是「状态 → 读数」，跟在后面会读成
             「180 满」，像在给这个数加注。 -->
        <NumTag v-if="!editable" class="slip-val">
            <span v-if="full" class="slip-note">满</span>
            <span class="lv">{{ row.level }}</span>
        </NumTag>

        <!-- 可编辑：同一个位置、同一个尺寸，换成能写的格子。 -->
        <NumberField
            v-else
            :id="inputId"
            update-on-input
            :model-value="row.level"
            label="等级"
            class="lv-field num-slot slip-input"
            @update:model-value="emit('update:level', $event)"
        />
    </div>
</template>

<style scoped>
/* 票面、两档尺寸、名目与读数的字色、三种状态，全在 `base.css` 的 `.slip-row` 一族。
 * 这一件只留两样「只有师门这一行才有」的东西。
 */

/* 首字印：只在图标查不到时出现。块面用纸白，与 `IconTile` 的槽色块区分开——
 * 那是「这枚是替身」的唯一线索，也是改版前那一枚的样子。 */
.seal-tile {
    --tile-w: 28px;
    --tile-h: 28px;
    --tile-r: var(--r-2);
    --tile-drop: 0.75;
    --tile-face: var(--paper);
    flex: none;
}
/* 字色写在内层，不写在块上：`PressTile` 给块设了 `--ink-2`，声明在内层更省事。 */
.seal-text {
    color: var(--accent);
    font-size: calc(var(--fs-sm) + 3px);
    line-height: 1;
}

label.slip-name {
    cursor: text;
}
</style>
