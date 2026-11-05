<script setup lang="ts">
import SkillRowView from '../SkillRow.vue';
import type { SkillRow } from '../character';

/** 卡内「师门」页。拆法与理由见 `AttrPane.vue` 顶部。 */
defineProps<{ rows: SkillRow[] }>();
</script>

<template>
    <section class="pane" role="tabpanel">
        <!-- 七项门派技能，一项一张票（`.slip-row` 来自 `base.css`，四页同一件器件）。
             行里只有三样东西：**图标 + 名称 + 等级签**。

             ---- 为什么是刻度而不是一条连续的条 ----
             这一页要回答的是「练到哪了」。连续条的答案是个长度差，得心算；
             九格（180 ÷ 20）的答案是「数格子」——120 就是六格满，一眼就数完，
             不用在 120 与 180 之间做减法。非整十的等级最后一格按比例填，
             所以 115 也读得出来是「五格多一点」。

             ---- 三道状态各管一件事，不互相抢 ----
             一半：格子灌朱，空格留着槽的边界；满级：槽的描边也转朱、数字与「满」转朱、
             字印翻成实心朱；0 级：字印与字一起退灰（`--muted`）——「还没开始」
             不该和「练了一半」一样亮。三处同色同义，不另立记号。

             上限缺席（老数据）时那一排刻度与分母一起不画：没有分母的百分比是编出来的。 -->
        <div v-if="rows.length" class="group-head school-head">
            <span class="section-mark"></span>门派技能
        </div>
        <div v-if="rows.length" class="slip-rows slip-cols">
            <!-- 一行是 `SkillRow`：字印 / 名称 + 九格刻度 / 等级签。
                 卡上只读、弹窗里可编辑，两处共用同一份解剖与同一组尺寸
                 （行内边距、印的大小、数字格的厚薄都在那个组件里量过一次）。 -->
            <SkillRowView v-for="row in rows" :key="row.name" :row="row" />
        </div>
        <p v-else class="empty-note">还没有记录门派技能</p>
    </section>
</template>

<style scoped src="./skill-pane.css"></style>
