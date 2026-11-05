import type { RouteComponent } from 'vue-router';
import type { IconName } from './components/icons';

/**
 * 八个页面**一律懒加载**（与 `tools.ts` 的捉鬼页、`router.ts` 的 `/dev` 同一个写法）。
 *
 * 静态 import 会让这八页连同它们专用的组件全压进第一屏包——总览页一套（统计条、七
 * 日柱状图、各号卡）、角色页一套（卡、编辑器、五个分区编辑器、演示数据）、物价页一套
 * （卡、走势图、四个弹窗）、收益页一套、账号页一套（两本账、快捷入口、记录表）、
 * 目标页一套（卡、新建、更新养成、流水）。
 * 左栏只读下面的 `label` / `icon` / `path`（见 `App.vue` 的模板），从不实例化 `view`，
 * 所以「进哪页才下哪页」在这里没有代价。
 *
 * 显式取 `.default`：`RouteComponent` 的联合类型不认模块命名空间对象，少这一层就要在
 * `component` 上加断言。
 */
const CharactersView = () => import('./views/CharactersView.vue').then((page) => page.default);
const IncomeView = () => import('./views/income/IncomeView.vue').then((page) => page.default);
const AccountsView = () => import('./views/accounts/AccountsView.vue').then((page) => page.default);
const GoalsView = () => import('./views/goals/GoalsView.vue').then((page) => page.default);
const OverviewView = () => import('./views/overview/OverviewView.vue').then((page) => page.default);
const PricesView = () => import('./views/prices/PricesView.vue').then((page) => page.default);
const SettingsView = () => import('./views/SettingsView.vue').then((page) => page.default);
const ToolsView = () => import('./views/ToolsView.vue').then((page) => page.default);

/**
 * 导航 + 路由的**单一真源**。
 *
 * 加一个页面只改这个数组：路由表从它生成（`router.ts`），左栏从它渲染（`App.vue`）。
 * 之前这两处各写一份，加页面要同时改 `pages` 数组和模板里的 `v-if` 分支，漏一处就白屏。
 *
 * `view` 为 `null` 表示这一页还没写，路由会挂占位页，左栏会把它画成半透明。
 * 之前这个判断散在 `AppRail.vue` 的模板里（`page.key !== 'settings'`），
 * 那是个隐式约定——加第二页时必然忘记改。
 */
export interface NavItem {
    key: string;
    label: string;
    icon: IconName;
    path: string;
    /** `null` = 这一页还没写。写成函数就是懒加载（见文件头）。 */
    view: RouteComponent | (() => Promise<RouteComponent>) | null;
}

export const NAV_ITEMS: NavItem[] = [
    { key: 'overview', label: '总览', icon: 'overview', path: '/overview', view: OverviewView },
    { key: 'income', label: '收益', icon: 'income', path: '/income', view: IncomeView },
    { key: 'prices', label: '物价', icon: 'prices', path: '/prices', view: PricesView },
    // 装备不再是独立一页，并进了角色：一个人穿什么、备哪些，本来就是「这个角色」的属性。
    // 旧地址 `/equipment` 在 `router.ts` 里重定向到这里，收藏夹不会落到设置页。
    {
        key: 'characters',
        label: '角色',
        icon: 'characters',
        path: '/characters',
        view: CharactersView,
    },
    { key: 'accounts', label: '账号', icon: 'accounts', path: '/accounts', view: AccountsView },
    { key: 'goals', label: '目标', icon: 'goals', path: '/goals', view: GoalsView },
    // 工具排在「目标」与「设置」之间：它是干活的入口，不是资料页；设置永远压在末尾。
    // 左栏到这里为止：具体某件工具（如捉鬼）是 `/tools` 的子页，不进导航——
    // 工具会越加越多，一件一行会把八档的槽撑成一列，位置感就没了。
    { key: 'tools', label: '工具', icon: 'tools', path: '/tools', view: ToolsView },
    { key: 'settings', label: '设置', icon: 'settings', path: '/settings', view: SettingsView },
];

/**
 * 默认落在哪一页。
 *
 * 2026-11-05 从 `/settings` 改成总览。此前那句注释写的是「设置页永远是最稳的落点：它不
 * 依赖任何数据，也就不会开局就空着」——前半年成立，因为当时只有设置页是完整的；现在
 * 三个数据页都有了，打开记账工具先落在「主题与字号」上就很别扭。总览页对空数据的处理
 * 是写一句话（「名册里还没有角色」），并不比设置页难看，而它回答的是「这几天怎么样」。
 */
export const DEFAULT_PATH = '/overview';

export const NAV_BY_KEY = new Map(NAV_ITEMS.map((item) => [item.key, item]));
