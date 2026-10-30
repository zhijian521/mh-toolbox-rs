<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SlotButton from '../../components/SlotButton.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { useTheme } from '../../composables/use-theme';
import { THEME_OPTIONS } from './shared';

/**
 * 原子组件：三个抽出来复用的小件。
 *
 * 这张卡不是演示页，是**验收面**——新控件先进这里，再进业务页面。
 * 它和「外观」共用同一份状态（单例 composable），所以在上面切主题、拖字号，
 * 这里会立刻跟着变；这也顺带验证了单例确实生效。
 */
const { mode } = useTheme();
const { scale } = useFontScale();
</script>

<template>
    <LedgerSection title="原子组件" seal="原" hint="抽出来复用的三件，业务页直接拿去用">
        <div class="kit atoms-kit">
            <div class="kit-cell">
                <span class="col-head">SegmentedPills · 分段胶囊</span>
                <div class="kit-row">
                    <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
                </div>
                <p class="note">
                    一组里选一个。选项文案与值的类型由调用方给（泛型 T），单格质感全交给
                    <code>BevelPill</code>，它自己不重复写。
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
                    <SlotButton label="主题"><AppIcon name="moon" /></SlotButton>
                    <SlotButton label="仓库"><AppIcon name="github" /></SlotButton>
                    <SlotButton label="收起"><AppIcon name="rail-collapse" /></SlotButton>
                    <SlotButton label="停用" disabled><AppIcon name="trash" /></SlotButton>
                </div>
                <p class="note">
                    常态是槽（槽底 + 金边），悬停时朱印内缩 1px 落进去——移上去看。
                    尺寸不写死：侧栏经 <code>--slot-h</code> / <code>--slot-w</code> 传 30px
                    正方形。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>
