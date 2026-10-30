<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppRail from './components/AppRail.vue';
import TitleBar from './components/TitleBar.vue';
import { NAV_BY_KEY, NAV_ITEMS } from './navigation';

/**
 * 外壳：自绘标题栏 + 左栏 + 路由出口。
 *
 * 这一层只管三件事：导航数据给谁、当前是哪一页、点击后往哪跳。
 * 页面本身由 `RouterView` 决定——加页面不再需要改这里的模板。
 *
 * `AppRail` 仍然是纯组件（收 props、发事件），路由这一层留在外壳里：
 * 组件一旦自己 `useRoute()`，就没法在别的上下文里复用，也没法单独渲染做视觉验收。
 */
const route = useRoute();
const router = useRouter();

/** 当前页的 key。路由名就是导航 key，所以直接取 `route.name`。 */
const current = computed(() => String(route.name ?? ''));

function go(key: string) {
    const item = NAV_BY_KEY.get(key);
    if (item) void router.push(item.path);
}
</script>

<template>
    <div class="app-root">
        <TitleBar />
        <div class="shell">
            <AppRail :items="NAV_ITEMS" :current="current" @update:current="go" />

            <main class="app">
                <RouterView />
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

/* 右栏。滚动不放在这一层：内容是自己在 `.page-content` 里滚的，
 * 这样页头（flex: none）钉在顶部，不会随内容一起走。 */
.app {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
}
</style>
