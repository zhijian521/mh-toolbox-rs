/** 收益与上线记录是自动账目的真源；按受影响日期替换，手记不参与同步。 */
import { computed, effectScope, onScopeDispose, ref, watch } from 'vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useAccounts, type AutoInput } from './accounts-store';
import { useOnline } from '../income/online-store';
import { useIncome } from '../income/income-store';
import { cardCostByDay, sessionSlices, type OnlineSession } from '../income/online';
import { netByDay } from '../income/trend-chart';

export const AUTO_INCOME = '游戏收益';
export const AUTO_CARD = '点卡消耗';

const error = ref('');
const queued = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function dailyKey(date: string, characterId: string, category: string): string {
    return (
        'auto-' +
        date +
        '-' +
        (characterId || 'none') +
        '-' +
        (category === AUTO_CARD ? 'card' : 'income')
    );
}

function rowsOf(dates: ReadonlySet<string>, now: number): AutoInput[] {
    const rows: AutoInput[] = [];
    const append = (source: Map<string, number>, category: string) => {
        for (const [key, amount] of source) {
            const at = key.indexOf('|');
            const date = key.slice(0, at);
            if (!dates.has(date) || amount === 0) continue;
            const characterId = key.slice(at + 1);
            rows.push({
                id: dailyKey(date, characterId, category),
                date,
                characterId,
                category,
                kind: category === AUTO_CARD || amount < 0 ? 'expense' : 'income',
                amount: Math.abs(amount),
                note: category === AUTO_CARD ? '在线时长折算' : '收益页自动同步',
            });
        }
    };
    append(netByDay(useIncome().entries.value), AUTO_INCOME);
    append(
        cardCostByDay(
            useOnline().sessions.value.filter((one) => one.cardCost !== false),
            now,
        ),
        AUTO_CARD,
    );
    return rows;
}

export function autoRowsOf(date: string, now = Date.now()): AutoInput[] {
    return rowsOf(new Set([date]), now);
}

function syncDates(dates: readonly string[]) {
    const sourceError = useIncome().loadError.value || useOnline().loadError.value;
    if (sourceError) {
        error.value = sourceError;
        return { ok: false, error: sourceError };
    }
    const scope = new Set(dates);
    const result = useAccounts().applyAutoEntries(rowsOf(scope, Date.now()), [...scope]);
    error.value = result.ok ? '' : result.error;
    return result;
}

export function syncDay(date: string) {
    return syncDates([date]);
}

/** 启动时从真源恢复全部自动账目，包括旧版本曾漏同步的日期。 */
export function syncAllDays() {
    const dates = new Set(useIncome().entries.value.map((one) => one.date));
    for (const one of useOnline().sessions.value) addSessionDays(dates, one);
    for (const one of useAccounts().entries.value) {
        if (one.source === 'auto') dates.add(one.date);
    }
    return syncDates([...dates]);
}

function addSessionDays(dates: Set<string>, session: OnlineSession, now = Date.now()) {
    dates.add(session.date);
    for (const slice of sessionSlices(session, now)) dates.add(slice.date);
}

function flushQueued() {
    clearTimeout(timer);
    timer = undefined;
    if (!queued.size) return { ok: true };
    const result = syncDates([...queued]);
    if (result.ok) queued.clear();
    return result;
}

function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flushQueued, 400);
}

function changed<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
    const old = new Map(before.map((one) => [one.id, one]));
    const next = new Map(after.map((one) => [one.id, one]));
    return [
        ...before.filter((one) => next.get(one.id) !== one),
        ...after.filter((one) => old.get(one.id) !== one),
    ];
}

/** 合并连点写入；修改和删除收集旧、新日期，分钟刷新仅同步进行中的时段。 */
export function startDailySync(): () => void {
    const scope = effectScope();
    scope.run(() => {
        const now = useMinuteNow();
        watch(
            useIncome().entries,
            (after, before) => {
                for (const one of changed(before, after)) queued.add(one.date);
                schedule();
            },
            { flush: 'sync' },
        );
        watch(
            useOnline().sessions,
            (after, before) => {
                for (const one of changed(before, after)) addSessionDays(queued, one);
                schedule();
            },
            { flush: 'sync' },
        );
        watch(now, (value, previous) => {
            for (const one of useOnline().sessions.value) {
                if (one.endAt !== null) continue;
                addSessionDays(queued, one, previous);
                addSessionDays(queued, one, value);
            }
            if (queued.size) schedule();
        });
        onScopeDispose(() => clearTimeout(timer));
    });
    return () => scope.stop();
}

/** 关闭窗口和手动重试先处理尚在防抖队列中的日期，再等待真实落盘。 */
export async function flushDailySync() {
    if (!flushQueued().ok) return false;
    return useAccounts().flush();
}

export function useDailySync() {
    const accounts = useAccounts();
    return {
        error: computed(() => {
            const reason = error.value || accounts.loadError.value || accounts.writeError.value;
            return reason ? '同步到账户失败：' + reason : '';
        }),
        pending: accounts.pending,
        async retry() {
            if (!syncAllDays().ok) return;
            queued.clear();
            await accounts.retry();
        },
    };
}
