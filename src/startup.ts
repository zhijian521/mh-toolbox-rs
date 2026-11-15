/** 外壳绘制后再装配业务数据；页面开放前完成规则加载和历史对账。 */
import type { Ref } from 'vue';
import { loadGameData } from './services/game-data';
import { importLegacyOnStartup, type StartupNotice } from './services/legacy-startup';
import { loadAccounts, useAccounts } from './views/accounts/accounts-store';
import { loadGoals, useGoals } from './views/goals/goals-store';
import { loadRoster, useRoster } from './views/characters/roster';
import { loadIncome, useIncome } from './views/income/income-store';
import { loadOnline, useOnline } from './views/income/online-store';
import { startDailySync, syncAllDays } from './views/accounts/daily-sync';
import { loadPrices, usePrices } from './views/prices/prices-store';

export { flushDailySync } from './views/accounts/daily-sync';

async function loadSafely(load: () => Promise<void>, error: Ref<string>) {
    try {
        await load();
    } catch (cause) {
        console.error('初始化数据失败', cause);
        error.value = '数据加载失败，已暂停写入，请重新启动或从备份恢复';
    }
}

/** 单个领域失败保留原写入保护，允许页面展示错误及恢复入口。 */
export async function initializeData(): Promise<StartupNotice | undefined> {
    const notice = await importLegacyOnStartup();
    const results = await Promise.allSettled([
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
    ]);
    for (const result of results) {
        if (result.status === 'rejected') console.error('初始化数据失败', result.reason);
    }
    // 收益、上线和账号全部读取结束后才补账；失败领域仍由各自 persist 拒写。
    syncAllDays();
    startDailySync();
    return notice;
}
