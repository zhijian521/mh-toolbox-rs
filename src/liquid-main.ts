import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteComponent } from 'vue-router';
import LiquidApp from './LiquidApp.vue';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import { askConfirm } from './composables/use-confirm';
import { importLegacyOnStartup } from './services/legacy-startup';
import { confirmDiscardDrafts } from './composables/use-draft-guard';
import { guardWindowClose } from './services/desktop';
import { flushPendingWrites } from './services/persist';
import './styles/rounded-font.css';
import './styles/token-typography.css';
import './components/liquid-glass/style.css';

const items = NAV_ITEMS.map(({ key, path, label, icon }) => ({ key, path, label, icon }));

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
        // 组件目录是开发用隐藏页：不进 Dock、不进 NAV_ITEMS，只留一条地址给设置项的彩蛋跳转。
        { path: '/components', name: 'components', component: views.get('components') ?? blankPage },
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});

// 先绘制外壳；自动导入完成前不加载业务路由，直接打开 #/prices 也不能抢先写入。
const startup = importLegacyOnStartup();
router.beforeEach(async () => {
    await startup;
});
createApp(LiquidApp, { items }).use(router).mount('#app');
void startup.then(async (notice) => {
    if (!notice) return;
    await router.isReady();
    void askConfirm({ ...notice, confirmText: '知道了', cancelText: '' });
});
void guardWindowClose(async () => {
    if (!(await confirmDiscardDrafts())) return false;
    await startup;
    if (await flushPendingWrites()) return true;
    return window.confirm('仍有改动未保存，确定退出吗？取消后可在物价页重试保存。');
});
