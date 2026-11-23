<script setup lang="ts">
import { updateAppearance } from 'glassy-liquid';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { loadRouteLocation, RouterView, useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import AlarmHost from './components/AlarmHost.vue';
import AppIcon from './components/AppIcon.vue';
import TitleBar from './components/TitleBar.vue';
import NotifyHost from './components/NotifyHost.vue';
import GlassConfirmHost from './components/liquid-glass/GlassConfirmHost.vue';
import { GlassCard, GlassTab, GlassTabBar } from './components/liquid-glass';
import { useLiquidPreferences } from './composables/use-liquid-preferences';
import type { NavItem } from './navigation';
import { hasDesktop } from './services/desktop';

const props = defineProps<{ items: readonly Pick<NavItem, 'key' | 'label' | 'icon'>[] }>();
const route = useRoute();
const router = useRouter();
const content = ref<HTMLElement | null>(null);
const pageEntry = ref<'tool-in' | 'tool-back'>();
const dockEntry = ref<'left' | 'right'>();
const deferDockView = ref(false);
const dockTiming = { duration: 280, easing: 'cubic-bezier(0.32, 0, 0.18, 1)' };
const dockAnimations = new Set<Animation>();
let dockSteps = 0;
const warmingPages = new Set<string>();
let dragListeners: AbortController | undefined;
onBeforeUnmount(() => {
    dragListeners?.abort();
    removeDockGuard();
    for (const animation of dockAnimations) animation.cancel();
    dockRequest = undefined;
});
let dockRequest: { name: string; from: RouteLocationNormalizedLoaded } | undefined;
let toolDirectoryScrollTop = 0;

watch(router.currentRoute, (to, from, onCleanup) => {
    deferDockView.value = false;
    if (to.name === from.name) return;

    // 快捷入口、后退等外部导航可打断 Dock 交接。
    for (const animation of dockAnimations) animation.finish();
    dockEntry.value = undefined;
    if (dockRequest?.name === to.name && dockRequest?.from === from && !to.query.action) {
        const previous = props.items.findIndex(({ key }) => key === dockKey(from));
        const next = props.items.findIndex(({ key }) => key === to.name);
        if (previous >= 0 && next >= 0 && next !== previous) {
            dockSteps = next - previous;
            dockEntry.value = dockSteps < 0 ? 'left' : 'right';
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                // 先绘制切页首帧，玻璃卡片的同步挂载留到下一任务。
                deferDockView.value = true;
                let mountTask: number | undefined;
                const frame = requestAnimationFrame(() => {
                    mountTask = window.setTimeout(() => {
                        deferDockView.value = false;
                    }, 0);
                });
                onCleanup(() => {
                    cancelAnimationFrame(frame);
                    window.clearTimeout(mountTask);
                });
            }
        }
    }

    const enteringTool = from.name === 'tools' && to.meta.nav === 'tools';
    const returningToDirectory = from.meta.nav === 'tools' && to.name === 'tools';
    if (enteringTool) toolDirectoryScrollTop = content.value?.scrollTop ?? 0;
    if (to.name !== 'tools' && to.meta.nav !== 'tools') toolDirectoryScrollTop = 0;
    if (returningToDirectory) {
        const top = toolDirectoryScrollTop;
        void nextTick(() => {
            if (route.name === 'tools' && content.value) content.value.scrollTop = top;
        });
    }

    // 快捷入口已有弹窗入场，避免页面同时淡入。
    pageEntry.value = undefined;
    if (to.query.action) return;
    if (enteringTool) pageEntry.value = 'tool-in';
    else if (returningToDirectory) pageEntry.value = 'tool-back';
});

const hideContentScrollbar = computed(() => {
    const name = route.name;
    return (
        name === 'overview' ||
        name === 'income' ||
        name === 'accounts' ||
        name === 'characters' ||
        name === 'goals' ||
        name === 'tools' ||
        route.meta.nav === 'tools' ||
        name === 'prices' ||
        name === 'components'
    );
});
const dockControl = ref<{ el: HTMLElement | null }>();
function dockKey(location: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'>) {
    if (location.meta.nav === 'tools') return 'tools';
    if (location.name === 'components') return 'settings';
    return location.name;
}
const dockPage = computed(() => {
    const key = dockKey(route);
    return typeof key === 'string' ? key : props.items[0]?.key;
});

const dockIndex = computed(() => Math.max(0, props.items.findIndex(({ key }) => key === dockPage.value)));

