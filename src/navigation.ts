import type { Component } from 'vue';
import type { IconName } from './components/icons';
import SettingsView from './views/SettingsView.vue';

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
    view: Component | null;
}

export const NAV_ITEMS: NavItem[] = [
    { key: 'overview', label: '总览', icon: 'overview', path: '/overview', view: null },
    { key: 'income', label: '收益', icon: 'income', path: '/income', view: null },
    { key: 'prices', label: '物价', icon: 'prices', path: '/prices', view: null },
    // 装备不再是独立一页，并进了角色：一个人穿什么、备哪些，本来就是「这个角色」的属性。
    // 旧地址 `/equipment` 在 `router.ts` 里重定向到这里，收藏夹不会落到设置页。
    { key: 'characters', label: '角色', icon: 'characters', path: '/characters', view: null },
    { key: 'accounts', label: '账号', icon: 'accounts', path: '/accounts', view: null },
    { key: 'goals', label: '目标', icon: 'goals', path: '/goals', view: null },
    // 工具排在「目标」与「设置」之间：它是干活的入口，不是资料页；设置永远压在末尾。
    { key: 'tools', label: '工具', icon: 'tools', path: '/tools', view: null },
    { key: 'settings', label: '设置', icon: 'settings', path: '/settings', view: SettingsView },
];

/** 默认落在哪一页。设置页是当前唯一实现的页面，所以启动就停在这里。 */
export const DEFAULT_PATH = '/settings';

export const NAV_BY_KEY = new Map(NAV_ITEMS.map((item) => [item.key, item]));
