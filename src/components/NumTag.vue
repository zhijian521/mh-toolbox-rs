<script setup lang="ts">
/**
 * 数值签：纸带上挖出的一小格，只装一个数。
 *
 * 出处是属性编辑页那排数字格（`AttrEditor` 的 `.value-field`）：凸起的纸带上挖开一格、
 * 淡槽底。角色卡的师门页借过来——七行等级原先是悬在纸带尾上的三段字，
 * 与左边那枚凸起的字印不是一套语言（2026-11-03 用户：「用个类似修改属性数字里的
 * 样式包裹一下，可以单独封装成一个 tag 标签」）。
 *
 * 与属性页那格有一处不同：**数居中，不右对齐**（同日用户：「数字居中展示」）。
 * 属性页右对齐是因为一格一栏、要竖着比大小；师门这一列只有三位数、宽度已按最大
 * 值收窄，居中的留白两边均匀，读起来才是「一枚签」而不是「少填了几位」。
 *
 * ## 它只画外壳
 *
 * 内容走默认插槽，所以「满 180」里的「满」仍能单独上朱色。**不接受点击**：
 * 这是一枚签，不是按钮——悬停不加深、没有按下态（加深是「这里能填」的承诺，
 * 而卡上那一格填不了）。真正的输入框仍走 `NumberField`，两处材质取同一份数值
 * （见下），只是各自的交互层不同。
 *
 * ## 几何走变量
 *
 *   - `--tag-w`  宽（不给就由内容定）
 *   - `--tag-h`  高（不给就由内容行高定）
 *
 * 与 `PressTile` 的 `--tile-*`、`SlotButton` 的 `--slot-*` 同一条约定：组件只说材质
 * 与内部排布，尺寸归调用方——同一个签在卡上是 39 高，在别处可能是 26。
 *
 * ## 为什么底色是 45% 而不是整道 `.well`
 *
 * 整道上（`border` + 顶壁渐变 + 上沿影）在 30px 高的小格里读成「又一个输入框」，
 * 而这一格在卡上是**静态的读数**，只需要「纸上凹下去一小块」。45% 的槽色刚好比
 * 纸带深一档、又不到输入框那种「挖开的洞」。
 *
 * 这条材质 2026-11-03 收进了 `base.css` 的 `.num-slot`：同一个 45% 原先在
 * `AttrEditor` 的 `.value-field`、`SkillEditor` 的 `.lv-field` 与这里各写一遍，
 * 前两处还因为用 `background-color` 长写而留着 `.field` 的顶壁渐变——
 * 同一个数在卡上与弹窗里深浅不同就是这么来的。现在三处引同一份。
 */
</script>

<template>
    <span class="num-tag num num-slot"><slot /></span>
</template>

<style scoped>
/* 材质（45% 槽色、两道上沿 / 下沿棱、悬停与聚焦）在 `base.css` 的 `.num-slot`：
 * 属性页的数字格与师门技能的等级格用的是同一份，三处各写一遍已经写出了深浅差异。
 * 这里只剩「一枚签」的形状——尺寸由使用方经 `--tag-w` / `--tag-h` 给。 */
.num-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 内容之间的缝：卡上是「满」与三位数，3px 与它原来那个 gap 同值。 */
    gap: 3px;
    box-sizing: border-box;
    width: var(--tag-w, auto);
    height: var(--tag-h, auto);
    padding: 0 4px;
    border-radius: var(--r-2);
    color: var(--ink);
    line-height: 1.35;
    white-space: nowrap;
}
/* 悬停**不加深**——不需要在这里写：`.num-slot` 只给静息材质，加深与聚焦挂在
 * `.field.num-slot` 上（见 `base.css`）。这枚签是 `<span>`，本来就不该有「能填」的反馈。
 * 上一版曾用 `.num-tag.num-slot:hover` 抬高特异性压掉它，那个补丁已随分层面删掉。 */
</style>
