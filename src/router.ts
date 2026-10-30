import { createRouter, createWebHashHistory } from 'vue-router';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import PlaceholderView from './views/PlaceholderView.vue';

/**
 * 路由。
 *
 * 用 hash 模式：Tauri 里页面是从 `tauri://localhost`（发布版）或 `localhost:5173`
 * （开发版）加载的文件，没有服务端做 history fallback。hash 模式不需要任何服务端配置，
 * 刷新也不会 404。
 *
 * 路由表从 `NAV_ITEMS` 生成，不手写第二份。未实现的页面挂 `PlaceholderView`，
 * 标题从 `meta.title` 取——加页面时只改 `navigation.ts`。
 */
export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: DEFAULT_PATH },
        ...NAV_ITEMS.map((item) => ({
            path: item.path,
            name: item.key,
            component: item.view ?? PlaceholderView,
            meta: { title: item.label, ready: item.view !== null },
        })),
        // 未知路径回默认页，不留白屏。
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});
