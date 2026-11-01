import type { Component } from 'vue';
import type { IconName } from './components/icons';
import GhostHuntView from './views/tools/GhostHuntView.vue';

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
    view: Component;
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
        view: GhostHuntView,
        ready: true,
    },
];
