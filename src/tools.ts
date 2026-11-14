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
 * 工具归三类，列表页**按类别分块**（一块一张 `LedgerSection`，图标块再按类别染色）。
 *
 * **分类只有三个**，且刻意不是「一件工具一类」：淡底的色相分辨力有限，四五类以上
 * 相邻两个就几乎同色，读起来像随机（门派浅染踩过同一条，见 `tokens.css`）。
 * 现在五件工具是「日程两件、资料两件、游戏一件」，正好把三类都占上。
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

interface ToolBase {
    key: string;
    /** 列表上的名字，也是详情页的标题。 */
    name: string;
    /** 一句话说清它干什么。列表上不显示，只进 `aria-label`。 */
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
    view: RouteComponent | (() => Promise<RouteComponent>);
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
        key: 'ghost',
        kind: 'page',
        name: '捉鬼助手',
        desc: '读任务栏里的假坐标，在地图上画出该往哪找',
        path: '/tools/ghost',
        icon: 'pin',
        group: 'game',
        view: () => import('./views/tools/GhostHuntView.vue').then((page) => page.default),
    },
    {
        key: 'alarm',
        kind: 'page',
        name: '闹钟',
        desc: '到点前一分钟提醒，不在这一页也会弹出来',
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
        desc: '每周二上午例行停机 · 在浏览器里打开官网的每周维护栏目',
        href: 'https://xyq.163.com/news/update/',
        icon: 'notice',
        group: 'lookup',
    },
    {
        key: 'assets',
        kind: 'page',
        name: '游戏资源',
        desc: '装备、武器、技能与召唤兽的图标图鉴，能按名字搜',
        path: '/tools/assets',
        icon: 'grid',
        group: 'lookup',
        view: () => import('./views/tools/AssetView.vue').then((page) => page.default),
    },
    {
        key: 'activities',
        kind: 'page',
        name: '活动日历',
        desc: '今天有什么、这周哪天忙 · 点一张卡就能加提醒',
        path: '/tools/activities',
        icon: 'calendar',
        group: 'daily',
        view: () => import('./views/tools/ActivityView.vue').then((page) => page.default),
    },
];
