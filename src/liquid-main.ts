import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteComponent } from 'vue-router';
import LiquidApp from './LiquidApp.vue';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import { guardWindowClose } from './services/desktop';
import { flushPendingWrites } from './services/persist';
import './styles/rounded-font.css';
import './styles/token-typography.css';
import './components/liquid-glass/style.css';

const components = { key: 'components', path: '/components', label: '组件', icon: 'grid' } as const;
const items = NAV_ITEMS.flatMap(({ key, path, label, icon }) => {
    const item = { key, path, label, icon };
    return key === 'settings' ? [components, item] : [item];
});

const blankPage = { render: () => null };
const views = new Map<string, () => Promise<RouteComponent>>([
    ['prices', () => import('./views/prices/LiquidPricesView.vue').then((page) => page.default)],
    ['components', () => import('./views/LiquidComponentsView.vue').then((page) => page.default)],
    ['settings', () => import('./views/LiquidSettingsView.vue').then((page) => page.default)],
]);
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: DEFAULT_PATH },
        ...items.map(({ key, path }) => ({
            path,
            name: key,
            component: views.get(key) ?? blankPage,
        })),
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});

createApp(LiquidApp, { items }).use(router).mount('#app');
void guardWindowClose(async () => {
    await flushPendingWrites();
    return true;
});
