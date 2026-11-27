import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteComponent } from 'vue-router';
import LiquidApp from './LiquidApp.vue';
import { startLiquidTiming } from './liquid-timing';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import { TOOLS, type ToolPage } from './tools';
import { askConfirm } from './composables/use-confirm';
import { importLegacyOnStartup } from './services/legacy-startup';
import { confirmDiscardDrafts } from './composables/use-draft-guard';
import { guardWindowClose } from './services/desktop';
import { loadGameData } from './services/game-data';
import { flushPendingWrites } from './services/persist';
import './styles/rounded-font.css';
import './styles/token-typography.css';
import './styles/blocks.css';
import './styles/character-fields.css';
import './styles/reduced-motion.css';
import './components/liquid-glass/style.css';
import './components/liquid-glass/ledger.css';

const items = NAV_ITEMS.map(({ key, path, label, icon }) => ({ key, path, label, icon }));

const blankPage = { render: () => null };
const views = new Map<string, () => Promise<RouteComponent>>([
    [
        'accounts',
        () => import('./views/accounts/LiquidAccountsView.vue').then((page) => page.default),
    ],
    [
        'characters',
        () => import('./views/characters/LiquidCharactersView.vue').then((page) => page.default),
    ],
    ['goals', () => import('./views/goals/LiquidGoalsView.vue').then((page) => page.default)],
    ['income', () => import('./views/income/LiquidIncomeView.vue').then((page) => page.default)],
    [
        'overview',
        () => import('./views/overview/LiquidOverviewView.vue').then((page) => page.default),
    ],
    ['prices', () => import('./views/prices/LiquidPricesView.vue').then((page) => page.default)],
    ['components', () => import('./views/LiquidComponentsView.vue').then((page) => page.default)],
    ['settings', () => import('./views/LiquidSettingsView.vue').then((page) => page.default)],
]);
function timedRoute(name: string, load: () => Promise<RouteComponent>) {
    if (!import.meta.env.DEV) return load;
    return async () => {
        const endTiming = startLiquidTiming('路由模块', name);
        try {
            return await load();
        } finally {
            endTiming?.();
        }
    };
}

function resolveView(name: string) {
    const load = views.get(name);
    return load ? timedRoute(name, load) : blankPage;
}

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: DEFAULT_PATH },
        ...items
            .filter(({ key }) => key !== 'tools')
            .map(({ key, path }) => ({
                path,
                name: key,
                component: resolveView(key),
                meta: { hideScrollbar: key !== 'settings' },
            })),
        {
            path: '/tools',
            component: timedRoute('tool-shell', () =>
                import('./views/tools/LiquidToolsView.vue').then((page) => page.default),
            ),
            children: [
                {
                    path: '',
                    name: 'tools',
                    meta: { hideScrollbar: true },
                    component: timedRoute('tools', () =>
                        import('./views/ToolsView.vue').then((page) => page.default),
                    ),
                },
                ...TOOLS.filter((tool): tool is ToolPage => tool.kind === 'page').map((tool) => ({
                    path: tool.path,
                    name: `tool-${tool.key}`,
                    component: timedRoute('tool-' + tool.key, tool.view),
                    meta: { title: tool.name, nav: 'tools', dock: 'tools', hideScrollbar: true },
                })),
            ],
        },
        // 组件目录是开发用隐藏页：不进 Dock、不进 NAV_ITEMS，只留一条地址给设置项的彩蛋跳转。
        {
            path: '/components',
            name: 'components',
            meta: { dock: 'settings', hideScrollbar: true },
            component: resolveView('components'),
        },
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});

// 外壳可以先绘制。业务页进入前等待旧账检测和游戏规则，直达工具时也能读到活动。
const startup = importLegacyOnStartup();
const gameRules = loadGameData();
router.beforeEach(async () => {
    await Promise.all([startup, gameRules]);
});
router.beforeEach((to, from) => to.path === from.path || confirmDiscardDrafts());
createApp(LiquidApp, { items }).use(router).mount('#app');
void startup.then(async (notice) => {
    if (!notice) return;
    await router.isReady();
    void askConfirm({ ...notice, confirmText: '知道了', cancelText: '' });
});
void guardWindowClose(async () => {
    if (!(await confirmDiscardDrafts())) return false;
    await startup;
    const { flushLiquidDailySync } = await import('./liquid-ledger-data');
    const synced = await flushLiquidDailySync();
    const saved = await flushPendingWrites();
    if (synced && saved) return true;
    return window.confirm('仍有改动未保存，确定退出吗？');
});
