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
 * 整道上（`border` + 顶壁渐变 + 上沿影）在 26px 高的小格里读成「又一个输入框」，
 * 而这一格在卡上是**静态的读数**，只需要「纸上凹下去一小块」。45% 的槽色刚好比
 * 纸带深一档、又不到输入框那种「挖开的洞」。这条数值与 `AttrEditor` 的常态一致——
 * 两处若各调各的，同一个数在卡上与弹窗里就是两个深浅。
 */
</script>

<template>
    <span class="num-tag num"><slot /></span>
</template>

<style scoped>
.num-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 内容之间的缝：卡上是「满」与三位数，3px 与 `.school-val` 原来那个 gap 同值。 */
    gap: 3px;
    box-sizing: border-box;
    width: var(--tag-w, auto);
    height: var(--tag-h, auto);
    padding: 0 4px;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--well) 45%, transparent);
    /* 四道棱只留凹的那两道（上沿压暗、下沿亮一线）：39px 的格子里若把边框与顶壁渐变
     * 全画上，它会读成一枚输入框；但一道影都不给，淡底就只是一块浅色贴纸——
     * 属性页那格读起来是「挖开的」，靠的正是这两笔（`.well` 的四件套里取两件）。 */
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    color: var(--ink);
    line-height: 1.35;
    white-space: nowrap;
}
</style>
