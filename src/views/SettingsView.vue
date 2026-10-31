<script setup lang="ts">
import PageShell from '../components/PageShell.vue';
import AboutSection from './settings/AboutSection.vue';
import AppearanceSection from './settings/AppearanceSection.vue';

/**
 * 设置页：给用户用的两件事——换纸与字号，外加版本信息。
 *
 * 这一页原先有六张卡，其中四张（原子组件、色板、字号阶梯、图标）是开发时查的东西，
 * 已经整体搬去 `views/dev/DevKitView.vue`（三连击左上角标进入）。
 * 判据不是「有多少内容」，而是**这一页的读者是谁**：设置页的读者只有用户，
 * 用户在这里要办的事也只有换纸与字号；多一张卡就多一次「这跟我有关系吗」的停顿。
 *
 * 「控件」与「结构」两张演示卡更早就删了：它们演示的组件与线条各有其主，
 * 同一件事留两处演示，改一处就得记得改另一处。
 *
 * 只剩两张卡，就并成一排（`.stack-pair`）：竖排时两张白纸挤在左上角、右边空出一屏，
 * 那是「删剩两张」之后才有的浪费。并排之后整页一屏到头，不用滚；断点由卡片内容宽度决定，
 * 窗口窄了自动退回一列，不做两套布局。
 */
</script>

<template>
    <PageShell title="设置" desc="主题 · 字号 · 关于">
        <div class="stack stack-pair">
            <AppearanceSection />
            <AboutSection />
        </div>
    </PageShell>
</template>
