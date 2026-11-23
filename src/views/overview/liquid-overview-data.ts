import { computed, ref, type Ref } from 'vue';
import { gameDataReady, loadGameData } from '../../services/game-data';
import { loadAccounts, useAccounts } from '../accounts/accounts-store';
import { loadRoster, useRoster } from '../characters/roster';
import { loadGoals, useGoals } from '../goals/goals-store';
import { ensureGlassIncomeLoaded, useIncome } from '../income/income-store';
import { loadOnline, useOnline } from '../income/online-store';

const roster = useRoster();
const income = useIncome();
const accounts = useAccounts();
const online = useOnline();
const goals = useGoals();

// 名册与交易的装备、召唤兽快照都需要游戏规则才能归一。
function afterGameRules(load: () => Promise<void>, error: Ref<string>) {
    return async () => {
        await loadGameData();
        if (!gameDataReady.value) {
            error.value = '游戏数据未读取，请重试';
            return;
        }
        await load();
    };
}

const sources = [
    { label: '角色', error: roster.loadError, load: afterGameRules(loadRoster, roster.loadError) },
    { label: '收益', error: income.loadError, load: ensureGlassIncomeLoaded },
    {
        label: '账号',
        error: accounts.loadError,
        load: afterGameRules(loadAccounts, accounts.loadError),
    },
    { label: '上线', error: online.loadError, load: loadOnline },
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