// 拖过标签时保留原生玻璃透镜跟手预览；点击和键盘切换由已确认的路由定位。
function trackDockDrag(event: PointerEvent) {
    const bar = dockControl.value?.el;
    if (!bar || !event.isPrimary || event.button !== 0) return;
    dragListeners?.abort();
    const listeners = new AbortController();
    dragListeners = listeners;
    const options = { signal: listeners.signal };
    const end = (up: PointerEvent) => {
        if (up.pointerId !== event.pointerId) return;
        bar.removeAttribute('data-drag-preview');
        listeners.abort();
    };
    window.addEventListener('pointermove', (move) => {
        if (move.pointerId === event.pointerId && Math.abs(move.clientX - event.clientX) > 6) {
            bar.setAttribute('data-drag-preview', '');
        }
    }, options);
    window.addEventListener('pointerup', end, options);
    window.addEventListener('pointercancel', end, options);
}

// 只预取指向的路由模块。预取失败仍由真正的导航重试。
function warmDockPage(name: string) {
    if (name === dockPage.value || warmingPages.has(name)) return;
    warmingPages.add(name);
    void loadRouteLocation(router.resolve({ name }))
        .catch(() => {})
        .finally(() => warmingPages.delete(name));
}

// 路由解析与上一段收尾并行；已缓存的页面也只需等待短暂的最后几帧。
const removeDockGuard = router.beforeResolve(async (to, from) => {
    if (dockRequest?.name === to.name && dockRequest.from === from && dockAnimations.size) {
        await Promise.allSettled(Array.from(dockAnimations, (motion) => motion.finished));
    }
});

async function navigateDock(name: string) {
    const request = { name, from: router.currentRoute.value };
    dockRequest = request;
    try {
        for (const motion of dockAnimations) motion.updatePlaybackRate(5);
        await router.push({ name });
    } finally {
        // 标签栏即时选中。只有最后一次请求可以用实际路由恢复选中项。
        if (dockRequest === request) {
            dockRequest = undefined;
            if (dockPage.value) dockControl.value?.el?.setAttribute('value', dockPage.value);
        }
    }
}

function slide(target: Element, from: number, to: number, done?: () => void) {
    const animation = target.animate(
        [{ translate: `${from}%` }, { translate: `${to}%` }],
        { ...dockTiming, id: 'liquid-dock-slide', fill: 'backwards' },
    );
    // 同一轮 DOM 更新创建的动画由文档时间线在同一次绘制启动。
    dockAnimations.add(animation);
    const settled = () => {
        dockAnimations.delete(animation);
        done?.();
    };
    void animation.finished.then(settled, settled);
}

function slidePane(el: Element, done: () => void, leaving: boolean) {
    if (
        !dockEntry.value ||
        !el.animate ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        done();
        return;
    }
    const edge = dockEntry.value === 'left' ? -100 : 100;
    if (leaving) {
        // 让弹窗锁滚动等逻辑只找到新页面；旧页留在原位置即刻开始退场。
        el.classList.remove('liquid-content');
        el.setAttribute('inert', '');
    }
    slide(el, leaving ? 0 : edge, leaving ? -edge : 0, done);
    if (!leaving) {
        // 两个公开的 part 与页面在同一次渲染提交中加入文档动画时间线。
        const parts = dockControl.value?.el?.shadowRoot?.querySelectorAll('[part="indicator"], [part="lens"]');
        parts?.forEach((part) => slide(part, -dockSteps * 100, 0));
    }
}

/**
 * 组件目录的隐藏入口：连续 5 次点击 Dock 的「设置」。
 *
 * 标签栏只在 value 真的变化时才发 change，所以「已经在设置页、再点四次设置」
 * 不会经过 v-model——计数只能挂在原生 click 上。捕获阶段先于标签栏自身的
 * click 处理，第五下在这里截断事件，标签栏就不会再把它当成普通的切页。
 */
const HIDDEN_TAPS = 5;
const HIDDEN_TAP_WINDOW = 3000;
let settingsTaps = 0;
let lastSettingsTap = 0;

function dockTabValue(event: MouseEvent): string | null {
    for (const node of event.composedPath()) {
        if (node instanceof HTMLElement && node.localName === 'glass-tab') {
            return node.getAttribute('value');
        }
    }
    return null;
}

function onDockClick(event: MouseEvent) {
    const value = dockTabValue(event);
    // 隐藏页没有对应的 Dock 标签，标签栏不会再为「再点设置」发 change；
    // 这一程由外壳直接接管，保证点任意标签都能回到正式页面。
    if (route.name === 'components') {
        if (!value) return;
        event.stopPropagation();
        void navigateDock(value);
        return;
    }
    if (value !== 'settings') {
        settingsTaps = 0;
        if (value === 'tools' && route.meta.nav === 'tools') {
            event.stopPropagation();
            void navigateDock(value);
        }
        return;
    }
    const now = Date.now();
    settingsTaps = now - lastSettingsTap <= HIDDEN_TAP_WINDOW ? settingsTaps + 1 : 1;
    lastSettingsTap = now;
    if (settingsTaps < HIDDEN_TAPS) return;
    settingsTaps = 0;
    event.stopPropagation();
    void router.push({ name: 'components' });
}

