<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from './components/AppIcon.vue';
import PageHeader from './components/PageHeader.vue';
import TitleBar from './components/TitleBar.vue';
import type { IconName } from './components/icons';
import SettingsView from './views/SettingsView.vue';

/**
 * 外壳：自绘标题栏 + 一条书脊式导航 + 当前页面。
 *
 * 图标名走 `IconName` 联合类型，拼错在编译期就红，不会等到运行时画出一个空 svg。
 *
 * 现阶段只有设置页是真的，其余七页先占位并置灰；加页面时改 `pages` 与下面那个
 * `v-if` 分支即可，样式不用动。
 */
const pages: { key: string; label: string; icon: IconName }[] = [
    { key: 'overview', label: '总览', icon: 'overview' },
    { key: 'income', label: '收益', icon: 'income' },
    { key: 'equipment', label: '装备', icon: 'equipment' },
    { key: 'prices', label: '物价', icon: 'prices' },
    { key: 'characters', label: '角色', icon: 'characters' },
    { key: 'accounts', label: '账号', icon: 'accounts' },
    { key: 'goals', label: '目标', icon: 'goals' },
    { key: 'settings', label: '设置', icon: 'settings' },
];

const current = ref('settings');

/* 占位页也要有页头，否则「页头」就只是设置页的私有排版，谈不上统一。 */
const currentLabel = computed(() => pages.find((page) => page.key === current.value)?.label ?? '');
</script>

<template>
    <div class="app-root">
        <TitleBar />
        <div class="shell">
            <nav class="rail">
                <div class="rail-nav">
                    <button
                        v-for="page in pages"
                        :key="page.key"
                        type="button"
                        class="rail-item"
                        :class="{
                            on: current === page.key,
                            pending: current !== page.key && page.key !== 'settings',
                        }"
                        :title="page.key === 'settings' ? page.label : page.label + '（未实现）'"
                        @click="current = page.key"
                    >
                        <AppIcon :name="page.icon" />
                        {{ page.label }}
                    </button>
                </div>
                <div class="rail-foot">
                    <span>v0.1.0 · 开发中</span>
                    <span>数据在 mh-tool-v2</span>
                </div>
            </nav>

            <main class="app">
                <SettingsView v-if="current === 'settings'" />
                <template v-else>
                    <PageHeader :title="currentLabel" desc="这一页还没开始">
                        <span class="hint">当前阶段只做设置页</span>
                    </PageHeader>
                    <div class="placeholder">
                        <p>「{{ currentLabel }}」还没开始。</p>
                        <p class="hint">先把设计语言落到真实组件上，再按页推进。</p>
                        <button class="btn" type="button" @click="current = 'settings'">
                            回到设置
                        </button>
                    </div>
                </template>
            </main>
        </div>
    </div>
</template>

<style scoped>
.app-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
}
.shell {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

/* ---------- 书脊式导航 ---------- */
.rail {
    display: flex;
    flex: none;
    flex-direction: column;
    /* 宽度跟着字号缩放：左栏是结构件，字大了它不跟着宽，导航文字会被截。 */
    width: calc(158px * var(--fs-scale));
    padding: 10px 12px 12px;
    border-right: var(--w-hair) solid var(--rule);
    background: var(--paper);
}
.rail-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
/* 选中用「朱红细条压边 + 纸色」，不铺色块：导航是一排位置，不是一组挑选动作。 */
.rail-item {
    display: flex;
    align-items: center;
    gap: calc(9px * var(--fs-scale));
    height: calc(31px * var(--fs-scale));
    padding: 0 calc(8px * var(--fs-scale));
    border: 0;
    border-left: 2px solid transparent;
    background: none;
    color: var(--muted);
    font-size: calc(13px * var(--fs-scale));
    text-align: left;
    transition:
        color var(--t-quick) var(--ease-soft),
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
.rail-item:hover {
    color: var(--ink);
    background: var(--paper-2);
}
.rail-item.on {
    border-left-color: var(--cinnabar);
    background: var(--paper-2);
    color: var(--ink);
}
/* 选中时图标转朱红：只有一枚红，不铺满整行。 */
.rail-item.on :deep(.app-icon) {
    color: var(--cinnabar);
}
.rail-item.pending {
    opacity: 0.55;
}
.rail-foot {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: auto;
    padding: 9px 8px 0;
    border-top: var(--w-hair) solid var(--rule);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.02em;
}

/* ---------- 右栏 ---------- */
.app {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    overflow: auto;
    /* 滚动条始终占位：否则内容不满一屏的页面比满屏的页面宽 10px，
       页头右侧的说明文字会在切页时左右跳一下。 */
    scrollbar-gutter: stable;
}
.placeholder {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--muted);
}
</style>
