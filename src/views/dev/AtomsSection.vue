<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SlotButton from '../../components/SlotButton.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { THEME_OPTIONS, useTheme } from '../../composables/use-theme';

/**
 * 原子组件：六个抽出来复用的小件。
 *
 * 这张卡不是演示页，是**验收面**——新控件先进这里，再进业务页面。
 * 它和「外观」共用同一份状态（单例 composable），所以在上面切主题、拖字号，
 * 这里会立刻跟着变；这也顺带验证了单例确实生效。
 */
const { mode } = useTheme();
const { scale } = useFontScale();

/** 两格开关的演示状态。它是二选一，没有第三态，所以用两个 ref 而不是数组。 */
const recorded = ref(true);
const autoSave = ref(false);
</script>

<template>
    <LedgerSection title="原子组件" hint="抽出来复用的六件，业务页直接拿去用">
        <div class="kit atoms-kit">
            <div class="kit-cell">
                <span class="col-head">SegmentedPills · 分段胶囊</span>
                <div class="kit-row">
                    <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
                </div>
                <p class="note">
                    一组里选一个。选项文案与值的类型由调用方给（泛型 T），单格质感是全站的
                    <code>.bevel-pill</code>，它自己不重复写；整组只占一个 Tab 停靠点，左右键切换。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">FontSizeSlider · 三档滑块</span>
                <div class="kit-row">
                    <FontSizeSlider v-model="scale" />
                </div>
                <p class="note">
                    三个落点，不是连续值——所以滑块要「啪」地掉到格上（240ms 回弹），
                    而不是三格各自变亮。凹轨道由它自己带。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">SlotButton · 槽按钮</span>
                <div class="kit-row">
                    <SlotButton label="归档" icon="archive" />
                    <SlotButton label="导出账目" icon="download" text="导出" />
                    <SlotButton label="刷新" text="刷新" />
                    <SlotButton label="停用" icon="trash" disabled />
                </div>
                <!-- 变体与尺寸各占一行：`seal` 是「印在不在」，`size` 是「槽多大」，
                     混在同一行会让人以为它们是同一种分类。 -->
                <div class="kit-row">
                    <SlotButton label="主操作（印已落定）" icon="play" text="开始识别" seal />
                </div>
                <div class="kit-row">
                    <SlotButton label="小一号 24px" text="sm" size="sm" />
                    <SlotButton label="默认 26px" text="md" />
                    <SlotButton label="大一号 31px" text="lg" size="lg" />
                </div>
                <p class="note">
                    悬停时朱印内缩落进槽里（内缩随尺寸走：<code>md</code>/<code>sm</code> 1px、
                    <code>lg</code> 2px），移上去看。三种形态由 props 组合定，不另开组件：只给
                    <code>icon</code> 是纯图标（正方形），<code>icon</code> +
                    <code>text</code> 是图标带字，只给 <code>text</code> 是纯文字。
                    <code>seal</code> 是变体不是形态：印面常驻，用于主操作——一屏只该有一枚，
                    两枚就等于没有主次。<code>size</code> 是尺寸预设（<code>sm</code> 24 /
                    <code>lg</code> 31），落在 <code>--slot-h</code> 上，父级仍可用变量覆写。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">CostSwitch · 两格开关</span>
                <div class="kit-row">
                    <CostSwitch v-model="recorded" off-label="否" on-label="是" />
                    <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                </div>
                <p class="note">
                    滑块真的滑过去，240ms 带回弹；关闭态是灭灯，不是变灰。两格文案由
                    <code>off-label</code> / <code>on-label</code> 给——「否 / 是」就是最朴素的用法，
                    换成「手动 / 自动」「不记 / 记」还是这同一个件。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">PressTile · 压印块 / PressButton · 压印按钮</span>
                <div class="kit-row">
                    <div class="kit-tiles">
                        <PressTile class="kit-tile"><AppIcon name="tools" /></PressTile>
                        <PressTile class="kit-tile kit-tile-sm"><AppIcon name="pin" /></PressTile>
                        <PressTile class="kit-tile kit-tile-sm">
                            <span class="kit-tile-word">梦</span>
                        </PressTile>
                    </div>
                </div>
                <!-- 下面一排是 `PressButton`——同一块纸当按钮用，三形态与 `SlotButton`
                     一个思路：只给 text / icon+text / 只给 icon（正方形）。 -->
                <div class="kit-row">
                    <PressButton text="归档" label="归档：纯文字按钮" />
                    <PressButton icon="download" text="导出" label="导出：图标 + 文字" />
                </div>
                <div class="kit-row">
                    <PressButton icon="play" text="开始" label="开始：主操作（块面灌朱）" seal />
                    <PressButton icon="pin" label="纯图标按钮" />
                    <PressButton text="sm" label="小一号 24px" size="sm" />
                    <PressButton text="lg" label="大一号 31px" size="lg" />
                </div>
                <p class="note">
                    一块光从左上方来的压印纸：块面、左上偏光、四条不对称的棱（上左受光、下 2px 右
                    1px 背光）、落地影。工具页的图标格与左栏牌记都是它——悬停亮一档、按下凹回
                    纸里，试试。几何走
                    <code>--tile-w</code> / <code>--tile-h</code> / <code>--tile-r</code> /
                    <code>--tile-drop</code>，图标尺寸仍归 <code>--icon-size</code>。
                </p>
                <p class="note">
                    <b>下面两排是压印块做成的按钮</b>（<code>PressButton</code>）：块凸着、字压在
                    块上，按下去被压回纸里。三档尺寸与 <code>SlotButton</code> 逐像素同值，
                    两种按钮并排时基线齐；<code>seal</code> 把块面灌成朱红，用于主操作，
                    一屏只该有一枚。<b>它和槽按钮是两种材质，别在同一行混用</b>——
                    一凹一凸并排，读起来是两种器件。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* ---------- 展示网格与格标题 ----------
 * 原先在 `blocks.css` / `base.css`（全局）。按 §2.4-14 的判据「会不会被第二个组件用」，
 * 它们只有这一页用——收进 scoped 之后，全局表里不再有「看起来别处也在用」的类。
 * `.note` 仍是全局的：四张开发卡都用它。
 */
