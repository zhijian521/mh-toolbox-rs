<script setup lang="ts">
import PageShell from '../components/PageShell.vue';
import AboutSection from './settings/AboutSection.vue';
import AppearanceSection from './settings/AppearanceSection.vue';
import DataSection from './settings/DataSection.vue';
import LicenseSection from './settings/LicenseSection.vue';

/** 外观／数据优先，关于／许可在后；沿用按内容宽度换列的四区布局。 */
</script>

<template>
    <PageShell title="设置" desc="外观偏好 · 数据管理">
        <div class="stack stack-pair">
            <AppearanceSection />
            <DataSection />
            <AboutSection />
            <LicenseSection />
        </div>
    </PageShell>
</template>
