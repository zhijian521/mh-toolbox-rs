<script setup lang="ts">
import { ref } from 'vue';
import CostSwitch from '../../components/CostSwitch.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SlotButton from '../../components/SlotButton.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { THEME_OPTIONS, useTheme } from '../../composables/use-theme';

/**
 * 原子组件：四个抽出来复用的小件。
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
    <LedgerSection title="原子组件" hint="抽出来复用的四件，业务页直接拿去用">
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
                <p class="note">
                    悬停时朱印内缩 1px 落进槽里，移上去看。三种形态由 props 组合定，不另开组件：只给
                    <code>icon</code> 是纯图标（正方形），<code>icon</code> +
                    <code>text</code> 是图标带字，只给 <code>text</code> 是纯文字。
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
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 四件两行两列。断点由卡片**内容宽度**算，不写 `@media`——与 `.stack-pair` 同一条
 * （CONVENTIONS §2.4-20）。这里原先用 `@media (max-width: 1080px)` 退回一列，
 * 于是同一套「最少多宽才放得下」的判断，一处在 CSS 里量、一处按视口猜。
 *
 * `.kit` 默认 `minmax(330px, 1fr)` 在正文宽度下会算成三列，第四件独占一行、右边留个空洞，
 * 所以要覆写。480 不是抄 `.stack-pair` 的 420，是量出来的：正文可用 968（窗口 1024）时，
 * 两列各 442，`CostSwitch` 那条说明会掉到第二行末尾剩两个字（「…还是这同一个件。」→「件。」）。
 * 480 让它在 1024 退回一列，1280（两列各 570）仍是两行两列。 */
.atoms-kit {
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
}
</style>
