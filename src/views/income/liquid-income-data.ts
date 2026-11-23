import { gameDataReady, loadGameData } from '../../services/game-data';
import { loadAccounts, useAccounts } from '../accounts/accounts-store';
import { flushDailySync, startDailySync, syncAllDays } from '../accounts/daily-sync';
import { loadRoster, useRoster } from '../characters/roster';
import { ensureGlassPricesLoaded } from '../prices/prices-store';
import { ensureGlassIncomeLoaded } from './income-store';
import { loadOnline, useOnline } from './online-store';

function sharedLoad(
    store: { loaded: { readonly value: boolean }; loadError: { value: string } },
    load: () => Promise<void>,
    needsGameData = false,
) {
    let pending: Promise<void> | undefined;
    return () => {
        if (store.loaded.value && !store.loadError.value) return Promise.resolve();
        pending ??= (async () => {
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

let stopSync: (() => void) | undefined;

export async function loadLiquidIncome() {
    await Promise.all([
        loadGameData(),
        loadLiquidRoster(),
        loadLiquidAccounts(),
        loadLiquidOnline(),
        ensureGlassPricesLoaded(),
        ensureGlassIncomeLoaded(),
    ]);
    if (stopSync) return;
    syncAllDays();
    stopSync = startDailySync();
}

export function flushLiquidDailySync() {
    return stopSync ? flushDailySync() : Promise.resolve(true);
}

if (import.meta.hot) import.meta.hot.dispose(() => stopSync?.());
