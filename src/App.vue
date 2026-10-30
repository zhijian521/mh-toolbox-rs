<script setup lang="ts">
import { computed, ref } from 'vue';
import AppRail, { type RailPage } from './components/AppRail.vue';
import PageHeader from './components/PageHeader.vue';
import TitleBar from './components/TitleBar.vue';
import SettingsView from './views/SettingsView.vue';

/**
 * 外壳：自绘标题栏 + 左栏 + 当前页面。
 *
 * 左栏整个交给 `AppRail`——导航、折叠、主题快捷切换都在里面，这一层只管
 * 「哪一页」和右栏的排布。加页面时改 `pages` 与下面那个 `v-if` 分支即可。
 */
const pages: RailPage[] = [
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
            <AppRail v-model:current="current" :pages="pages" />

            <main class="app">
                <SettingsView v-if="current === 'settings'" />
                <template v-else>
                    <PageHeader :title="currentLabel" desc="这一页还没开始">
                        <span class="hint">当前阶段只做设置页</span>
                    </PageHeader>
                    <div class="page-content">
                        <div class="placeholder">
                            <p>「{{ currentLabel }}」还没开始。</p>
                            <p class="hint">先把设计语言落到真实组件上，再按页推进。</p>
                            <button class="btn" type="button" @click="current = 'settings'">
                                回到设置
                            </button>
                        </div>
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

/* ---------- 右栏 ---------- */
.app {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    /* 滚动不放在这一层：内容是自己在 `.page-content` 里滚的，
       这样页头（flex: none）钉在顶部，不会随内容一起走。 */
    overflow: hidden;
}
.placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--muted);
}
</style>
