<script setup lang="ts">
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import type { TrainingGroup } from '../character';

/**
 * 修炼：两组，组名可改，行可增删。
 *
 * 组是游戏自己划的（角色自身 / 召唤兽控制），所以这里**不给「跨组拖动」也不给合并**
 * ——那是数据层的事，而数据显示成两组正是因为它本来就是两组。
 * 上限按行存（育兽术 35、其余 20），不是按组存一个数。
 */
const groups = defineModel<TrainingGroup[]>({ required: true });

function addRow(group: TrainingGroup) {
    // 新行的上限跟同组最后一行走：一组里通常同一个上限，省掉每次重填。
    const cap = group.rows[group.rows.length - 1]?.cap ?? 20;
    group.rows.push({ name: '', level: 0, cap });
}
</script>

<template>
    <div class="training-editor">
        <section v-for="(group, gi) in groups" :key="gi" class="training-group">
            <div class="group-head">
                <span class="section-mark"></span>
                <input
                    v-model="group.title"
                    class="field group-title"
                    aria-label="分组名"
                    placeholder="分组名"
                />
            </div>

            <div v-for="(row, ri) in group.rows" :key="ri" class="erow">
                <input
                    v-model="row.name"
                    class="field name-field"
                    aria-label="修炼项"
                    placeholder="修炼项"
                />
                <NumberField
                    :model-value="row.level"
                    label="当前等级"
                    class="lv-field"
                    @update:model-value="row.level = $event"
                />
                <span class="slash">/</span>
                <NumberField
                    :model-value="row.cap"
                    label="上限"
                    class="cap-field"
                    @update:model-value="row.cap = $event"
                />
                <PressButton icon="trash" label="删掉这一项" @click="group.rows.splice(ri, 1)" />
            </div>

            <div class="group-foot">
                <PressButton
                    icon="add"
                    text="加一项"
                    label="给这一组加一项"
                    @click="addRow(group)"
                />
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
.group-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
}
/* 与属性那组同一个说法：不聚焦时读作标题，聚焦才浮出输入格。 */
.group-title {
    flex: 1;
    height: 24px;
    padding: 0 4px;
    border-color: transparent;
    background: none;
    /* 三道槽料各自关掉：边框透明、底色清空之后，若不连阴影一起关，
     * 标题下方会剩一道 1px 的亮线（`.field` 的底壁高光）——标题不是格子。 */
    box-shadow: none;
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
}
.group-title:hover {
    border-color: var(--rule-2);
}
/* 聚焦时才真的长成一格。全局 `.field:focus:not(:disabled)` 会给它补上槽的
 * 顶壁影与底壁亮线，这里把边和底也补齐——否则一道内影浮在透明框里，像标题下方
 * 蹭了一块脏。只有这一处要补：`.field` 的其余变体本来就带着边与底。 */
.group-title:focus {
    border-color: var(--lip-shade) var(--lip-light) var(--lip-light) var(--lip-shade);
    background: var(--well);
}
/* 名字给固定宽，**不 flex: 1**：一撑满，`0 / 20` 就被推到行尾，
 * 中间空出大半行——读起来是「一列空白」而不是「一个修炼项配一个进度」。
 * 200 够写「召唤兽控制修炼」这类长名（六字 72px + 余量），也让两组上下对齐。 */
.name-field {
    width: 200px;
}
.lv-field {
    width: 66px;
}
.cap-field {
    width: 66px;
}
/* 「/」不是装饰：它把两个数字读成 `11 / 20`，与卡内那条进度条同一个说法。
 * 用 11px 的次级墨——它是一道分隔，不该和数字一样重。 */
.slash {
    color: var(--muted);
    font-size: var(--fs-sm);
}
.group-foot {
    margin-top: 8px;
}
</style>
