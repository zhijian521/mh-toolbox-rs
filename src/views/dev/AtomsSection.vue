<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import MeterBar from '../../components/MeterBar.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SlotButton from '../../components/SlotButton.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { THEME_OPTIONS, useTheme } from '../../composables/use-theme';

/**
 * 原子组件：八个抽出来复用的小件。
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

/** 输入格的演示值：给个真数字，才看得出「等宽数字」与「0 显示为空」两件事。 */
const demoLevel = ref(130);
</script>

<template>
    <LedgerSection title="原子组件" hint="抽出来复用的八件，业务页直接拿去用">
        <div class="kit atoms-kit">
            <div class="kit-cell">
                <span class="col-head">SegmentedPills · 分段胶囊</span>
                <div class="kit-row">
                    <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
                </div>
                <p class="note">
                    一组选一个，整组只占一个 Tab 停靠点。单格质感用全局
                    <code>.bevel-pill</code>，组件内不另写。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">FontSizeSlider · 三档滑块</span>
                <div class="kit-row">
                    <FontSizeSlider v-model="scale" />
                </div>
                <p class="note">三档，不是连续值；滑块 240ms 回弹落格。凹轨道自带。</p>
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
                     混在同一行会让人以为它们是同一种分类。
                     主操作那行给 md / lg 两枚、都用两字文案「开始」，是为了在**一行内**
                     看出尺寸差；业务页里仍然一屏只该有一枚。 -->
                <div class="kit-row">
                    <SlotButton label="主操作 · 默认 26px" icon="play" text="开始" seal />
                    <SlotButton
                        label="主操作 · 大一号 31px"
                        icon="play"
                        text="开始"
                        size="lg"
                        seal
                    />
                </div>
                <div class="kit-row">
                    <SlotButton label="默认 26px" text="md" />
                    <SlotButton label="大一号 31px" text="lg" size="lg" />
                </div>
                <p class="note">
                    形态由 props 定：只给 <code>icon</code> 是纯图标，<code>icon</code> +
                    <code>text</code> 带字，只给 <code>text</code> 是纯文字。<code>seal</code>
                    是变体，主操作用，一屏一枚；尺寸 <code>md</code> 26 / <code>lg</code> 31。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">CostSwitch · 两格开关</span>
                <div class="kit-row">
                    <CostSwitch v-model="recorded" off-label="否" on-label="是" />
                    <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                </div>
                <p class="note">
                    两格文案由 <code>off-label</code> / <code>on-label</code> 给；滑块 240ms
                    回弹，关闭态灭灯不是变灰。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">Field · 输入格 / NumberField · 数字格</span>
                <div class="kit-row">
                    <input class="field kit-field" placeholder="角色名" aria-label="演示：角色名" />
                    <NumberField
                        :model-value="demoLevel"
                        label="演示：等级"
                        class="kit-field-num"
                        @update:model-value="demoLevel = $event"
                    />
                    <input
                        class="field kit-field-num"
                        placeholder="上限"
                        aria-label="演示：留空的上限"
                    />
                </div>
                <div class="kit-row">
                    <textarea
                        class="field area kit-area"
                        rows="2"
                        placeholder="多行：每行一条"
                        aria-label="演示：多行输入"
                    />
                </div>
                <p class="note">
                    凹槽里挖的一格，高与 <code>PressButton</code> 的 <code>md</code> 同值。
                    焦点换边色、不画外框——方框压在圆角上会露四个角。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">MeterBar · 进度条</span>
                <div class="kit-row">
                    <MeterBar :percent="72" label="演示：进度 72%" text="3,777.2万 / 4,200万" />
                </div>
                <div class="kit-row">
                    <!-- 分母未知：轨道空着、不写 aria-valuenow。与「0%」是两件事。 -->
                    <MeterBar :percent="null" label="演示：进度未知" text="3,777.2万" />
                </div>
                <p class="note">
                    凹槽里灌一段朱色。它<b>不是滑块</b>——没有落点、不能拖；分母未知时轨道留空，
                    不画成 0%。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">MeterBar · 进度条</span>
                <div class="kit-row">
                    <MeterBar :percent="72" label="演示：进度 72%" text="3,777.2万 / 4,200万" />
                </div>
                <div class="kit-row">
                    <!-- 分母未知：轨道空着、不写 aria-valuenow。与「0%」是两件事。 -->
                    <MeterBar :percent="null" label="演示：进度未知" text="3,777.2万" />
                </div>
                <p class="note">
                    凹槽里灌一段朱色。它<b>不是滑块</b>——没有落点、不能拖；分母未知时轨道留空，
                    不画成 0%。
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
                <!-- 第一行压印块，第二行四种内容（纯文字 / 图标带字 / 纯图标 / 灌朱），
                     第三行尺寸：内容和「槽多大」不是一种分类，混在一行读起来像四个尺寸。 -->
                <div class="kit-row">
                    <PressButton text="归档" label="归档：纯文字按钮" />
                    <PressButton icon="download" text="导出" label="导出：图标 + 文字" />
                    <PressButton icon="pin" label="纯图标按钮" />
                    <PressButton icon="play" text="开始" label="开始：主操作（块面灌朱）" seal />
                </div>
                <div class="kit-row">
                    <PressButton text="md" label="默认 26px" />
                    <PressButton text="lg" label="大一号 31px" size="lg" />
                </div>
                <p class="note">
                    <b>上排是压印块</b>：一块光从左上方来的纸，左上偏光、四棱受力不均、落地影。
                    工具页图标格与左栏牌记都是它，悬停亮一档、按下凹回纸里。
                    <b>下面两排是压印按钮</b>：同一块纸当按钮用，<code>seal</code> 把块面灌朱，
                    用于主操作，一屏一枚。尺寸与槽按钮逐像素同值——
                    <b>但一凹一凸是两种材质，别混在同一行</b>。
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
 * 所以要覆写。480 不是抄 `.stack-pair` 的 420，是量出来的：420 时窗口 1024 会排两列、
 * 各 442 宽，槽按钮的 `md` / `lg` 两枚折成上下两行（2026-11-02 在 432 宽实测即折）——
 * 那两枚是要在**同一行**看出尺寸差的，折了就白摆了。480 让它到 1024 仍是一列（878），
 * 1280（两列各 570）两行两列。
 *
 * 五件之后最后一行只剩 `PressTile` 一格，右边空着——**不再为它调列宽**。
 * 那格的内容是三块并排的方块，本来就不满宽；把一个满宽的第四件硬拉成三列，
 * 会让前四格的说明文字全部重排，为了一格的空白去动四格的断行，不划算。
 */
.atoms-kit {
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
}

/* 演示用的三条宽度：输入格里最长的一条是「角色名」，数字格按真实表单里的 72px 给，
 * 多行那条铺满整格——都按业务页里真身的尺寸摆，不另调一套。 */
.kit-field {
    width: 130px;
}
.kit-field-num {
    width: 72px;
}
.kit-area {
    width: 100%;
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
 * 一只 17px 的实心楷体字压上去比它重得多，所以它靠 `PressTile` 的默认字色
 * （`--ink-2`）就够了，**不在这里另设 color**：上一版是「图标满墨、这字降一档」，
 * 2026-11-02 把默认值统一下来之后，两者本来就同色了。
 * 真要改线上那块，改的是 `assets/mark-ink.png`，不是这一行。 */
.kit-tile-word {
    font-size: calc(17px * var(--fs-scale));
    line-height: 1;
}
</style>
