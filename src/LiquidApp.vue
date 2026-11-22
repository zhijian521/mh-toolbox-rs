<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppIcon from './components/AppIcon.vue';
import TitleBar from './components/TitleBar.vue';
import { GlassTab, GlassTabBar } from './components/liquid-glass';
import { useLiquidPreferences } from './composables/use-liquid-preferences';
import type { NavItem } from './navigation';
import { hasDesktop } from './services/desktop';

const props = defineProps<{ items: readonly Pick<NavItem, 'key' | 'label' | 'icon'>[] }>();
const route = useRoute();
const router = useRouter();
const dockPage = computed({
    get: () => (typeof route.name === 'string' ? route.name : props.items[0]?.key),
    set: (name: string) => {
        void router.push({ name });
    },
});

const desktop = hasDesktop();
const { appearance, wallpaper, activeImage } = useLiquidPreferences();
</script>

<template>
    <div
        class="liquid-app"
        :data-appearance="appearance"
        :class="{ 'has-online-wallpaper': activeImage }"
        :style="{ '--liquid-wallpaper': `url(${wallpaper})` }"
    >
        <TitleBar v-if="desktop" />
        <header v-else class="liquid-header">梦幻养老助手</header>
        <main class="liquid-content" aria-label="应用内容">
            <RouterView v-slot="{ Component, route }">
                <component :is="Component" :key="route.name" />
            </RouterView>
        </main>
        <nav class="liquid-dock" aria-label="底部导航">
            <GlassTabBar v-model:value="dockPage" class="liquid-dock-bar" aria-label="页面">
                <GlassTab v-for="item in items" :key="item.key" :value="item.key">
                    <AppIcon :name="item.icon" />
                    {{ item.label }}
                </GlassTab>
            </GlassTabBar>
        </nav>
    </div>
</template>

<style>
body {
    margin: 0;
}

.liquid-app {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    color-scheme: light;
    --lg-appearance: light;
    timeline-scope: --dock-scroll;
    --lg-accent: light-dark(#276455, #b3e8c6);
    --lg-selected-text: light-dark(#17352d, #efffec);
    --liquid-ink: light-dark(#212b29, #ecf2ef);
    --liquid-focus: light-dark(#276455, #b3e8c6);
    --liquid-outline: light-dark(#344b3e30, #d1eee32b);
    --liquid-column-width: min(496px, calc(100% - 24px));
    --liquid-dock-clearance: 88px;
    color: var(--liquid-ink);
    background: var(--liquid-wallpaper) center / cover no-repeat;
    background-color: light-dark(#e8eee9, #14211f);
    --font-ui: var(--font-rounded);
    font: var(--fs-base) / 1.5 var(--font-ui);
}

.has-online-wallpaper :where(.liquid-header, .liquid-content h1) {
    text-shadow: 0 1px 2px light-dark(rgb(255 255 255 / 0.8), rgb(0 0 0 / 0.75));
}

.liquid-app[data-appearance='dark'] {
    color-scheme: dark;
    --lg-appearance: dark;
}

.liquid-app *,
.liquid-app *::before,
.liquid-app *::after {
    box-sizing: border-box;
}

.liquid-app :where(h1, h2, h3, h4) {
    font-weight: 400;
}

.liquid-app :where(h1, h2) {
    font-size: var(--fs-md);
    line-height: 1.25;
}

.liquid-app :where(h3, h4) {
    font-size: var(--fs-base);
}

.liquid-app :where(small) {
    font-size: var(--fs-xs);
}

.liquid-app > .titlebar {
    --ink: var(--liquid-ink);
    --muted: var(--liquid-ink);
    --rule: var(--liquid-outline);
    --paper: light-dark(#ffffff55, #00000026);
    --paper-2: light-dark(#151f1514, #ffffff21);
    --well: var(--paper-2);
    --seal: #b52935;
    --on-seal: #fff;
    --w-hair: 1px;
    --t-quick: 140ms;
    --ease-soft: ease-out;
}

.liquid-header {
    flex: none;
    padding: 14px clamp(14px, 4vw, 48px) 6px;
    font-size: var(--fs-sm);
}

.liquid-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding-bottom: var(--liquid-dock-clearance);
    scroll-timeline: --dock-scroll block;
}

.liquid-content:has(> .component-catalog) {
    padding-bottom: 0;
    scroll-timeline-name: none;
}

.liquid-app::after {
    position: fixed;
    z-index: 2;
    inset: auto 0 0;
    height: var(--liquid-dock-clearance);
    background: linear-gradient(transparent, light-dark(#dce9e4cc, #182c30d9));
    opacity: 0;
    pointer-events: none;
    content: '';
}

/* 留白进入视口后收起渐隐，短页面的滚动时间线不激活。 */
@supports (animation-timeline: scroll()) {
    .liquid-app::after {
        animation: dock-edge-fade auto linear both;
        animation-timeline: --dock-scroll;
        animation-range: calc(100% - var(--liquid-dock-clearance)) 100%;
    }
}

@keyframes dock-edge-fade {
    from { opacity: 1; }
    to { opacity: 0; }
}

.liquid-dock {
    --dock-spacing: max(12px, env(safe-area-inset-bottom));
    position: fixed;
    z-index: 3;
    inset: auto auto var(--dock-spacing) 50%;
    translate: -50% 0;
    width: var(--liquid-column-width);
}

.liquid-dock-bar {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    --glass-tab-selection: light-dark(rgb(250 255 253 / 0.56), rgb(210 239 228 / 0.25));
    --glass-tab-bar-height: 50px;
    --glass-tab-font-size: var(--fs-xs);
    --gl-item-icon: 18px;
    --icon-size: 18px;
    display: flex;
    width: 100%;
}

.liquid-dock-bar .app-icon {
    stroke-width: 1.5;
}

.liquid-app :focus-visible {
    outline: 2px solid var(--liquid-focus);
    outline-offset: 3px;
}
</style>
