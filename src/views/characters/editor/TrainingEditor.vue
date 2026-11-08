<script setup lang="ts">
import NumberField from '../../../components/NumberField.vue';
import type { TrainingGroup } from '../character';

/**
 * 修炼：两组，**填等级与上限**。
 *
 * 组名（任务修炼 / 宠物修炼）、项名（攻击修炼…育兽术）两样是游戏固定的，清单在
 * `TRAINING_GROUPS`（2026-11-03 用户：「不可编辑」）。上一版这里三样都能改——组名是
 * 输入框、行可增删；那等于允许把「任务修炼」改成别的，而卡片是按这套固定结构去核对的。
 *
 * **上限反过来：它能改**（2026-11-04 用户：「修炼上限 也可以修改」）。它不是游戏常量，
 * 而是跟号走——帮派与「修炼上限提升」会把它推高，同一个「攻击修炼」在这个号 20、
 * 在那个号 25。清单里那个数只当默认值：这一格留空时，占位字就是存下去会变成的数。
 *
 * 所以这一页可编的是**十个数对的数**：每行「等级 / 上限」。仍然没有「加一项」、
 * 没有删行、没有可编的分组名——那些是结构，结构由清单定（CONVENTIONS §2.4-33）。
 *
 * 2026-11-04：**版式改成左右两列**（一组一列），行也换成与卡上同一张票
 * （`base.css` 的 `.slip-row`，四页共用一份）。
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

            <!-- 一组一列、一项一张票：与卡上同一个器件（2026-11-04 用户：「编辑可以
                 左右」）。十行摊成两列之后每组只剩五行，一屏看完不用滚。 -->
            <div class="slip-rows">
                <div v-for="(row, ri) in group.rows" :key="ri" class="slip-row">
                    <!-- 项名来自清单：不上凹槽——**凹槽的意思是「这里可以写」**，
                         写不了却画成可以写，比少一个格子更糟。 -->
                    <span class="slip-name">{{ row.name }}</span>
                    <NumberField
                        :model-value="row.level"
                        :label="`${row.name} 等级`"
                        class="lv-field num-slot"
                        @update:model-value="row.level = $event"
                    />
                    <span class="slash">/</span>
                    <!-- 上限是可编的，所以它也是一道槽。占位字给清单默认值，
                         这样「清空」读作「回默认」而不是「留了个空」——保存时
                         `normalizeTrainings` 正是这么处理的。 -->
                    <NumberField
                        :model-value="row.cap"
                        :label="`${row.name} 上限`"
                        zero-as-empty
                        class="cap-field num-slot"
                        @update:model-value="row.cap = $event"
                    />
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* 左右两列，一组一列（2026-11-04 用户：「角色卡片 可以上下 任务修炼和宠物修炼，编辑可以左右」）。
 *
 * 内容区 622：两列各 303（间距 16）。单列时是十行直排、上下滚到底才看得到宠物那一组；
 * 分成两列之后每组五行，两组的分量也读得出来——上面的卡上就是上下两组，编辑页是同一个分段。
 *
 * 代价写在明处：内容从 364 掉到约 256，弹窗（六页签共用 656 × 760 定高）底部会空出一截。
 * 这跟辅助页现在的情形一样——那一段空白属于「这一页只有五行」，不属于「还没画完」。 */
.training-editor {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
}
/* 行距由 `.slip-rows` 给（6）；组头与第一张票之间 8px 比默认的 2px 松一档——
 * 这一页是拿来填的，组与组的分界要看得出来。 */
.train-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
}
/* 组名是固定字符串，不是可编辑标题：不上输入框、也不给聚焦态（`.field` 那套一整套
 * 槽料都不需要）。字号与字距照旧，读起来仍是这一组的标题。 */
.group-title {
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
}
/* **两格同宽**，交给两侧同值。同宽之后对齐只剩一个选择：**两格都居中**。
 * 原来等级右对齐、上限左对齐，是为了让两个数都贴住斜杠；宽度一样时再这么做，
 * 上限右边会空出半格没字的槽——那看起来像「这一格没填」。居中时空白对称地落在数字
 * 两侧，斜杠仍是那道分界。
 *
 * 宽度原先由行上的 `--slot-w: 52px` 给（不乘字号档）；2026-11-04 四页统一时改成
 * 直接写 52 × 字号档，与卡上那枚签同一个算法——同一个数在两处不该一处跟字号一处不跟。 */
.lv-field,
.cap-field {
    flex: none;
    /* 52 × 24：与卡上那枚 `11/20` 的签逐值相同。卡上一行 42 装 24 的签，
     * 编辑页一行也是 42，两边填的时候手指落在同一个位置（26 → 24 是 2026-11-04
     * 跟着签一起收的：签矮了格不跟着矮，核对时同一项在卡上与这里会差半毫米）。 */
    width: calc(52px * var(--fs-scale));
    height: calc(24px * var(--fs-scale));
    padding: 0 6px;
    /* 字号也跟卡上那枚签走（15.5）：卡上 `11/20` 里 11 是 15.5、`/20` 是 10，
     * 编辑页若还按 `.field` 的 12，填完核对时同一项在两处大小不同。
     * 上限那一格下面单独压回 `--fs-xs`，与卡上「分母小一档」同一条。 */
    font-size: calc(var(--fs-md) + 1px);
    text-align: center;
}
/* 上限字小一档、色退一档（`--ink-2`）：它是一道分母，而读数是左边那个。
 * **但槽的形状与尺寸跟等级完全相同**——两道都是能写的地方。 */
.cap-field {
    color: var(--ink-2);
    font-size: var(--fs-xs);
    line-height: 1.35;
}
/* 「/」不是装饰：它把两个数字读成 `11 / 20`，与卡内那条进度条同一个说法。
 * 用次级墨——它是一道分隔，不该和数字一样重。 */
.slash {
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