const desktop = hasDesktop();
const { appearance, wallpaper, activeImage } = useLiquidPreferences();
// 玻璃引擎不会监听应用容器，等主题写入 DOM 后通知它重算材质。
watch(appearance, () => updateAppearance(), { flush: 'post' });
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
        <div class="liquid-page-stage">
            <Transition
                :css="false"
                @enter="(el, done) => slidePane(el, done, false)"
                @leave="(el, done) => slidePane(el, done, true)"
            >
                <main
                    :key="route.name"
                    ref="content"
                    :data-dock-entry="dockEntry"
                    :data-page-entry="pageEntry"
                    class="liquid-page-pane liquid-content"
                    :class="{ 'lg-scroll-hidden': hideContentScrollbar }"
                    aria-label="应用内容"
                >
                    <RouterView v-if="route.matched.length && !deferDockView" />
                    <p v-else-if="!route.matched.length" class="liquid-startup-status" role="status">正在打开账本…</p>
                </main>
            </Transition>
        </div>
        <nav class="liquid-dock" aria-label="底部导航" @click.capture="onDockClick">
            <GlassTabBar
                ref="dockControl"
                :value="dockPage"
                :style="{ '--dock-index': dockIndex, '--dock-count': items.length }"
                @pointerdown.capture="trackDockDrag"
                class="liquid-dock-bar"
                aria-label="页面"
                @update:value="navigateDock"
            >
                <GlassTab
                    v-for="item in items"
                    :key="item.key"
                    :value="item.key"
                    @pointerenter="warmDockPage(item.key)"
                    @pointerdown="warmDockPage(item.key)"
                    @focus="warmDockPage(item.key)"
                >
                    <AppIcon :name="item.icon" />
                    {{ item.label }}
                </GlassTab>
            </GlassTabBar>
        </nav>
        <GlassConfirmHost />
        <NotifyHost inline />
        <AlarmHost :glass-card="GlassCard" />
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

.has-online-wallpaper :where(.liquid-header, .liquid-page-pane h1) {
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

.liquid-page-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: clip;
}

.liquid-page-pane {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding-bottom: var(--liquid-dock-clearance);
}

.liquid-content {
    scroll-timeline: --dock-scroll block;
}

.liquid-page-pane[inert] {
    pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
    .liquid-content:is([data-page-entry='tool-in'], [data-page-entry='tool-back']) > .liquid-tools {
        animation: liquid-page-enter 180ms var(--ease-modal-enter, ease-out);
    }

    .liquid-content[data-page-entry='tool-in'] {
        --liquid-page-translate: 12px 0;
    }

    .liquid-content[data-page-entry='tool-back'] {
        --liquid-page-translate: -12px 0;
    }
}

@keyframes liquid-page-enter {
    from {
        opacity: 0.5;
        translate: var(--liquid-page-translate, none);
    }

    to {
        opacity: 1;
        translate: none;
    }
}

.liquid-startup-status {
    margin: 16px;
    color: var(--liquid-muted);
}

.liquid-page-pane:has(> .component-catalog) {
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

/* 保留标签栏原有高光、按压和拖动材质。静止位置来自路由，平移由外壳统一驱动。 */
.liquid-dock-bar::part(indicator),
.liquid-dock-bar:not([data-drag-preview])::part(lens) {
    left: var(--glass-selector-padding, 4px);
    top: var(--glass-selector-padding, 4px);
    width: calc((100% - 2 * var(--glass-selector-padding, 4px)) / var(--dock-count)) !important;
    height: calc(100% - 2 * var(--glass-selector-padding, 4px)) !important;
    transform: translateX(calc(var(--dock-index) * 100%)) !important;
}

.liquid-dock-bar:not([data-drag-preview]) glass-tab::part(content) {
    scale: 1 !important;
}

/* 路由尚在解析时，按下的菜单也立即给出反馈。 */
.liquid-dock-bar:not([data-drag-preview]) glass-tab:active::part(content) {
    opacity: 0.68;
}

.liquid-dock-bar .app-icon {
    stroke-width: 1.5;
}

.liquid-app :focus-visible {
    outline: 2px solid var(--liquid-focus);
    outline-offset: 3px;
}
</style>
