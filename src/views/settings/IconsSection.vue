<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { ICON_GROUPS, ICON_LABELS } from '../../components/icons';

/**
 * 图标清单。
 *
 * 不堆卡片格子——图标清单本质是一张目录：一行一条记录，靠账线分隔、靠留白呼吸。
 * 二十多个描边方框堆在一起是最典型的模板感，也正是这套语言要避开的。
 */
</script>

<template>
    <LedgerSection title="图标" seal="图" hint="成套线稿 · 24 网格 · 笔宽 1.8 · 随字号缩放">
        <div class="icon-sheet">
            <div v-for="group in ICON_GROUPS" :key="group.label" class="icon-group">
                <div class="icon-group-head">
                    <span class="icon-group-label">{{ group.label }}</span>
                    <span class="icon-group-note">{{ group.note }}</span>
                    <span class="icon-group-count">{{ group.names.length }}</span>
                </div>
                <div class="icon-list">
                    <div v-for="name in group.names" :key="name" class="icon-item">
                        <AppIcon :name="name" />
                        <b>{{ ICON_LABELS[name] }}</b>
                        <code>{{ name }}</code>
                    </div>
                </div>
            </div>
        </div>

        <p class="note">
            图标来自成套库（tabler），我们只维护「业务名 → 图标」的映射。早先那套是手画的 16 格
            path，问题不在能不能画对，而在一致性——28 个图标一次画完，圆角、边长比例、留白各走各的，
            放大看就参差，加一个新图标还得重新对齐一次。
        </p>
        <p class="note">
            尺寸只有一个入口：<code>--icon-size</code>，默认
            <code>calc(14px * var(--fs-scale))</code>，调大字号图标一起长。按钮里是 13（紧凑档
            12）、清单里放大到 18 只为看清形状、标题栏三个窗口键 13——都是父级改同一个变量，
            组件不认「这是哪个位置的图标」。
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
.icon-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
}
.icon-item {
    --icon-size: calc(18px * var(--fs-scale));

    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 8px 7px 2px;
    border-bottom: var(--w-hair) solid var(--rule);
    color: var(--ink-2);
    font-size: var(--fs-xs);
}
.icon-item b {
    flex: none;
    color: var(--ink);
    font-weight: normal;
    letter-spacing: 0.04em;
}
.icon-item code {
    min-width: 0;
    margin-left: 6px;
    overflow: hidden;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.7;
}
.icon-item:hover code {
    opacity: 1;
}
</style>
