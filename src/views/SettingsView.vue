<script setup lang="ts">
import PageShell from '../components/PageShell.vue';
import AboutSection from './settings/AboutSection.vue';
import AppearanceSection from './settings/AppearanceSection.vue';
import DataSection from './settings/DataSection.vue';

/**
 * 设置页：给用户用的三件事——换纸与字号、账本的进出、版本信息。
 *
 * 这一页原先有六张卡，其中四张（原子组件、色板、字号阶梯、图标）是开发时查的东西，
 * 已经整体搬去 `views/dev/DevKitView.vue`（三连击左上角标进入）。
 * 判据不是「有多少内容」，而是**这一页的读者是谁**：设置页的读者只有用户，
 * 用户在这里要办的事也只有换纸、字号与账本；多一张卡就多一次「这跟我有关系吗」的停顿。
 *
 * 「控件」与「结构」两张演示卡更早就删了：它们演示的组件与线条各有其主，
 * 同一件事留两处演示，改一处就得记得改另一处。
 *
 * 排法是**两列、三张卡**：`.stack-pair` 是 `repeat(auto-fit, minmax(420px, 1fr))`，
 * 1280 窗宽下正好两列——外观与关于占第一行，数据卡落在第二行左列，它右边那一格空着。
 *
 * **那个空格是有意的，不是没排完。** 曾经给数据卡加过 `.wide`（`grid-column: 1 / -1`）
 * 让它通栏，理由是「三行按钮各带一句说明，通栏之后三句都能一行读完」。实拍之后否掉了：
 * 通栏那张宽 1198px，而内容最远只到卡片左边 408px 处，**右侧空出约 790px（66%）**——
 * 一张很长的纸、字全挤在左上角，比「说明折一行」更难看。所以宁可让它在半宽列里
 * （「导入」那条 hint 最多折一行），也不要一张六成是空白的卡。
 * 现在 `DataSection` 上没有任何 class，也不存在为它写的 `grid-column` 规则；
 * 想再试通栏之前，先看 `docs/RECORD.md` 第 87 批里这条被否的方案。
 *
 * 并排这件事本身仍成立：竖排时两张短卡挤在左上角、右边空出一屏，那是「删剩两张」之后
 * 才有的浪费。断点由卡片内容宽度决定（`minmax(420px, 1fr)`），窗口窄了自动退回一列，
 * 不做两套布局——所以这里也没有断点媒体查询。
 */
</script>

<template>
    <PageShell title="设置" desc="主题 · 字号 · 数据 · 关于">
        <div class="stack stack-pair">
            <AppearanceSection />
            <AboutSection />
            <DataSection />
        </div>
    </PageShell>
</template>
