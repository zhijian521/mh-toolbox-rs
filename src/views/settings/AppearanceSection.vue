<script setup lang="ts">
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { THEME_OPTIONS, useTheme } from '../../composables/use-theme';

/**
 * 外观：设置页里唯一真正要用户调的卡——换纸与字号。
 *
 * 只放**用户会用的东西**。原先跟着这块的两段机制说明（`color-scheme`、`--fs-scale`）
 * 一并搬去 `views/dev/`：这里给用户看，那里给做界面的人看，两张皮不混在一张卡里。
 *
 * 两个 composable 都是模块级单例，所以这里改了，左栏那枚主题按钮会同步翻面。
 */
const { mode } = useTheme();
const { scale } = useFontScale();
</script>

<template>
    <LedgerSection title="外观">
        <div class="row">
            <span class="row-label">主题</span>
            <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
            <span class="hint"
                >当前：{{ THEME_OPTIONS.find((item) => item.value === mode)?.label }}</span
            >
        </div>
        <div class="row row-gap">
            <span class="row-label">字号</span>
            <FontSizeSlider v-model="scale" />
            <span class="hint">全站文字一起缩放</span>
        </div>
    </LedgerSection>
</template>

<style scoped>
.row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.row-gap {
    margin-top: 12px;
}
.row-label {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0.14em;
}
</style>
