import { ref } from 'vue';
import { startLiquidTiming } from '../../liquid-timing';
import { useAccounts } from '../accounts/accounts-store';
import { useRoster } from '../characters/roster';
import { useGoals } from '../goals/goals-store';
import { ensureGlassIncomeLoaded, useIncome } from '../income/income-store';
import { useOnline } from '../income/online-store';
import {
    loadLiquidAccounts,
    loadLiquidGoals,
    loadLiquidOnline,
    loadLiquidRoster,
} from '../../liquid-ledger-data';

const roster = useRoster();
const income = useIncome();
const accounts = useAccounts();
const online = useOnline();
const goals = useGoals();

const sources = {
    roster: { label: '角色', error: roster.loadError, load: loadLiquidRoster },
    income: { label: '收益', error: income.loadError, load: ensureGlassIncomeLoaded },
    accounts: { label: '账号', error: accounts.loadError, load: loadLiquidAccounts },
    online: { label: '上线', error: online.loadError, load: loadLiquidOnline },
    goals: { label: '目标', error: goals.loadError, load: loadLiquidGoals },
};
type Source = keyof typeof sources;
const loading = ref(true);
const retrying = ref<Partial<Record<Source, boolean>>>({});
let pending: Promise<void> | undefined;

async function retrySource(key: Source) {
    if (retrying.value[key]) return;
    const { label, error, load } = sources[key];
    const endReading = startLiquidTiming('账本读取', '总览 ' + label);
    retrying.value[key] = true;
    try {
        await load();
    } catch (cause) {
        console.error('总览读取失败', label, cause);
        error.value = '读取失败，请重试';
    } finally {
        retrying.value[key] = false;
        endReading?.();
    }
}

function loadOverview() {
    if (!loading.value || pending) return pending;
    const keys: Source[] = ['roster', 'income', 'accounts', 'online', 'goals'];
    pending = Promise.all(keys.map(retrySource)).then(() => {
        loading.value = false;
        pending = undefined;
    });
    return pending;
}

export function useLiquidOverviewData() {
    return {
        roster,
        income,
        accounts,
        online,
        goals,
        loading,
        retrying,
        retrySource,
        loadOverview,
    };
}
