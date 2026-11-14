import { createApp, type Ref } from 'vue';
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
import { loadAccounts, useAccounts } from './views/accounts/accounts-store';
import { loadGoals, useGoals } from './views/goals/goals-store';
import { loadRoster, useRoster } from './views/characters/roster';
import { loadIncome, useIncome } from './views/income/income-store';
import { loadOnline, useOnline } from './views/income/online-store';
import { flushDailySync, startDailySync, syncAllDays } from './views/accounts/daily-sync';
import { loadPrices, usePrices } from './views/prices/prices-store';

/**
 * 偏好在挂载前落地：字号是根变量，明暗是根类，风格是根属性。
 * 两者都只在「第一次有人调」时才写入 DOM——原先只有设置页和左栏会调，于是冷启动停在
 * 总览时字号不会恢复，得先进一次设置页才对。两个 composable 都是模块级单例，
 * 这里各调一次即可覆盖整个应用，挂在 `mount` 之前也避免了首帧跳动。
 */
useFontScale();
useTheme();

async function loadSafely(load: () => Promise<void>, error: Ref<string>) {
    try {
        await load();
    } catch (cause) {
        console.error('初始化数据失败', cause);
        error.value = '数据加载失败，已暂停写入，请重新启动或从备份恢复';
    }
}

/** 先加载规则与各领域数据；单个领域失败仍挂载页面并保留写入保护。 */
Promise.allSettled([
    loadGameData().then(() =>
        Promise.allSettled([
            loadSafely(loadRoster, useRoster().loadError),
            loadSafely(loadPrices, usePrices().loadError),
        ]),
    ),
    loadSafely(loadIncome, useIncome().loadError),
    loadSafely(loadOnline, useOnline().loadError),
    loadSafely(loadAccounts, useAccounts().loadError),
    loadSafely(loadGoals, useGoals().loadError),
]).then((results) => {
    for (const result of results) {
        if (result.status === 'rejected') console.error('初始化数据失败', result.reason);
    }
    /* 账号账本与收益、上线记录都到手之后才补算——自动同步要读三份数据，
     * 所有读取完成之后它们才算都读完了。放在 `mount` 之前：先把那几笔补上，
     * 用户切到账号页时看到的就是补齐的账，而不是「进来一下才多出两行」。
     *
     * 失败不拦挂载：同步是副动作，读不出账号账本时它自己会拒绝写（`persist.canWrite`）。 */
    syncAllDays();
    startDailySync();
    createApp(App).use(router).mount('#app');
    void guardWindowClose(async () => {
        const synced = await flushDailySync();
        const written = await flushPendingWrites();
        if (synced && written) return true;
        return askConfirm({
            danger: true,
            title: '仍有改动未保存，退出吗？',
            note: '退出会丢失未保存的改动。取消后可在页面重试保存，或检查磁盘空间。',
            confirmText: '退出',
        });
    });
});
