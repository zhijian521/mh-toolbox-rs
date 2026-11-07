<script setup lang="ts">
import { useId } from 'vue';
import SkillRowView from '../SkillRow.vue';
import type { SkillRow } from '../character';

/**
 * 卡内「师门」页。拆法与理由见 `AttrPane.vue` 顶部。
 *
 * `editable` / `tabbed` / `edit-level` 三样与属性页对齐（那边写在 `AttrPane.vue`
 * 的文件头里，这里只记差异）：截图识别认完师门面板之后，**这一页的等级也要能在卡上
 * 直接改**——认错一个数在那儿改最直观。抛上去的是技能名，不是行号：
 * 名字才是识别层认识的东西，行号一改门派就全错位了。
 *
 * `tabbed` 只影响 ARIA：预览卡不画页签条时，这一页从 `tabpanel` 降级成 `region`。
 */
withDefaults(defineProps<{ rows: SkillRow[]; editable?: boolean; tabbed?: boolean }>(), {
    editable: false,
    tabbed: true,
});

const emit = defineEmits<{ 'edit-level': [name: string, level: number] }>();

/* 等级格的 id。用 `useId()` 而不是拼 `attrs.id`：这一页在同一个 DOM 里会出现
 * 两份（名册那张卡 + 识别预览那张），`attrs.id` 已经在前面加了 `-preview` 后缀，
 * 再拼一层容易两处撞车；`useId()` 每次实例化都给一个新前缀。 */
const uid = useId();
</script>

<template>
    <section class="pane" :role="tabbed ? 'tabpanel' : 'region'">
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
            <!-- 一行是 `SkillRow`：图标 / 名称 + 等级签。卡上只读、弹窗里可编辑，
                 两处共用同一份解剖与同一组尺寸（行内边距、印的大小、数字格的厚薄
                 都在那个组件里量过一次）。 -->
            <SkillRowView
                v-for="(row, index) in rows"
                :key="row.name"
                :row="row"
                :editable="editable"
                :input-id="editable ? `${uid}-lv-${index}` : undefined"
                @update:level="emit('edit-level', row.name, $event)"
            />
        </div>
        <p v-else class="empty-note">还没有记录门派技能</p>
    </section>
</template>

<style scoped src="./skill-pane.css"></style>
