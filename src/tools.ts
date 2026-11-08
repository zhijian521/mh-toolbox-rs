import type { RouteComponent } from 'vue-router';
import type { IconName } from './components/icons';

/**
 * 工具清单。
 *
 * 单独一个文件而不是塞进 `navigation.ts`：导航是「左栏八档」这个层级的事，
 * 工具是它的下一级。混在一处，加一件工具就要动导航表，读起来像左栏多了一格。
 * 更要紧的是它会引出循环依赖——`ToolsView` 要读这张表，而 `navigation.ts`
 * 要 import `ToolsView`。
 *
 * 这张表同时喂两处：工具列表页的渲染、`router.ts` 的子路由。加一件工具只改这里，
 * 「列表里有、点进去 404」这种错在结构上就不成立。
 */
export interface ToolEntry {
    key: string;
    /** 列表上的名字，也是详情页的标题。 */
    name: string;
    /** 一句话说清它干什么。列表上就显示这一句，不做第二次解释。 */
    desc: string;
    path: string;
    icon: IconName;
    /**
     * 路由目标。写成函数就是**懒加载**：捉鬼那套（截屏、OCR、地图绘制、样张夹具）
     * 约一千五百行，只有真进 `/tools/ghost` 时才需要，不该压在第一屏。
     * 列表页只读上面的 `name` / `icon` / `desc`，不实例化 `view`，所以懒加载不影响渲染。
     */
    view: RouteComponent | (() => Promise<RouteComponent>);
    /** 还没做完的入口画成半透明、不可点，与左栏未实现页的处理一致。 */
    ready: boolean;
}

export const TOOLS: ToolEntry[] = [
    {
        key: 'ghost',
        name: '捉鬼助手',
        desc: '读任务栏里的假坐标，在地图上画出该往哪找',
        path: '/tools/ghost',
        icon: 'pin',
        view: () => import('./views/tools/GhostHuntView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'alarm',
        name: '闹钟',
        desc: '到点前一分钟提醒，不在这一页也会弹出来',
        path: '/tools/alarm',
        icon: 'alarm',
        view: () => import('./views/tools/AlarmView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'assets',
        name: '游戏资源',
        desc: '装备、武器、技能与召唤兽的图标图鉴，能按名字搜',
        path: '/tools/assets',
        icon: 'grid',
        view: () => import('./views/tools/AssetView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'activities',
        name: '活动日历',
        desc: '今天有什么、这周哪天忙 · 点一张卡就能加提醒',
        path: '/tools/activities',
        icon: 'calendar',
        view: () => import('./views/tools/ActivityView.vue').then((page) => page.default),
        ready: true,
    },
];
