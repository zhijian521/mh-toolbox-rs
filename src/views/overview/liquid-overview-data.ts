import { computed, ref } from 'vue';
import { useAccounts } from '../accounts/accounts-store';
import { useRoster } from '../characters/roster';
import { loadGoals, useGoals } from '../goals/goals-store';
import { ensureGlassIncomeLoaded, useIncome } from '../income/income-store';
import { useOnline } from '../income/online-store';
import {
    loadLiquidAccounts,
    loadLiquidOnline,
    loadLiquidRoster,
} from '../income/liquid-income-data';

const roster = useRoster();
const income = useIncome();
const accounts = useAccounts();
const online = useOnline();
const goals = useGoals();

const sources = [
    { label: '角色', error: roster.loadError, load: loadLiquidRoster },
    { label: '收益', error: income.loadError, load: ensureGlassIncomeLoaded },
    {
        label: '账号',
        error: accounts.loadError,
        load: loadLiquidAccounts,
    },
    { label: '上线', error: online.loadError, load: loadLiquidOnline },
    { label: '目标', error: goals.loadError, load: loadGoals },
];
const loading = ref(true);
const errors = computed(() => sources.filter(({ error }) => error.value));
let pending: Promise<void> | undefined;

function loadOverview() {
    if (pending) return pending;
    const requested = loading.value ? sources : errors.value;
    if (!requested.length) return;
    loading.value = true;
    pending = Promise.all(
        requested.map(async ({ label, error, load }) => {
            try {
                await load();
            } catch (cause) {
                console.error(`${label}读取失败`, cause);
                error.value = '读取失败，请重试';
            }
        }),
    ).then(() => {
        loading.value = false;
        pending = undefined;
    });
    return pending;
}

export function useLiquidOverviewData() {
    return { roster, income, accounts, online, goals, loading, errors, loadOverview };
}
