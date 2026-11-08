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
 * **行本身也用卡上那一张票**（2026-11-02 用户要求「弹窗里也同步属性的样式」）：
 * 这里原先是一列凹槽输入框——同样几组数，在卡上是一张张票、在弹窗里是一排挖开的槽，
 * 看着像两个界面。现在行、材质、字色全走 `base.css` 的 `.slip-row.sm`（与卡上同一个
 * 尺寸 28），输入框是票上挖出的一小格：淡槽底、无边框、居中，与卡上那枚签同一个落点。
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
            <div class="slip-rows sm">
                <!-- `<label>` 包住整行：点标签上的字也能落到数字格，比把可点面积
                     收进右侧那一小格宽得多。 -->
                <label v-for="row in group.rows" :key="row.label" class="slip-row sm">
                    <span class="slip-name">{{ row.label }}</span>
                    <input
                        v-model="row.value"
                        class="field num value-field num-slot"
                        :aria-label="row.label"
                    />
                </label>
            </div>
        </section>

        <!-- 经验不占五组的位置：它没有「项目名」，只有两个数（当前 / 升级所需），
             所以跨满两列单独一行——前四组是 2 × 2 的表，末组通栏，它不属于任何一格。 -->
        <section class="attr-group exp-group">
            <div class="group-head"><span class="section-mark"></span>经验</div>
            <div class="slip-rows sm">
                <!-- 这一条里有**两组**「名目 + 数值」，各占半行：
                     两个数之间不连，所以不是四样东西平铺在一行上。 -->
                <div class="slip-row sm exp-row">
                    <span class="exp-cell">
                        <span class="slip-name">当前</span>
                        <input
                            v-model="experience.value"
                            class="field num value-field num-slot exp-field"
                            aria-label="当前经验"
                        />
                    </span>
                    <span class="exp-cell">
                        <span class="slip-name">升级所需</span>
                        <input
                            v-model="experience.need"
                            class="field num value-field num-slot exp-field"
                            aria-label="升级所需经验"
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
/* 组是 grid 的子项，默认 `min-width: auto`：不肯折行的内容会把整列撑宽。
 * 归零之后宽度只由 `1fr` 说了算（卡上同一条）。 */
.attr-group {
    min-width: 0;
}
/* 经验是第四条「组」，但它不属于 2 × 2 的任何一格——跨满两列，落在表格下方。 */
.exp-group {
    grid-column: 1 / -1;
}
/* 组头（短竖条 + 分栏名）在 `base.css` 的 `.group-head`，与卡上同一份。
 * 它只交代「这一栏叫什么」，不该比组里的数字更响。 */
/* 名目与间距都在 `base.css` 的 `.slip-row.sm` / `.slip-name` 里（名目吃满中间，
 * 与卡上同一个字号、同一个字色）。这里只剩经验那一行的「一条票里两组」：
 * 两组各占半行，组内仍是「名目吃剩宽 + 数字格贴右」。 */
.exp-row {
    gap: 16px;
}
.exp-cell {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

/* ---------- 票上的数字格 ----------
 * 常态就是一格**看得见的数**：淡槽底、居中、无边框（2026-11-02 用户：
 * 「输入框直接就显示现在 hover 上的样式」）。原先常态透明、悬停才浮出色块，
 * 可这一页是要一格一格填的——全隐起来像在纸上凌空写字，填之前还得先「找到」格子。
 *
 * 材质在 `base.css` 的 `.num-slot`（只给静息态）+ `.field.num-slot`（悬停 68%、
 * 聚焦实槽），与卡上那枚只读的属性签、师门等级签、修炼那两个格用的是同一份。
 * 这里只剩**几何与排版**。
 *
 * ## 52 × 18，与卡上那枚签逐值相同
 *
 * 2026-11-03 用户嫌 104 太长，收到 60；2026-11-04 四页统一时再收到 **52**——不是又
 * 缩了 8px，而是卡上那枚签的 `--tag-w` 就是 52（五位数 40.5 ＋ 内边距 10 留 3）。
 * 填完抬眼核对时，编辑页这一格与卡上那一枚**同宽同高、同一个落点**，中间不必再换算。
 *
 * **经验那两格不跟着收**：它存的是 `3,777.2万` 这种带单位的长串（实测 63.5px），
 * 52 会把它截掉。所以那一对单独挂 `.exp-field` 走 104。
 *
 * 高度也取卡上那枚签的 18（原 20，2026-11-04 跟着签一起收），而不是 `.field` 的标准 26：
 * 26 是表单里的格子，塞进 28 高的票里上下只剩 1px，票的圆角与棱就看不见了。
 * 18 与票的关系正好是卡上「签 18 / 行 28」。
 *
 * ## 字色用赭，不用墨（2026-11-03 用户：「太黑了有点扎眼，用角色卡片的颜色」）
 *
 * 这一页不是一张空白表单，是**照着卡上那张表逐格核对**的：左边写着名目、右边填着数，
 * 填完抬眼就能和卡比。卡上的读数是赭（`--num`），编辑页原先跟着 `.field` 用墨——
 * 同一行数在两处一个色深一个色浅，对照时像两份不同的记录。
 *
 * 居中也是跟着卡走的：卡上那枚签把数居中，编辑页这一格原先右对齐。宽度一样之后，
 * 右对齐会让「3916」与「800」在同一个格子里一处贴右、一处贴中间偏右；居中时两边留白
 * 对称，格子的位置一眼能认。 */
.value-field {
    flex: none;
    width: calc(52px * var(--fs-scale));
    height: calc(18px * var(--fs-scale));
    padding: 0 6px;
    color: var(--num);
    line-height: 1;
    text-align: center;
}
/* 经验那两格：`3,777.2万` 这类长串要放得下，沿用原来的 104。 */
.exp-field {
    width: calc(104px * var(--fs-scale));
}
</style>
