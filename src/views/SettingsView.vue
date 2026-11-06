<script setup lang="ts">
import PageShell from '../components/PageShell.vue';
import AboutSection from './settings/AboutSection.vue';
import AppearanceSection from './settings/AppearanceSection.vue';
import DataSection from './settings/DataSection.vue';
import LicenseSection from './settings/LicenseSection.vue';

/**
 * 设置页：给用户用的四件事——换纸与字号、账本的进出、版本信息、许可范围。
 *
 * 这一页原先有六张卡，其中四张（原子组件、色板、字号阶梯、图标）是开发时查的东西，
 * 已经整体搬去 `views/dev/DevKitView.vue`（三连击左上角标进入）。
 * 判据不是「有多少内容」，而是**这一页的读者是谁**：设置页的读者只有用户，
 * 用户在这里要办的事也只有换纸、字号、账本与「我能拿它做什么」；
 * 多一张卡就多一次「这跟我有关系吗」的停顿。
 *
 * 「控件」与「结构」两张演示卡更早就删了：它们演示的组件与线条各有其主，
 * 同一件事留两处演示，改一处就得记得改另一处。
 *
 * 排法是**两列、四张卡**：`.stack-pair` 是 `repeat(auto-fit, minmax(420px, 1fr))`，
 * 1280 窗宽下正好两列，四张卡排成两行、**不留空格**。
 *
 * **顺序按「多久会看一次」排，不按「是什么」排**（2026-11-06 定的）：第一行是会被反复用的
 * ——外观（换纸、字号）与数据（导出、导入、清除）；第二行是读一次的——关于（版本、环境）
 * 与许可（能不能商用）。许可原先挂在关于卡下半截，靠一条通栏细线隔开；拆成独立一张之后
 * 第二行正好排满，也不必再用一条线去说明「下面说的是另一件事」。
 *
 * **曾经给数据卡加过 `.wide`（`grid-column: 1 / -1`）让它通栏**，理由是「按钮各带一句说明，
 * 通栏之后说明都能一行读完」。实拍之后否掉了：通栏那张宽 1198px，而内容最远只到卡片左边
 * 约 400px 处，**右侧空出三分之二**——一张很长的纸、字全挤在左上角，比「说明折一行」更难看。
 * 现在四张卡上都没有 class，也不存在写给它们的 `grid-column` 规则；想再试通栏之前，
 * 先看 `docs/RECORD.md` 第 87 批里这条被否的方案。
 *
 * 断点由卡片内容宽度决定（`minmax(420px, 1fr)`），窗口窄了自动退回一列，
 * 不做两套布局——所以这里也没有断点媒体查询。
 */
</script>

<template>
    <PageShell title="设置" desc="主题 · 字号 · 数据 · 关于 · 许可">
        <div class="stack stack-pair">
            <AppearanceSection />
            <DataSection />
            <AboutSection />
            <LicenseSection />
        </div>
    </PageShell>
</template>
