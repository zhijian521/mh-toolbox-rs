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
 *
 * 一件工具有两种落地方式（`kind`）：`page` 进路由，`link` 用系统浏览器打开外链。
 * 后者不进路由表——见 `ToolLink` 那段。
 */

/**
 * 三类工具共用一份登记表与显示顺序。分类文字提供语义，图标色只辅助辨认；
 * 调整分类时同步维护经典目录和 `liquid-tools.css` 的图标配色。
 */
export type ToolGroup = 'daily' | 'lookup' | 'game';

/** 分类和工具在目录中的顺序由登记表决定。 */
export const TOOL_GROUPS = [
    { key: 'daily', label: '日程' },
    { key: 'lookup', label: '资料' },
    { key: 'game', label: '游戏' },
] as const satisfies readonly { key: ToolGroup; label: string }[];

interface ToolBase {
    key: string;
    /** 列表上的名字，也是详情页的标题。 */
    name: string;
    /** 工具目录的悬停提示。 */
    desc: string;
    icon: IconName;
    /** 决定图标块的底色（`tokens.css` 的 `--tint-工具*`）。 */
    group: ToolGroup;
}

/**
 * 站内页：有路由地址与一份懒加载的页面组件。
 *
 * `view` 写成函数就是**懒加载**：捉鬼那套（截屏、OCR、地图绘制、样张夹具）约一千五百行，
 * 只有真进 `/tools/ghost` 时才需要，不该压在第一屏。列表页只读 `name` / `icon` /
 * `group` / `desc`，不实例化 `view`，所以懒加载不影响渲染。
 */
export interface ToolPage extends ToolBase {
    kind: 'page';
    path: string;
    view: () => Promise<RouteComponent>;
}

/**
 * 外链：点了就用系统浏览器打开 `href`，**不进路由**。
 *
 * 维护公告是第一个：正文在官网，抄一份进应用只会跟官网对不上（改版、置顶、
 * 图片与表格），而「这周停机了吗」这件事官网自己已经说清楚了，多一层列表只是
 * 多一层会过期的副本。原先做过一版内嵌列表（Rust 抓 GBK 列表页 + 本机算维护窗口），
 * 12 个文件换来一个「点进去还得再点一次去官网」的中间页——用户看完直接否掉了。
 *
 * 判据是「内容有没有一份本机自己的状态」：闹钟、物价、角色有，公告没有，所以公告是链接。
 * 两者用 `kind` 区分而不是留一个空 `path`：空地址在类型上说得通，跑起来是静默不跳。
 */
export interface ToolLink extends ToolBase {
    kind: 'link';
    href: string;
}

export type ToolEntry = ToolPage | ToolLink;

export const TOOLS: ToolEntry[] = [
    {
        key: 'fengyao',
        kind: 'page',
        name: '提醒助手',
        desc: '监听游戏公告，接收桌面提醒',
        path: '/tools/fengyao',
        icon: 'notice',
        group: 'game',
        view: () => import('./views/tools/FengyaoView.vue').then((page) => page.default),
    },
    {
        key: 'ghost',
        kind: 'page',
        name: '捉鬼助手',
        desc: '根据任务坐标标出搜索范围',
        path: '/tools/ghost',
        icon: 'pin',
        group: 'game',
        view: () => import('./views/tools/GhostHuntView.vue').then((page) => page.default),
    },
    {
        key: 'growth',
        kind: 'page',
        name: '养成计算器',
        desc: '估算升级、技能与修炼花费',
        path: '/tools/growth',
        icon: 'growth',
        group: 'game',
        view: () => import('./views/tools/GrowthView.vue').then((page) => page.default),
    },
    {
        key: 'alarm',
        kind: 'page',
        name: '闹钟',
        desc: '设定时间，提前五分钟提醒',
        path: '/tools/alarm',
        icon: 'alarm',
        group: 'daily',
        view: () => import('./views/tools/AlarmView.vue').then((page) => page.default),
    },
    {
        /* 官网「每周维护」栏目，不是「新闻中心」首页——后者混着赛事、活动与版本介绍，
         * 一周里大半不是这条想看的东西。 */
        key: 'notice',
        kind: 'link',
        name: '维护公告',
        desc: '在官网查看每周维护安排',
        href: 'https://xyq.163.com/news/update/',
        icon: 'notice',
        group: 'lookup',
    },
    {
        key: 'assets',
        kind: 'page',
        name: '游戏资源',
        desc: '检索装备、技能与召唤兽图鉴',
        path: '/tools/assets',
        icon: 'grid',
        group: 'lookup',
        view: () => import('./views/tools/AssetView.vue').then((page) => page.default),
    },
    {
        key: 'activities',
        kind: 'page',
        name: '活动日历',
        desc: '查看每日活动，添加开场提醒',
        path: '/tools/activities',
        icon: 'calendar',
        group: 'daily',
        view: () => import('./views/tools/ActivityView.vue').then((page) => page.default),
    },
];
