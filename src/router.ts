import { createRouter, createWebHashHistory } from 'vue-router';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import DevKitView from './views/dev/DevKitView.vue';
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
 *
 * `/dev` 是**例外**：它刻意不进 `NAV_ITEMS`（左栏是给用户的目录，不该有开发者入口），
 * 所以在这里单独挂一条，入口是左栏牌记的三连击。它没有 `ready: false` 的含义，
 * 就是一张真页面，只是不给按钮。
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
        {
            path: '/dev',
            name: 'dev-kit',
            component: DevKitView,
            meta: { title: '开发帮助', ready: true, hidden: true },
        },
        // 未知路径回默认页，不留白屏。
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});
