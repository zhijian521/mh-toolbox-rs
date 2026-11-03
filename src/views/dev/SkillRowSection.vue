<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SkillRow from '../characters/SkillRow.vue';
import type { SkillRow as SkillRowData } from '../characters/character';

/**
 * 师门技能行：**卡与编辑弹窗共用的那一行**，以及它内部那两个件
 * （`SkillTicks` 九格刻度、`NumTag` 数值签）。
 *
 * 放在这张卡里而不是「原子组件」那张，是因为它不是原子：它由三个原子拼成
 * （`PressTile` 字印 + `SkillTicks` + `NumTag` / `NumberField`），而且带着业务语义
 * （`level` / `cap` / `off`）。原子与组合件混在一张表里，下次谁想「复用」这行去别处
 * 就会以为它只是个排版件。
 *
 * ## 这张卡要盯的是「两态一处」
 *
 * 2026-11-03 之前，同一行在 `character-card.css` 与 `SkillEditor.vue` 里各写一遍，
 * 约六十条声明逐条对应，已经漂出差异：1.1 字号档下卡上的印 37、弹窗里 43。
 * 收口之后只有 `SkillRow.vue` 一份几何，这张卡把**两种形态并排摆**，
 * 差一像素就能一眼看出来——这就是它作为验收面的用处。
 *
 * ## 行高为什么钉 55
 *
 * 组件**不给行高**：卡上那七行是网格均分出来的（1.0 档 55、1.1 档 54，字放大反而更矮），
 * 弹窗里得自己钉住。这里钉 55 是照弹窗那一态——顺便验证了「高度必须确定」这条约束：
 * 印的 `--tile-h: calc(100% - 8px × 字号档)` 在不定高里会解析成 `auto`，印会缩成
 * 内容大小。把 `height` 换成 `min-height` 试一下，这块会立刻塌给你看。
 */
const demoLevel = ref(140);

/* 只读的五种状态：满级 / 练到一半 / 0 级 / 未学 / 不知道上限。
 * 顺序按「从有到无」排，最后一行是**没有刻度的样子**——老存档只存了等级、没存上限时
 * 就长这样，它不报错，只是不画条。 */
const DEMO_ROWS: SkillRowData[] = [
    { name: '金刚护体', level: 180, cap: 180 },
    { name: '后发制人', level: 140, cap: 180 },
    { name: '云雷诀', level: 0, cap: 180 },
    { name: '神迹', level: 60, cap: 180, off: true },
    { name: '万毒攻心', level: 45 },
];

/* 可编辑那一行：等级走 `v-model` 回来，点刻度抛的是**等级**不是下标，
 * 所以这里直接写回 `level` 就行——不必再 import `tickLevel`。 */
const editRow = computed<SkillRowData>(() => ({
    name: '修罗隐身',
    level: demoLevel.value,
    cap: 180,
}));
</script>

<template>
    <LedgerSection title="师门技能行" hint="卡上只读 · 弹窗可编，几何只有一份">
        <div class="rows-demo">
            <div class="rows-kit">
                <SkillRow v-for="row in DEMO_ROWS" :key="row.name" :row="row" />
                <SkillRow
                    :row="editRow"
                    editable
                    input-id="dev-skill-level"
                    @update:level="demoLevel = $event"
                />
            </div>

            <!-- 说明摆在样张右边：这张卡在 1024 下单列 942，而样张只有 430（角色卡的实际宽）。
                 说明挪到下面，右半张纸就空着——那 500 的空会读成「这一格没做完」。 -->
            <div class="rows-notes">
                <p class="note">
                    一行三列：<b>字印</b> ｜ <b>名称 + 九格刻度</b> ｜ <b>等级</b>。前五行只读，
                    最后一行 <code>editable</code> 把等级换成输入格、刻度换成可点的
                    <code>&lt;button&gt;</code>、名字换成 <code>&lt;label for&gt;</code>。
                </p>
                <p class="note">
                    <b>三个状态各管一件事</b>：<code>full</code> 数转朱 + 印翻朱面 + 槽描边转朱；
                    <code>idle</code>（0 级）印与字退灰；<code>off</code>（未学）只退名字——
                    「没练」与「没学」不是一个意思。
                </p>
                <p class="note">
                    格数按上限除（180 → 九格、100 → 五格），线的长短说的是<b>上限</b>不是练了
                    多少；上限缺席（第五行）时整条不画，不占位也不吃 <code>gap</code>。
                </p>
                <p class="note">
                    行高<b>不由组件给</b>：卡上由网格均分（1.0 档 55、1.1 档 54），弹窗里钉 55，
                    这一格钉的是弹窗那个数。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 样张在左、说明在右。430 是角色卡里这七行的**实际可用宽**（卡 450 − 左右各 10）——
 * 演示按真身给，否则「这里好看、卡上折行」又要多查一轮。
 *
 * 行距 8 取自 `.school-list` 的 `row-gap`，并把 `.paper-row + .paper-row` 的 2px 归零——
 * 那 2px 是属性表「一叠纸」的厚度，这里要的是「行距」，两个意思不共用一个值。 */
.rows-demo {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 20px;
}
.rows-kit {
    display: grid;
    flex: none;
    width: 430px;
    max-width: 100%;
    row-gap: 8px;
}
.rows-kit :deep(.paper-row) {
    height: 55px;
}
.rows-kit :deep(.paper-row + .paper-row) {
    margin-top: 0;
}
/* 说明列自己给 6 的行距：`.note` 的 `margin-top` 是「跟在控件后面」用的，
 * 在一列纯说明里会叠成 12。`flex: 1 1 320px` 让它在 1024 单列时占满右半；
 * 窗口再窄就折到样张下面（`.rows-demo` 是 wrap 的）。 */
.rows-notes {
    display: flex;
    flex: 1 1 320px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
.rows-notes .note {
    margin-top: 0;
}
</style>
