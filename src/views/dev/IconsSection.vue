<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { ICON_GROUPS, ICON_LABELS } from '../../components/icons';

/**
 * 图标清单。
 *
 * ---- 只画图标，名字走悬停（2026-11-06）----
 * 上一版一条一行：图标 + 中文名 + 代码名，四列排开。四十多枚铺完是十一行、五百多像素，
 * 而读者来这张卡几乎只做一件事——**用眼睛找形状**，不是找名字。
 * 名字是找到之后才需要的确认，所以它让位给悬停：格子上写 `title`，
 * 全站的 `HoverTip` 会接管（`composables/use-hover-tip.ts`），鼠标停 320ms 弹出「中文名 · 代码名」。
 *
 * 这样做的另一个好处是**一格一图对齐了网格**：字长短不一（「仓库」对「最小化」），
 * 上一版每列的名字宽度都不同，竖着看是一排参差的字，不是一张图标表。
 *
 * ---- 为什么不用「格子 + 描边」----
 * 二十多个描边方框堆在一起是最典型的模板感，也正是这套语言要避开的。
 * 格子只在悬停时浮出一层底——那不是「可点」的暗示，只是告诉你现在停在哪一格。
 */
</script>

<template>
    <LedgerSection title="图标" hint="成套线稿 · 24 网格 · 笔宽 1.8 · 悬停看名字" max-height="60vh">
        <div v-for="group in ICON_GROUPS" :key="group.label" class="icon-group">
            <div class="icon-group-head">
                <span class="icon-group-label">{{ group.label }}</span>
                <span class="icon-group-note">{{ group.note }}</span>
                <span class="icon-group-count">{{ group.names.length }}</span>
            </div>
            <div class="icon-list">
                <!-- `title` 是这里唯一的数据出口：全站悬停说明会把它从 DOM 上挪走再画一张纸片，
                     所以写全名不会有原生那个系统小白框。 -->
                <div
                    v-for="name in group.names"
                    :key="name"
                    class="icon-item"
                    :title="`${ICON_LABELS[name]} · ${name}`"
                >
                    <AppIcon :name="name" />
                </div>
            </div>
        </div>

        <p class="note">
            tabler 成套库，只维护「业务名 → 图标」的映射。尺寸只有一个入口
            <code>--icon-size</code>，由父级改，组件不认自己在哪；这里放大到 20 只为看清形状。
        </p>
    </LedgerSection>
</template>

<style scoped>
.icon-group {
    padding-top: 14px;
}
.icon-group-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-bottom: 5px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.icon-group-label {
    color: var(--ink);
    font-size: var(--fs-sm);
    letter-spacing: 0.1em;
}
.icon-group-note {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.icon-group-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
/* `auto-fill` + 36：窗口宽时一行排得多，窄了自动折行，不做断点。
 * 36 是「20 的图标 + 上下各 8」——再挤会让相邻两枚读成一组。 */
.icon-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 2px;
    padding-top: 6px;
}
.icon-item {
    --icon-size: calc(20px * var(--fs-scale));

    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(34px * var(--fs-scale));
    border-radius: var(--r-1);
    color: var(--ink-2);
    transition:
        background-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}
/* 中性墨底，不用朱：这里没有「选中」这回事，朱会把它读成一个可以按的格子。 */
.icon-item:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
}
</style>
