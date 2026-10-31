<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import AboutSection from './settings/AboutSection.vue';
import AppearanceSection from './settings/AppearanceSection.vue';
import AtomsSection from './settings/AtomsSection.vue';
import IconsSection from './settings/IconsSection.vue';
import PaletteSection from './settings/PaletteSection.vue';
import TypeScaleSection from './settings/TypeScaleSection.vue';

/**
 * 设置页只做一件事：把六块按顺序排起来。
 *
 * 这一页原先 667 行、一个文件装下全部内容和样式——主题只改一行也要在六百行里找准位置，
 * 改字号阶梯的间距会碰到色板的样式。拆开之后每块自己带数据、自己带样式，
 * 加一块就是加一行，删一块就是删一行。
 *
 * 顺序有讲究：先是**能操作**的（外观），再是**被抽出来复用的**（原子组件），
 * 然后是**只能看不能改的规范**（色板、字号、图标），最后是关于。
 * 把可操作的放在最上面，是因为这一页现在唯一的真实功能就是换主题与字号。
 *
 * 「控件」那块已删：它演示的按钮、胶囊、开关、勾选、金额，在组件拆分完成后各有其主
 * （`SlotButton` / `SegmentedPills` / `CostSwitch` / `BaseCheck`），而「原子组件」
 * 摆出来的就是这四个真组件。同一件事留两处演示，改一处就得记得改另一处。
 *
 * 「结构」那块也已删：它演示的文武线与账线现在**每个区块自己就是实例**——六张卡
 * 全是 `.frame`，一眼能看出结构，不需要再拿一张卡去讲同一件事。等业务页真有几条
 * 记录的列表时，账线的样子再回到这里。
 */
</script>

<template>
    <PageHeader title="设置" desc="主题 · 组件预览 · 关于">
        <span class="hint">设计样张见 design/income.html</span>
    </PageHeader>

    <div class="page-content">
        <div class="stack">
            <AppearanceSection />
            <AtomsSection />
            <PaletteSection />
            <TypeScaleSection />
            <IconsSection />
            <AboutSection />
        </div>
    </div>
</template>

<style scoped>
/* 区块之间 14px：比区块内的 12px 行距略大，一眼能分出「块」与「行」；再大就散了。 */
.stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1240px;
}
</style>
