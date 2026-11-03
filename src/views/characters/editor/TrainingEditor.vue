<script setup lang="ts">
import NumberField from '../../../components/NumberField.vue';
import type { TrainingGroup } from '../character';

/**
 * 修炼：两组，**只填等级**。
 *
 * 组名（任务修炼 / 宠物修炼）、项名（攻击修炼…育兽术）、上限（20 / 育兽术 35）
 * 三样全是游戏固定的，清单在 `TRAINING_GROUPS`（2026-11-03 用户：「不可编辑」）。
 * 上一版这里三样都能改——组名是输入框、行可增删、上限可填；那等于允许把
 * 「任务修炼」改成别的、把育兽术的上限改成 20，而卡片是按这套固定结构去核对的。
 *
 * 所以此刻这一页只剩一件事：十个数。没有「加一项」、没有删行、没有可编的分组名。
 * 与 `SkillEditor` 的 `fixedNames` 是同一种做法：值由别处决定的字段只显示、不给输入格
 * （CONVENTIONS §2.4-33）。
 */
const groups = defineModel<TrainingGroup[]>({ required: true });
</script>

<template>
    <div class="training-editor">
        <section v-for="(group, gi) in groups" :key="gi" class="training-group">
            <div class="train-head">
                <span class="section-mark"></span>
                <span class="group-title">{{ group.title }}</span>
            </div>

            <div v-for="(row, ri) in group.rows" :key="ri" class="erow">
                <!-- 名字与上限都来自清单：不上凹槽——**凹槽的意思是「这里可以写」**，
                     写不了却画成可以写，比少一个格子更糟。 -->
                <span class="name-text">{{ row.name }}</span>
                <NumberField
                    :model-value="row.level"
                    label="当前等级"
                    class="lv-field"
                    @update:model-value="row.level = $event"
                />
                <span class="slash">/</span>
                <span class="cap-text num">{{ row.cap }}</span>
            </div>
        </section>
    </div>
</template>

<style scoped>
.training-editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.train-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
}
/* 组名是固定字符串，不是可编辑标题：不上输入框、也不给聚焦态（`.field` 那套一整套
 * 槽料都不需要）。字号与字距照旧，读起来仍是这一组的标题。 */
.group-title {
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
}
/* 名字吃掉剩下的宽度，等级与上限就贴到右缘、十行成列——与卡片上
 * 「名目在左、数值在右」是同一个读法。 */
.name-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lv-field {
    width: 66px;
}
/* 上限的只读写法：宽 66，与等级格对齐。`SkillEditor` 那边 2026-11-03 起不再写上限
 * （师门技能一律 180），这一页仍要写——修炼每条的上限不同（20 / 25 / 35），
 * 不写就不知道「11」离满还差多少。 */
.cap-text {
    width: 66px;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}
/* 「/」不是装饰：它把两个数字读成 `11 / 20`，与卡内那条进度条同一个说法。
 * 用次级墨——它是一道分隔，不该和数字一样重。 */
.slash {
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
