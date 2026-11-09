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

/**
 * 工具归三类，列表页**按类别分块**（一块一张 `LedgerSection`，图标块再按类别染色）。
 *
 * **分类只有三个**，且刻意不是「一件工具一类」：淡底的色相分辨力有限，四五类以上
 * 相邻两个就几乎同色，读起来像随机（门派浅染踩过同一条，见 `tokens.css`）。
 * 现在四件工具是「日程两件、资料一件、游戏一件」，正好把三类都占上。
 *
 * **开第四类要同时改三处**：`tokens.css` 补一对色号、下面 `TOOL_GROUPS` 补一项、
 * `ToolsView` 补一条 `[data-group]` 的映射。漏掉最后一处不会报错，只是那一类的块
 * 默认回落纸色——所以 `tools.ts` 里这一句与那一处注释都写着「三处」。
 */
export type ToolGroup = 'daily' | 'lookup' | 'game';

/**
 * 分类的**顺序**与中文名。列表页按这个数组的顺序摆块，块内按 `TOOLS` 的原顺序。
 *
 * 顺序即优先级：日程排第一（每天都要碰），资料其次（想起来才查），游戏最后
 * （专门坐下来做某件事时才用）。以后加类也按这个直觉插，不要按「加进来的先后」。
 *
 * 想调块与块的先后就改这个数组；想知道某一类叫什么，从 `TOOL_GROUP_LABEL` 取——
 * 后者由它派生，别另写一份（两份名字迟早漂）。
 */
export const TOOL_GROUPS = [
    { key: 'daily', label: '日程' },
    { key: 'lookup', label: '资料' },
    { key: 'game', label: '游戏' },
] as const satisfies readonly { key: ToolGroup; label: string }[];

/** 类别的中文名，`aria-label` 用（块头已经印了一个，读屏仍需要它自己带上）。 */
export const TOOL_GROUP_LABEL = Object.fromEntries(
    TOOL_GROUPS.map((group) => [group.key, group.label]),
) as Record<ToolGroup, string>;

export interface ToolEntry {
    key: string;
    /** 列表上的名字，也是详情页的标题。 */
    name: string;
    /** 一句话说清它干什么。列表上不显示，只进 `aria-label`。 */
    desc: string;
    path: string;
    icon: IconName;
    /** 决定图标块的底色（`tokens.css` 的 `--tint-工具*`）。 */
    group: ToolGroup;
    /**
     * 路由目标。写成函数就是**懒加载**：捉鬼那套（截屏、OCR、地图绘制、样张夹具）
     * 约一千五百行，只有真进 `/tools/ghost` 时才需要，不该压在第一屏。
     * 列表页只读上面的 `name` / `icon` / `group` / `desc`，不实例化 `view`，所以懒加载不影响渲染。
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
        group: 'game',
        view: () => import('./views/tools/GhostHuntView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'alarm',
        name: '闹钟',
        desc: '到点前一分钟提醒，不在这一页也会弹出来',
        path: '/tools/alarm',
        icon: 'alarm',
        group: 'daily',
        view: () => import('./views/tools/AlarmView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'assets',
        name: '游戏资源',
        desc: '装备、武器、技能与召唤兽的图标图鉴，能按名字搜',
        path: '/tools/assets',
        icon: 'grid',
        group: 'lookup',
        view: () => import('./views/tools/AssetView.vue').then((page) => page.default),
        ready: true,
    },
    {
        key: 'activities',
        name: '活动日历',
        desc: '今天有什么、这周哪天忙 · 点一张卡就能加提醒',
        path: '/tools/activities',
        icon: 'calendar',
        group: 'daily',
        view: () => import('./views/tools/ActivityView.vue').then((page) => page.default),
        ready: true,
    },
];
