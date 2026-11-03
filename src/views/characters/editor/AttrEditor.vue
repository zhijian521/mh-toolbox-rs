<script setup lang="ts">
import type { AttrGroup, ExpRow } from '../character';

/**
 * 属性分区：五组固定行 + 经验一行，**只有数值那一格能改**。
 *
 * 组名、行、顺序都由 `ATTR_GROUPS` 定死（用户 2026-11-02）：这一页是「照着游戏面板
 * 抄数字」，不是「想记什么就记什么」。所以这里没有加行、没有删行、没有改组名的输入框，
 * 也没有「标出」开关——能动的只有数字。
 *
 * 少掉那三样之后，一行只剩「标签 + 一格数」，正好对得上录入时的动作：
 * 打开游戏面板，从左到右把数字抄下来。原先每行后面跟着开关与删除按钮，
 * 一屏五组的右缘参差，抄数字时眼睛还要绕开它们。
 *
 * **排布与卡上同一张表**（2026-11-02 用户要求「属性展示和角色卡片保持一致，一行两个」）：
 * 两行两列、行优先，上排资源 / 名望、下排战斗 / 加点，末组「潜能」通栏切两格，
 * 经验再跨两列单独一行。
 * 不只是好看——录完一个号回卡上核对时，眼睛按同一个位置找「战斗」，不用重新定位；
 * 面板内容区 622 宽时一列排五组会把表拉成一根竖条，两列反而把五组收进一屏。
 *
 * **行本身也用卡上那一条纸带**（同日用户要求「弹窗里也同步属性的样式」）：
 * 这里原先是一列凹槽输入框——同样几组数，在卡上是一条条凸起的纸带、在弹窗里是一排
 * 挖开的槽，看着像两个界面。现在行、色带、点线、字色全走 `base.css` 的 `.paper-row`，
 * 输入框是纸带上挖出的一小格：淡槽底、无边框、右对齐，与卡上的数字同一个落点。
 * 底色一直在（不再「悬停才显形」）——这一页要一格一格填，格子先得看得见。
 *
 * 数组走 `v-model`（绑的就是草稿里那一个）：只读 prop 过不了 `vue/no-mutating-props`。
 * 没有第二份副本——这一层没有保存动作，回传无从谈起。
 */
const groups = defineModel<AttrGroup[]>({ required: true });
const experience = defineModel<ExpRow>('experience', { required: true });
</script>

<template>
    <div class="attr-editor">
        <section
            v-for="group in groups"
            :key="group.title"
            class="attr-group"
            :class="{ wide: group.wide }"
        >
            <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
            <div class="paper-rows">
                <!-- `<label>` 包住整行：点标签上的字也能落到数字格，比把可点面积
                     收进右侧那一小格宽得多。 -->
                <label v-for="row in group.rows" :key="row.label" class="paper-row">
                    <span class="row-label">{{ row.label }}<span class="leader"></span></span>
                    <input
                        v-model="row.value"
                        class="field num value-field num-slot"
                        :aria-label="row.label"
                        :placeholder="`${row.label}值`"
                    />
                </label>
            </div>
        </section>

        <!-- 经验不占五组的位置：它没有「项目名」，只有两个数（当前 / 升级所需），
             所以跨满两列单独一行——前四组是 2 × 2 的表，末组通栏，它不属于任何一格。 -->
        <section class="attr-group exp-group">
            <div class="group-head"><span class="section-mark"></span>经验</div>
            <div class="paper-rows">
                <!-- 这一条里有**两组**「名目 + 数值」，各占半行、各自带点线：
                     两个数之间不连，所以不是四样东西平铺在一行上。 -->
                <div class="paper-row exp-row">
                    <span class="exp-cell">
                        <span class="row-label">当前<span class="leader"></span></span>
                        <input
                            v-model="experience.value"
                            class="field num value-field num-slot exp-field"
                            aria-label="当前经验"
                            placeholder="如 3,777.2万"
                        />
                    </span>
                    <span class="exp-cell">
                        <span class="row-label">升级所需<span class="leader"></span></span>
                        <input
                            v-model="experience.need"
                            class="field num value-field num-slot exp-field"
                            aria-label="升级所需经验"
                            placeholder="如 4,200万"
                        />
                    </span>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.attr-editor {
    /* 两行两列，行优先：前四组按 `ATTR_GROUPS` 的顺序自动落格、末组（潜能）通栏，
     * 与卡上 `.attr-layout` 同一套排法。列距 20 比卡上的 26 小：内容区 622 而卡的
     * 属性区只有 398，同值会让两列之间空出一条窄巷，几组读成「几张分开的小表」。
     *
     * 左右留白**不在这里加**：这一层写过 `padding: 0 32px`，只有属性页往里收，
     * 页头与页签条仍贴边，一眼错位。现在留白统一由外框给（`.editor` 的
     * `--editor-pad-x` = 16，纸本身也缩到 656），六个页签一视同仁；
     * 这里再写一份就是双重内缩。 */
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 20px;
    /* 通栏组（潜能：乾元丹 / 潜能果）内部两格的列距，见 `base.css` 的
     * `.attr-group.wide`。取 20 而不是卡上的 26：内容区 622 宽，26 会让两格离得太远。 */
    --pair-gap: 20px;
}
/* 经验是第四条「组」，但它不属于 2 × 2 的任何一格——跨满两列，落在表格下方。 */
.exp-group {
    grid-column: 1 / -1;
}
/* 组头（短竖条 + 分栏名）在 `base.css` 的 `.group-head`，与卡上同一份。
 * 它只交代「这一栏叫什么」，不该比组里的数字更响。 */
