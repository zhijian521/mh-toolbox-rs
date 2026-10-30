<script setup lang="ts">
import { ref } from 'vue';
import SealMark from './components/SealMark.vue';
import SettingsView from './views/SettingsView.vue';

/**
 * 外壳：左边一条书脊式导航，右边是当前页面。
 *
 * 现阶段只有设置页是真的，其余七页先占位并置灰——导航顺序按最终形态排好，
 * 后面加页面时只改 `pages` 与 `views` 两处，不动样式。
 */
const pages = [
    { key: 'overview', label: '总览', icon: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z' },
    {
        key: 'income',
        label: '收益',
        icon: 'M8 14A6 6 0 108 2a6 6 0 000 12zM8 4.6v6.8M6 7h4M6 9.4h4',
    },
    { key: 'equipment', label: '装备', icon: 'M2.5 13.5 12 4M10.2 2.2l3.6 3.6M3.4 11.4l1.2 1.2' },
    { key: 'prices', label: '物价', icon: 'M2 8V2.6h5.4L14 9.2 8.8 14.4 2 8zM4.8 4.8h.01' },
    {
        key: 'characters',
        label: '角色',
        icon: 'M8 7.6a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6zM2 14c0-2.9 2.7-4.4 6-4.4s6 1.5 6 4.4',
    },
    { key: 'accounts', label: '账号', icon: 'M13.5 4.5V3H2.5v10h11v-1.5M8 5.5h6v5H8z' },
    { key: 'goals', label: '目标', icon: 'M3 14V2M3 2.8h9.4l-2 3.2 2 3.2H3' },
    { key: 'settings', label: '设置', icon: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14' },
];

/** 唯一实现的页面；其余点了不跳转，用 title 说明原因。 */
const current = ref('settings');
</script>

<template>
    <div class="shell">
        <nav class="rail">
            <div class="brand">
                <SealMark text="梦" />
                <span class="brand-text">
                    <span class="brand-name">梦幻养老助手</span>
                    <span class="brand-sub">RUST · V0.1</span>
                </span>
            </div>
            <div class="rail-nav">
                <button
                    v-for="page in pages"
                    :key="page.key"
                    type="button"
                    class="rail-item"
                    :class="{ on: current === page.key, pending: current !== page.key && page.key !== 'settings' }"
                    :title="page.key === 'settings' ? page.label : page.label + '（未实现）'"
                    @click="current = page.key"
                >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                        <path :d="page.icon" />
                    </svg>
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
            <div v-else class="placeholder">
                <p>「{{ pages.find((page) => page.key === current)?.label }}」还没开始。</p>
                <p class="hint">当前阶段只做设置页，先把设计语言落到真实组件上。</p>
                <button class="btn" type="button" @click="current = 'settings'">回到设置</button>
            </div>
        </main>
    </div>
</template>

<style scoped>
.shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
}

/* ---------- 书脊式导航 ---------- */
.rail {
    display: flex;
    flex: none;
    flex-direction: column;
    width: 158px;
    padding: 14px 12px 12px;
    border-right: var(--w-hair) solid var(--rule);
    background: var(--paper);
}
.brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px 13px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.brand-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.brand-name {
    color: var(--ink);
    font-size: 13.5px;
    line-height: 1.3;
    white-space: nowrap;
}
.brand-sub {
    color: var(--muted);
    font-family: var(--font-hei);
    font-size: var(--fs-mini);
    letter-spacing: 0.16em;
}
.rail-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-top: 10px;
}
/* 选中用「朱红细条压边 + 纸色」，不铺色块：导航是一排位置，不是一组挑选动作。 */
.rail-item {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 31px;
    padding: 0 8px;
    border: 0;
    border-left: 2px solid transparent;
    background: none;
    color: var(--muted);
    font-size: 13px;
    text-align: left;
    transition:
        color var(--t-quick) var(--ease-soft),
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
.rail-item svg {
    width: 14px;
    height: 14px;
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
.rail-item.on svg {
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
    font-family: var(--font-hei);
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
