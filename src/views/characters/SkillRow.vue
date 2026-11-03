<script setup lang="ts">
/**
 * 师门技能的一行：字印 ｜ 名称 + 九格刻度 ｜ 等级。
 *
 * 卡上只读、弹窗里可编辑，但**行是同一件东西**——同一项技能在两处的行高、印的大小、
 * 数字格的厚薄必须一样，否则「填完回卡上核对」时眼睛要重新找位置。原先这段解剖写在
 * 两个文件里（`character-card.css` 的 `.school-row` 族与 `SkillEditor.vue` 的
 * `.school-erow` 族），约六十条声明逐条对应，改一处忘一处就分叉：2026-11-03 收口时
 * 1.1 字号档下卡上的印是 37、弹窗里是 43，就是因为一边按行高算、一边写死了
 * `39px × 字号档`。
 *
 * ## 几何只有一个来源
 *
 * 四组数与卡上量出来的完全一致，写在这里一次：
 *   - 行：`padding: 4px 10px`、`gap: 10px`、三列按中线对齐
 *   - 印：`行内容高 − 8px × 字号档`（1.0 档 39），`aspect-ratio: 1` 由高算宽
 *   - 数字格：`56 × 30 × 字号档`
 *   - 名称与刻度的列内间距：9
 *
 * 行高**不由本组件给**：卡上那七行是容器均分出来的（1.0 档 55、1.1 档 54，字放大
 * 反而更矮），弹窗里得自己钉住 55。两处各管各的行高、共用这里面的字号与格子。
 *
 * 印的 `--tile-h: calc(100% - …)` 要求行高是**确定的**：卡上是 grid 轨道（确定），
 * 弹窗那边因此写 `height: 55px` 而不是 `min-height`——不定的高度会让百分比解析成
 * `auto`，印会缩成内容大小。
 *
 * ## 三种状态各管一件事
 *
 *   - `full`：数字转朱、印翻朱面、刻度整条转朱（后两项在 `SkillTicks` 里）
 *   - `idle`（0 级）：印与字退灰，块面退回半透明那一档
 *   - `off`（未学，只有辅助技能会有）：名字退灰
 *
 * `idle` 与 `off` 是两件事——「学了但一级没练」与「这个号没学这一项」——但都要退后，
 * 退的程度也一样：不能让「练了一半」跟它们混在一起。
 *
 * ## 可编辑时只加两样
 *
 * 数字格换成 `NumberField`（同一份 `.num-slot` 材质），刻度换成可点的（`interactive`）。
 * 名字变成 `<label for>`，点名字落进等级格——**不能再用「整行包 `<label>`」**：
 * 一行里还有九个按钮，`label` 只认第一个可标记元素，点了会把焦点送给第一格刻度。
 */
import { computed } from 'vue';
import NumberField from '../../components/NumberField.vue';
import NumTag from '../../components/NumTag.vue';
import PressTile from '../../components/PressTile.vue';
import SkillTicks from './SkillTicks.vue';
import { isMaxed, type SkillRow as SkillRowData } from './character';

const props = withDefaults(
    defineProps<{
        row: SkillRowData;
        /** 可填。卡上不给，弹窗里给。 */
        editable?: boolean;
        /** 等级格的 `id`，名字的 `for` 指向它。只在可编辑时有用。 */
        inputId?: string;
        /**
         * 上限的**兜底值**：跨过 `row.cap` 用。
         *
         * 老存档里的门派技能可能只有等级、没有 `cap`。卡上按数据原样画（没上限就不画刻度），
         * 而编辑页知道「这个号的门派技能上限一律 180」（`schoolSkillCap()`），所以那一页
         * 传一个兜底值进来——否则打开老号会看见七行都没有刻度，像坏了。
         */
        cap?: number;
    }>(),
    { editable: false, inputId: undefined, cap: undefined },
);

const emit = defineEmits<{ 'update:level': [level: number] }>();

/* 上限：调用方给的兜底值优先，否则用行上存着的。两处都为 undefined 时
 * `SkillTicks` 不画条——没有分母的百分比是编出来的。 */
