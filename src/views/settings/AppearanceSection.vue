<script setup lang="ts">
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SettingsRow from './SettingsRow.vue';
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
    <LedgerSection title="外观" hint="自动记住" plain>
        <slot />
        <SettingsRow label="风格">
            <SegmentedPills v-model="style" :options="STYLE_OPTIONS" label="风格" wrap />
        </SettingsRow>
        <SettingsRow label="明暗">
            <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="明暗" wrap />
        </SettingsRow>
        <SettingsRow label="字体">
            <SegmentedPills v-model="font" :options="FONT_OPTIONS" label="字体" wrap />
        </SettingsRow>
        <SettingsRow label="字号">
            <FontSizeSlider v-model="scale" />
        </SettingsRow>
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
</style>
