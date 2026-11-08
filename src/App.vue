<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlarmHost from './components/AlarmHost.vue';
import AppRail from './components/AppRail.vue';
import ConfirmHost from './components/ConfirmHost.vue';
import HoverTip from './components/HoverTip.vue';
import NotifyHost from './components/NotifyHost.vue';
import TitleBar from './components/TitleBar.vue';
import { NAV_BY_KEY, NAV_ITEMS } from './navigation';

/**
 * 外壳：自绘标题栏 + 左栏 + 路由出口。
 *
 * 这一层只管三件事：导航数据给谁、当前是哪一页、点击后往哪跳。
 * 页面本身由 `RouterView` 决定——加页面不再需要改这里的模板。
 *
 * 另外挂四个全站唯一的宿主：`ConfirmHost`（问一句，等回答）、`NotifyHost`（说一句，不等）、
 * `HoverTip`（悬停说明）、`AlarmHost`（闹钟计时与提醒）。它们都渲染在 `Teleport` 到 body
 * 的浮层里，与页面布局无关；放这一层是因为**它们必须只有一个**——放进页面就会各页一个，
 * 迟早各自变形。闹钟还多一条理由：它要在每一页都跑，挂在自己的页面上，用户切走那一刻就没人计时了。
 * 页面拿到的只有 `askConfirm()`、`notify` 与普通的 `title` 属性。
 *
 * `AppRail` 仍然是纯组件（收 props、发事件），路由这一层留在外壳里：
 * 组件一旦自己 `useRoute()`，就没法在别的上下文里复用，也没法单独渲染做视觉验收。
 */
const route = useRoute();
const router = useRouter();

/** 当前页的 key。路由名就是导航 key，所以直接取 `route.name`。
 * 子页（如 `tool-ghost`）不在导航里，退到 `meta.nav` 找它的父级——
 * 否则进工具详情页左栏就成了「无选中」，看起来像走丢了。
 * 开发页（`dev-kit`）两条都取不到，给空串，槽按「无选中」处理
 * （见 `VerticalSlider` 的 `hasActive`），否则那枚朱印会停在「总览」上误导人。 */
const current = computed(() => {
    const name = String(route.name ?? '');
    if (NAV_BY_KEY.has(name)) return name;
    const parent = route.meta.nav;
    return typeof parent === 'string' && NAV_BY_KEY.has(parent) ? parent : '';
});

function go(key: string) {
    const item = NAV_BY_KEY.get(key);
    if (item) void router.push(item.path);
}

/** 隐藏入口：三连击左栏牌记。放在外壳里，栏只负责发事件。 */
function openDevKit() {
    void router.push('/dev');
}
</script>

<template>
    <div class="app-root">
        <TitleBar />
        <div class="shell">
            <AppRail
                :items="NAV_ITEMS"
                :current="current"
                @update:current="go"
                @request-dev="openDevKit"
            />

            <main class="app">
                <RouterView />
            </main>
        </div>

        <!-- 全站唯一的三个浮层宿主。它们在 `Teleport` 里，放在外壳哪一层都行；
             写在这里是为了让「只有一个」这件事在代码里看得见。 -->
        <ConfirmHost />
        <NotifyHost />
        <!-- 闹钟的计时与提醒。挂在这一层是因为它必须在**每一页**都跑：
             闹钟挂在自己的页面上，用户切去收益页的那一分钟就没人计时了。 -->
        <AlarmHost />
        <!-- 悬停说明：接管全站 `title`，换成纸片（原生那枚系统白框 CSS 碰不到）。 -->
        <HoverTip />
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
