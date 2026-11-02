<script setup lang="ts">
import type { AttrGroup, ExpRow } from '../character';

/**
 * 属性分区：四组固定行 + 经验一行，**只有数值那一格能改**。
 *
 * 组名、行、顺序都由 `ATTR_GROUPS` 定死（用户 2026-11-02）：这一页是「照着游戏面板
 * 抄数字」，不是「想记什么就记什么」。所以这里没有加行、没有删行、没有改组名的输入框，
 * 也没有「标出」开关——能动的只有数字。
 *
 * 少掉那三样之后，一行只剩「标签 + 一格数」，正好对得上录入时的动作：
 * 打开游戏面板，从左到右把数字抄下来。原先每行后面跟着开关与删除按钮，
 * 一屏四组的右缘参差，抄数字时眼睛还要绕开它们。
 *
 * 数组走 `v-model`（绑的就是草稿里那一个）：只读 prop 过不了 `vue/no-mutating-props`。
 * 没有第二份副本——这一层没有保存动作，回传无从谈起。
 */
const groups = defineModel<AttrGroup[]>({ required: true });
const experience = defineModel<ExpRow>('experience', { required: true });
</script>

<template>
    <div class="attr-editor">
        <section v-for="group in groups" :key="group.title" class="attr-group">
            <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
            <div v-for="row in group.rows" :key="row.label" class="erow">
                <span class="row-label">{{ row.label }}</span>
                <input
                    v-model="row.value"
                    class="field num value-field"
                    :aria-label="row.label"
                    :placeholder="`${row.label}值`"
                />
            </div>
        </section>

        <!-- 经验不占四组的位置：它没有「项目名」，只有两个数（当前 / 升级所需）。 -->
        <section class="attr-group">
            <div class="group-head"><span class="section-mark"></span>经验</div>
            <div class="erow">
                <span class="row-label">当前</span>
                <input
                    v-model="experience.value"
                    class="field num exp-field"
                    aria-label="当前经验"
                    placeholder="如 3,777.2万"
                />
                <span class="row-label sub">升级所需</span>
                <input
                    v-model="experience.need"
                    class="field num exp-field"
                    aria-label="升级所需经验"
                    placeholder="如 4,200万"
                />
            </div>
            <p class="hint exp-hint">填了「升级所需」，卡上才画进度</p>
        </section>
    </div>
</template>

<style scoped>
.attr-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.group-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 5px;
}
/* 每行只有两样东西：固定标签 + 一格数。标签定宽 72，四组的数字左缘因此对齐——
 * 对齐之后竖着扫下来是一列数，而不是四段各自开头。 */
.row-label {
    flex: none;
    width: 72px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.row-label.sub {
    width: auto;
    margin-left: 8px;
}
/* 数值格给固定宽，**不撑满**：一行只剩「标签 + 一格数」之后，撑满会把输入框拉到
 * 500 宽，填一个 3916 像是往一张空表里写一个字。180 够放「3,777.2万」，
 * 也让四组的数字站在同一条竖线上、右边留白一致。 */
.value-field {
    width: 180px;
}
.exp-field {
    flex: 1;
    min-width: 140px;
}
.exp-hint {
    margin-top: 6px;
}
</style>
