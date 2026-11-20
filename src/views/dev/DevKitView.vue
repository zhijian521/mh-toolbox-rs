<script setup lang="ts">
import { ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import AppearanceSection from '../settings/AppearanceSection.vue';
import AtomsSection from './AtomsSection.vue';
import DevDataSection from './DevDataSection.vue';
import FeedbackSection from './FeedbackSection.vue';
import IconsSection from './IconsSection.vue';
import PaletteSection from './PaletteSection.vue';
import SlipRowSection from './SlipRowSection.vue';
import TypeScaleSection from './TypeScaleSection.vue';

/** 三连击侧栏牌记或 #/dev 进入，不加入普通导航。切组保留演示状态。 */
type DevSection = 'components' | 'tokens' | 'icons' | 'data';
const section = ref<DevSection>('components');
const SECTIONS: { value: DevSection; label: string }[] = [
    { value: 'components', label: '组件预览' },
    { value: 'tokens', label: '设计令牌' },
    { value: 'icons', label: '图标目录' },
    { value: 'data', label: '调试数据' },
];
</script>

<template>
    <PageShell title="开发帮助" desc="组件预览 · 资源调试">
        <div class="stack dev-kit">
            <SegmentedPills v-model="section" :options="SECTIONS" label="开发帮助分组" wrap />
            <div v-show="section === 'components'" class="stack" data-dev-section="components">
                <AtomsSection />
                <SlipRowSection />
                <FeedbackSection />
            </div>
            <div v-show="section === 'tokens'" class="stack" data-dev-section="tokens">
                <p class="note">共用设置页的外观偏好，切换影响全站；色板与字号从当前样式表读取。</p>
                <AppearanceSection />
                <div class="stack-pair">
                    <PaletteSection />
                    <TypeScaleSection />
                </div>
            </div>
            <div v-show="section === 'icons'" data-dev-section="icons">
                <IconsSection />
            </div>
            <div v-show="section === 'data'" data-dev-section="data">
                <DevDataSection />
            </div>
        </div>
    </PageShell>
</template>

<style scoped>
.dev-kit > .pill-group {
    align-self: flex-start;
    max-width: 100%;
}
</style>