.kit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
    gap: 14px;
}
.kit-cell {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 11px 11px;
    border: var(--w-hair) solid var(--rule);
    background: var(--bg);
}
.kit-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
}
.kit-cell .note {
    margin-top: 0;
}
/* 每格顶上那行小标题：次级墨、更宽的字距——读作「这一格的条目名」，不是内容。 */
.col-head {
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    letter-spacing: 0.18em;
    color: var(--muted);
}

/* 五件排成 2 + 2 + 1。断点由卡片**内容宽度**算，不写 `@media`——与 `.stack-pair` 同一条
 * （CONVENTIONS §2.4-20）。这里原先用 `@media (max-width: 1080px)` 退回一列，
 * 于是同一套「最少多宽才放得下」的判断，一处在 CSS 里量、一处按视口猜。
 *
 * `.kit` 默认 `minmax(330px, 1fr)` 在正文宽度下会算成三列，第四件独占一行、右边留个空洞，
 * 所以要覆写。480 不是抄 `.stack-pair` 的 420，是量出来的：正文可用 968（窗口 1024）时，
 * 两列各 442，`CostSwitch` 那条说明会掉到第二行末尾剩两个字（「…还是这同一个件。」→「件。」）。
 * 480 让它在 1024 退回一列，1280（两列各 570）仍是两行两列。
 *
 * 五件之后最后一行只剩 `PressTile` 一格，右边空着——**不再为它调列宽**。
 * 那格的内容是三块并排的方块，本来就不满宽；把一个满宽的第四件硬拉成三列，
 * 会让前四格的说明文字全部重排，为了一格的空白去动四格的断行，不划算。
 */
.atoms-kit {
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
}

/* 三块并排，间隔比 `.kit-row` 的 7px 宽：7px 是给胶囊和小按钮的，
 * 56px 的块挨这么紧，读作「一块被切成了三片」。底部对齐，34 那两枚自然坐在同一条线上。 */
.kit-tiles {
    display: flex;
    align-items: flex-end;
    gap: 14px;
}

/* 56px 是工具页图标格的尺寸、26px 是它的图标——演示按真身给，不另调一套，
 * 否则「演示里好看、业务页里不对劲」又要多查一轮。
 * 34px 那两枚与左栏牌记同尺寸：落地影缩到 0.6（块小了，8px 软影会读作「浮起来」），
 * 圆角回到 `--r-2` 与目录槽同心。图标跟着缩到 15px，与牌记里那只字的份量接近。 */
.kit-tile {
    --tile-w: 56px;
    --icon-size: calc(26px * var(--fs-scale));
}
.kit-tile-sm {
    --tile-w: 34px;
    --tile-r: var(--r-2);
    /* 与左栏牌记逐项同值（0.85，不是 0.6）：这一格是验收面，摆的必须是线上那块。
     * 0.6 时影子只剩 1px 宽的一条，在这张 `--bg` 底的格子里勉强看得出，搬到牌记的
     * `--paper` 栏底就成了「一张平的浅色方块」。 */
    --tile-drop: 0.85;
    --icon-size: calc(15px * var(--fs-scale));
}
/* 演示用的替身字：线上牌记摆的是一张 192px 的图（行楷「梦」），笔画很细——
 * 实测最深处虽然是 #231f1b，但不透明像素只有约 1200 个，绝大部分是抗锯齿的边。
 * 一只 17px 的实心楷体字压上去比它重得多，所以这里用次级墨，让演示看着接近那块图；
 * 真要改线上那块，改的是 `assets/mark-ink.png`，不是这一行。 */
.kit-tile-word {
    font-size: calc(17px * var(--fs-scale));
    line-height: 1;
    color: var(--ink-2);
}
</style>
