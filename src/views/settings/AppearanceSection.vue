<script setup lang="ts">
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { useTheme } from '../../composables/use-theme';
import { THEME_OPTIONS } from './shared';

/**
 * 外观：主题与字号两条通路。
 *
 * 两个 composable 都是模块级单例，所以这里改了，左栏的快捷按钮和「原子组件」那张卡
 * 会同步翻面——这是拆组件之后仍然成立的前提。
 */
const { mode } = useTheme();
const { scale } = useFontScale();
</script>

<template>
    <LedgerSection title="外观" hint="一键换纸：令牌全部走 light-dark()">
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
            <span class="hint">全站文字同步缩放，区块标与金额一起变</span>
        </div>
        <p class="note">
            切主题只改根元素上的 <code>color-scheme</code>，颜色令牌不需要第二份；
            「跟随系统」时监听 <code>prefers-color-scheme</code>，Tauri 侧以后接
            <code>setTheme('system')</code> 即可，前端不用改。
        </p>
        <p class="note">
            字号同理：三档只改 <code>--fs-scale</code> 一个变量（0.92 / 1 / 1.1）， 八档字号全是
            <code>calc(Npx * var(--fs-scale))</code>。
        </p>
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
