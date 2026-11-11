import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/blocks.css';
import App from './App.vue';
import { useFontScale } from './composables/use-font-scale';
import { useTheme } from './composables/use-theme';
import { askConfirm } from './composables/use-confirm';
import { guardWindowClose } from './services/desktop';
import { flushPendingWrites } from './services/persist';
import { router } from './router';
import { loadGameData } from './services/game-data';
import { loadAccounts } from './views/accounts/accounts-store';
import { loadGoals } from './views/goals/goals-store';
import { loadRoster } from './views/characters/roster';
import { loadIncome } from './views/income/income-store';
import { loadOnline } from './views/income/online-store';
import { startDailySync, syncRecent } from './views/accounts/daily-sync';
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
 * 游戏数据在**挂载前**加载一次，先安装规则，再读取名册与物价，避免空模板改写存档。
 *
 * 这是「异步只发生在边界」那条：组件里没有加载态、没有 `v-if="表还没回来"`，
 * `schoolSkills()` 与图标查表因此都是同步纯函数（见 `services/game-data.ts` 的说明）。
 * `loadGameData()` 失败也会 resolve（退回空表），所以这里不必写 try——
 * 数据缺了就是下拉少几项，应用不该因此起不来。
 *
 * 物价表、角色名册与收益账走同一条路：桌面版从 SQLite 读、浏览器从 `localStorage` 读，
 * 两条都在这里等到手再挂载。四个 `load*` 都**不 reject**：读不到就是空表 / 种子 /
 * 一条 `loadError`，写库失败记在各自的 `writeError` 里。这条约束不是白写的——
 * `Promise.all` 只要有一个 reject，`.then(mount)` 就永不执行，用户看到的是一片白。
 * 所以那两个 store 里凡是可能抛的 IO（尤其是迁移时给 `localStorage` 写留底）都就地
 * 兜住：留底是尽力而为，不能因为备份写不进去让整个应用起不来。
 */
Promise.all([
    loadGameData().then(() => Promise.all([loadRoster(), loadPrices()])),
    loadIncome(),
    loadOnline(),
    loadAccounts(),
    loadGoals(),
]).then(() => {
    /* 账号账本与收益、上线记录都到手之后才补算——自动同步要读三份数据，
     * `Promise.all` 之后它们才算都读完了。放在 `mount` 之前：先把那几笔补上，
     * 用户切到账号页时看到的就是补齐的账，而不是「进来一下才多出两行」。
     *
     * 失败不拦挂载：同步是副动作，读不出账号账本时它自己会拒绝写（`persist.canWrite`）。 */
    syncRecent();
    startDailySync();
    createApp(App).use(router).mount('#app');
    void guardWindowClose(async () => {
        if (await flushPendingWrites()) return true;
        return askConfirm({
            title: '仍有改动未保存，退出吗？',
            note: '退出会丢失未保存的改动。取消后可在页面重试保存，或检查磁盘空间。',
            confirmText: '退出',
        });
    });
});
