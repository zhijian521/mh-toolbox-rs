<script setup lang="ts">
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { FONT_OPTIONS, useFontFamily } from '../../composables/use-font-family';
import { STYLE_OPTIONS, THEME_OPTIONS, useTheme } from '../../composables/use-theme';

/**
 * 外观：风格、明暗、字体与字号。
 *
 * 只放**用户会用的东西**。原先跟着这块的两段机制说明（`color-scheme`、`--fs-scale`）
 * 一并搬去 `views/dev/`：这里给用户看，那里给做界面的人看，两张皮不混在一张卡里。
 *
 * 各项偏好分别记忆，所有入口共用模块级状态。
 */
const { mode, style } = useTheme();
const { scale } = useFontScale();
const { font } = useFontFamily();
</script>

<template>
    <LedgerSection title="外观">
        <div class="form-row">
            <span class="field-label">风格</span>
            <SegmentedPills v-model="style" :options="STYLE_OPTIONS" label="风格" wrap />
        </div>
        <div class="form-row">
            <span class="field-label">明暗</span>
            <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="明暗" />
        </div>
        <div class="form-row">
            <span class="field-label">字体</span>
            <SegmentedPills v-model="font" :options="FONT_OPTIONS" label="字体" wrap />
        </div>
        <div class="form-row">
            <span class="field-label">字号</span>
            <FontSizeSlider v-model="scale" />
        </div>
        <p class="well font-preview">梦幻养老助手 · 师门修炼 · 1234567890</p>
    </LedgerSection>
</template>

<style scoped>
.font-preview {
    margin: 12px 0 0;
    padding: 9px 10px;
    border-radius: var(--r-2);
    color: var(--ink-2);
    font-size: var(--fs-base);
    text-align: center;
    overflow-wrap: anywhere;
}
/* 行是全局 `.form-row`（`base.css`：flex + gap 10）——与捉鬼页的「监听窗口 /
 * 高概率区域」同一件东西。原先这里叫 `.row`，gap 12、纵向 12，那边 gap 9、纵向 13，
 * 两页翻着看时行内挤法确实不一样。
 *
 * 这里只留**这一页**的纵向节奏：两行紧邻时 12px。捉鬼页那边不同，它的一行后面
 * 还跟着一条 `.meta` 说明，相邻兄弟选择器落不到，所以那 12px 写在页面自己身上
 * （见 `GhostHuntView` 的 `.side-block > .form-row`）。 */
.form-row + .form-row {
    margin-top: 12px;
}
/* 标签的样式在全局 `.field-label`（`base.css`）：与捉鬼页的「监听窗口」「高概率区域」
 * 是同一种东西——次级墨、一档小字、字距放宽。原先这里叫 `.row-label`，
 * 与那边逐字相同地写了一份。 */
</style>
