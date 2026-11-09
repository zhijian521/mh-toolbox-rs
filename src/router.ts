import { createRouter, createWebHashHistory } from 'vue-router';
import { DEFAULT_PATH, NAV_ITEMS } from './navigation';
import { TOOLS, type ToolPage } from './tools';
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
 * **工具的子页是第二层**：`/tools` 是目录，`/tools/<key>` 是具体某件工具。
 * 它们不进 `NAV_ITEMS`——左栏是八档的槽，工具越加越多，一件一格会把槽撑成一列。
 * 子页带 `meta.nav: 'tools'`，左栏的朱印据此仍停在「工具」上，
 * 否则进详情页就成了「无选中」，看起来像走丢了。
 *
 * `/dev` 是**例外**：它刻意不进 `NAV_ITEMS`（左栏是给用户的目录，不该有开发者入口），
 * 所以在这里单独挂一条，入口是左栏牌记的三连击。它没有 `ready: false` 的含义，
 * 就是一张真页面，只是不给按钮。
 */
export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: DEFAULT_PATH },
        // 装备并入角色后，旧地址仍要能到达。落到下面的兜底重定向也「不会 404」，
        // 但那会把用户送回设置页，读起来像「这一页没了」；显式指过去才是「换了个地方」。
        { path: '/equipment', redirect: '/characters' },
        ...NAV_ITEMS.map((item) => ({
            path: item.path,
            name: item.key,
            component: item.view ?? PlaceholderView,
            meta: { title: item.label, ready: item.view !== null },
        })),
        /* 只取站内页：`kind: 'link'` 的工具（维护公告）没有地址也没有组件，
         * 点下去是系统浏览器。**不能**用 `tool.path!` 硬塞——那会生成一条
         * `component: undefined` 的路由，跑起来是白屏。 */
        ...TOOLS.filter((tool): tool is ToolPage => tool.kind === 'page').map((tool) => ({
            path: tool.path,
            name: `tool-${tool.key}`,
            component: tool.view,
            meta: { title: tool.name, ready: tool.ready, nav: 'tools' },
        })),
        {
            path: '/dev',
            name: 'dev-kit',
            /* 懒加载：开发帮助是一整套验收页（原子 / 图标 / 调色 / 字号 / 牌记，约一千五百行），
             * 用户平时不会进来。静态 import 会让它压在第一屏包里，而它连入口都是三连击。
             * 显式取 `.default`：`RouteComponent` 联合类型不认模块命名空间对象，
             * 少这一层就要在 `component` 上加断言。 */
            component: () => import('./views/dev/DevKitView.vue').then((page) => page.default),
            meta: { title: '开发帮助', ready: true, hidden: true },
        },
        // 未知路径回默认页，不留白屏。
        { path: '/:pathMatch(.*)*', redirect: DEFAULT_PATH },
    ],
});
