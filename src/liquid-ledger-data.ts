import { gameDataReady, loadGameData } from './services/game-data';
import { loadAccounts, useAccounts } from './views/accounts/accounts-store';
import { flushDailySync, startDailySync, syncAllDays } from './views/accounts/daily-sync';
import { loadRoster, useRoster } from './views/characters/roster';
import { loadGoals, useGoals } from './views/goals/goals-store';
import { ensureGlassPricesLoaded } from './views/prices/prices-store';
import { ensureGlassIncomeLoaded } from './views/income/income-store';
import { loadOnline, useOnline } from './views/income/online-store';

function sharedLoad(
    store: { loaded: { readonly value: boolean }; loadError: { value: string } },
    load: () => Promise<void>,
    needsGameData = false,
) {
    let pending: Promise<void> | undefined;
    return () => {
        if (pending) return pending;
        if (store.loaded.value && !store.loadError.value) return Promise.resolve();
        pending = (async () => {
            if (needsGameData) {
                await loadGameData();
                if (!gameDataReady.value) {
                    store.loadError.value = '游戏数据未读取，请重试';
                    return;
                }
            }
            await load();
        })().finally(() => {
            pending = undefined;
        });
        return pending;
    };
}

export const loadLiquidRoster = sharedLoad(useRoster(), loadRoster, true);
export const loadLiquidAccounts = sharedLoad(useAccounts(), loadAccounts, true);
export const loadLiquidOnline = sharedLoad(useOnline(), loadOnline);
export const loadLiquidGoals = sharedLoad(useGoals(), loadGoals);

let stopSync: (() => void) | undefined;

/** 收益和账号共用账本，切页时复用已读取的数据和同步监听。 */
export async function loadLiquidLedger() {
    await Promise.all([
        loadLiquidRoster(),
        loadLiquidAccounts(),
        loadLiquidOnline(),
        ensureGlassIncomeLoaded(),
    ]);
    if (stopSync) return;
    syncAllDays();
    stopSync = startDailySync();
}

export async function loadLiquidIncome() {
    await Promise.all([loadLiquidLedger(), ensureGlassPricesLoaded()]);
}

export function flushLiquidDailySync() {
    return stopSync ? flushDailySync() : Promise.resolve(true);
}

if (import.meta.hot) import.meta.hot.dispose(() => stopSync?.());