/* 标签吃掉剩余宽度，点线在其中撑开——与卡上 `.ledger dt` 逐条对应，
 * 所以弹窗里「气血 …… 3916」的断点位置与卡上一样。 */
.row-label {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
/* 经验行是**两组**「名目 + 数值」，各占半行；组内与属性行同构（标签吃剩宽、
 * 点线撑开、数右对齐），所以这一条读起来仍是表，不是「四个控件的排布」。 */
.exp-row {
    gap: 16px;
}
.exp-cell {
    display: flex;
    flex: 1 1 0;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
}

/* ---------- 纸带上的数字格 ----------
 * 常态就是一格**看得见的数**：淡槽底、右对齐、无边框（2026-11-02 用户：
 * 「输入框直接就显示现在 hover 上的样式」）。原先常态透明、悬停才浮出色块，
 * 可这一页是要一格一格填的——全隐起来像在纸上凌空写字，填之前还得先「找到」格子。
 *
 * 材质在 `base.css` 的 `.num-slot`（只给静息态）+ `.field.num-slot`（悬停 68%、
 * 聚焦实槽），与卡上那枚只读的等级签、师门技能那一列、属性读数用的是同一份。
 * 这里只剩**几何与排版**。
 *
 * ## 宽 60，不是 104（2026-11-03 用户：「数字下面的背景太长了，缩短一点」）
 *
 * 属性值是 3–4 位数，5 位封顶。楷体一个字宽约 8px，五位 40.5，
 * 加左右内边距 12 是 52.5——104 有一半是空的，读起来像「还没填满的输入框」。
 * 60 给 5 位留了 7px 余量，也还容得下「气血值」三个字的占位提示。
 *
 * **经验那两格不跟着收**：它存的是 `3,777.2万` 这种带单位的长串（实测 63.5px），
 * 60 会把它截掉。所以那一对单独挂 `.exp-field` 走 104。
 *
 * 高度不能沿用 `.field` 的 26：那是表单里的标准格，套进 5px 内边距的纸带行里，
 * 整行会从 26 长到 36，几组一拍就散。这里改 `auto` + `line-height: 1.35`，
 * 行高与卡上同为 26。 */
.value-field {
    flex: none;
    width: calc(60px * var(--fs-scale));
    height: auto;
    padding: 0 6px;
    color: var(--ink);
    /* 行高按 1.35 压：`normal` 在 input 上算出 18px，再叠 2px 边框，整行就从 26
     * 长到 28——弹窗与卡并排时这点差看得出（行距不齐）。1.35 让内容高与卡上的
     * 文本行高同为 16。 */
    line-height: 1.35;
    text-align: right;
}
/* 经验那两格：`3,777.2万` 这类长串要放得下，沿用原来的 104。 */
.exp-field {
    width: calc(104px * var(--fs-scale));
}
/* 空格的提示字比常规 placeholder 再淡一档：纸带上的「气血值」只是标位，
 * 浓了会被当成填进去的内容。 */
.value-field::placeholder {
    color: color-mix(in srgb, var(--muted) 72%, transparent);
}
</style>