const capOf = computed(() => props.cap ?? props.row.cap);
const full = computed(() => isMaxed({ level: props.row.level, cap: capOf.value }));
const idle = computed(() => props.row.level === 0);

/* 字印：技能名的第一个字。它不是缩写，是**一枚印**——七行左侧各压一枚方印，
 * 一行才有落点，纸带才不会空成「一行字 + 一条线」。
 *
 * 取首字而不是图标，是因为门派技能图标还没给；将来给了，把这一格换成 `<img>` 即可，
 * 方框、行距、刻度位置一分不动。用 `[...name][0]` 而不是 `name[0]`：遇上表情符号或
 * 生僻字（代理对）时，后者会切出半个字符。 */
const seal = computed(() => [...props.row.name][0] ?? '');
</script>

<template>
    <div class="paper-row school-row" :class="{ full, idle, off: props.row.off }">
        <PressTile class="school-seal" still :tone="full ? 'seal' : 'paper'" aria-hidden="true">
            <span class="seal-text">{{ seal }}</span>
        </PressTile>

        <!-- 名称与刻度是**同一列的两行**：三列（印 / 名称+刻度 / 数值）都用
             `align-items: center` 对齐到同一条中线，印再靠行高自己撑开。 -->
        <span class="school-main">
            <label v-if="editable" class="name" :for="inputId">{{ row.name }}</label>
            <span v-else class="name">{{ row.name }}</span>
            <SkillTicks
                :level="row.level"
                :cap="capOf"
                :interactive="editable"
                @pick="emit('update:level', $event)"
            />
        </span>

        <!-- 只读：等级包在一枚「数值签」里（`NumTag`，纸带上挖出的一小格）。
             上限不写出来（2026-11-03 用户：「180 大家默认都知道」）；留下的「满」
             是**状态**，排在数字前面——读法是「状态 → 读数」，跟在后面会读成
             「180 满」，像在给这个数加注。 -->
        <NumTag v-if="!editable" class="school-val">
            <span v-if="full" class="full-note">满</span>
            <span class="lv">{{ row.level }}</span>
        </NumTag>

        <!-- 可编辑：同一个位置、同一个尺寸，换成能写的格子。 -->
        <NumberField
            v-else
            :id="inputId"
            :model-value="row.level"
            label="等级"
            class="lv-field num-slot"
            @update:model-value="emit('update:level', $event)"
        />
    </div>
</template>

<style scoped>
.school-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
}

/* 字印 = 一枚 `PressTile`（凸起的纸块），这里只给几何与字。
 *
 * `--tile-h` 取「行内容高再让一圈」：拿到 47（55 − 上下 4）再各让 4——块离纸带上下缘 8、
 * 离左缘 10，三边接近，块才读作「压在带子上」而不是「塞满带子的一格」。
 * 不写死尺寸：`aspect-ratio: 1` 由高算宽，七行同高同宽，字号档一变它自己跟着。
 * 内缩量乘 `--fs-scale`，否则 1.1 档会让那圈呼吸又缩回去。
 *
 * 落地影 0.85：影的尺度是按块的大小调的，39 的块与 34 的牌记差得不多，同一档够用；
 * 缩到 0.6 时影子只剩 1px 宽的一条，块读作一张平的浅色方块（牌记那边实测）。
 *
 * 块面用**不透明的纸**，不是 `PressTile` 默认的 92% 半透明：纸带的底是 `--paper-2`，
 * 半透明叠上去只比带子亮一丁点，亮色下凸起几乎全靠影。暗色还要**再提一档**——
 * `--paper`(#1c1912) 比纸带(#231f16) 更暗，直接用会读成凹进去的一块。 */
.school-seal {
    align-self: center;
    aspect-ratio: 1;
    --tile-w: auto;
    --tile-h: calc(100% - 8px * var(--fs-scale));
    --tile-r: var(--r-2);
    --tile-drop: 0.85;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper) 84%, var(--ink)));
}

