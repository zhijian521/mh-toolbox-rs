import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/blocks.css';
import App from './App.vue';
import { useFontScale } from './composables/use-font-scale';
import { useTheme } from './composables/use-theme';
import { router } from './router';
import { loadGameData } from './services/game-data';
import { loadRoster } from './views/characters/roster';
import { loadPrices } from './views/prices/prices-store';

/**
 * 持久化偏好在挂载前就先落地：字号是根元素上的一个变量，主题是根元素上的一个类。
 * 两者都只在「第一次有人调」时才写入 DOM——原先只有设置页和左栏会调，于是冷启动停在
 * 总览时字号不会恢复，得先进一次设置页才对。两个 composable 都是模块级单例，
 * 这里各调一次即可覆盖整个应用，挂在 `mount` 之前也避免了首帧跳动。
 */
useFontScale();
useTheme();

/**
 * 游戏数据表（门派 / 技能）在**挂载前**加载一次，之后全站同步读缓存。
 *
 * 这是「异步只发生在边界」那条：组件里没有加载态、没有 `v-if="表还没回来"`，
 * `schoolSkills()` 与图标查表因此都是同步纯函数（见 `services/game-data.ts` 的说明）。
 * `loadGameData()` 失败也会 resolve（退回空表），所以这里不必写 try——
 * 数据缺了就是下拉少几项，应用不该因此起不来。
 *
 * 物价表与角色名册走同一条路：桌面版从 SQLite 读、浏览器从 `localStorage` 读，
 * 两条都在这里等到手再挂载。三个 `load*` 都**不 reject**：读不到就是空表 / 种子 /
 * 一条 `loadError`，写库失败记在各自的 `writeError` 里。这条约束不是白写的——
 * `Promise.all` 只要有一个 reject，`.then(mount)` 就永不执行，用户看到的是一片白。
 * 所以那两个 store 里凡是可能抛的 IO（尤其是迁移时给 `localStorage` 写留底）都就地
 * 兜住：留底是尽力而为，不能因为备份写不进去让整个应用起不来。
 */
Promise.all([loadGameData(), loadPrices(), loadRoster()]).then(() => {
    createApp(App).use(router).mount('#app');
});