/* 字色写在内层，不写在块上：`PressTile` 给块设了 `--ink-2`，满级还要换成纸白，
 * 两处都在内层声明。子元素的直接声明永远赢过祖先继承来的 `color`，不必比特异性。 */
.seal-text {
    color: var(--cinnabar);
    font-size: calc(var(--fs-md) + 2px);
    line-height: 1;
}

/* 名称 + 刻度：同一列的两行，整块在行内居中。
 * `min-width: 0` 是给省略号用的——flex 子项的下限是内容宽，不给它，长名字会把
 * 这一列顶宽、右边那一格被挤出去。 */
.school-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 9px;
    min-width: 0;
}

/* 名字：可编辑时是 `<label>`，只读时是 `<span>`——两者同一套字，只是标签不同，
 * 所以选择器只写 `.name`。 */
.name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-sm);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}
label.name {
    cursor: text;
}

/* 右边那一格：定宽 56、高 30（乘字号档），数居中。
 *
 * 为什么定宽：列宽若由内容撑开（「满 180」比「120」宽一个字），没写「满」的行数字窄、
 * 刻度就长一截——七行刻度左端参差，像七把长短不一的尺子。
 * 56 是最宽那行「满 180」实测 45 再加左右内边距 8、留 3px 余量。
 *
 * 为什么高 30 而不是与字印等高：等高（39）时右边那块读作「与字印对称的第二个方块」，
 * 矮一档才回到「一条读数被框住」。再矮字就贴边了（字 18.5，30 高上下各 5.75）。
 *
 * 两处写法不同是因为物性不同：`NumTag` 的宽高走 `--tag-*`（它自己也有一条
 * `width: var(--tag-w)`，同特异性下不押样式注入顺序），输入格直接用 `width` / `height`。 */
.school-val {
    flex: none;
    --tag-w: calc(56px * var(--fs-scale));
    --tag-h: calc(30px * var(--fs-scale));
}
.school-row .lv-field {
    flex: none;
    width: calc(56px * var(--fs-scale));
    height: calc(30px * var(--fs-scale));
}
/* 读数与格子里的字同一套：赭色（数值墨）、比名目大两档、居中。
 * 同一个数在卡上与弹窗里不该一个大一个小、一个赭一个墨。 */
.school-row .lv,
.school-row .lv-field {
    color: var(--num);
    font-size: calc(var(--fs-md) + 3px);
    line-height: 1;
    text-align: center;
}
/* 「满」是状态，不是上限：字号比等级小一档、颜色退到次一级——它是一句注，
 * 不是第二个读数。 */
.full-note {
    color: var(--muted);
    font-size: var(--fs-mini);
}

/* ---------- 满级 ----------
 * 三处同一个意思，都只发生在这一行：印翻朱面（`tone`）、数转朱、整条刻度转朱
 * （最后一项在 `SkillTicks` 里：平时填墨，`.full` 才换朱）。不另挂一枚「满」的签——数字旁边那个已经写着，
 * 再加一个框是把同一句话说两遍。
 *
 * 印里的字要**单独说**：朱面上写朱字等于没字，那一枚翻成纸白（`--on-seal`）。
 * 其余三处（等级、可编辑格、那个「满」）都在纸面上，统一转朱。 */
.school-row.full .seal-text {
    color: var(--on-seal);
}
.school-row.full .lv,
.school-row.full .full-note,
.school-row.full .lv-field {
    color: var(--cinnabar);
}

/* ---------- 未学 / 0 级 ----------
 * 两者都要退后，退的程度一样：不能让「练了一半」跟它们混在一起。
 * 0 级的块面也退回半透明那一档——一整块纸白的方块摆在 0 级的行首，比「练到 60」
 * 那块还亮，读起来像「这一项已经记上了」。 */
.school-row.off .name,
.school-row.idle .name,
.school-row.idle .seal-text,
.school-row.idle .lv,
.school-row.idle .lv-field {
    color: var(--muted);
}
.school-row.idle .school-seal {
    --tile-face: color-mix(in srgb, var(--paper) 92%, transparent);
}
</style>
