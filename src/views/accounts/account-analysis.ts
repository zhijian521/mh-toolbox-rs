import { dateText, ledgerMoneyText, parseDay } from '../../services/format';
import { ACCOUNT_CATEGORIES, type AccountEntry, type Currency, type Shortcut } from './accounts';

import { ALL_OPTIONS as ALL_ACCOUNTS } from '../../components/select-options';
import { UNASSIGNED_CHARACTER as UNASSIGNED } from '../characters/character-options';
import type { RecordFilters } from '../../composables/use-record-filters';

export interface AccountRecordFilters extends RecordFilters {
    currency: string;
    kind: string;
    category: string;
    channel: string;
    source: string;
    keyword: string;
}
export const BOOK_OPTIONS: { value: Currency; label: string }[] = [
    { value: 'rmb', label: '人民币' },
    { value: 'cash', label: '梦幻币' },
];

export interface AccountFilter {
    from?: string;
    to?: string;
    characterId?: string;
    currency?: string;
    kind?: string;
    category?: string;
    channel?: string;
    source?: string;
}

export function inAccountRange(date: string, range: Pick<AccountFilter, 'from' | 'to'>) {
    return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

/** 空角色与不限必须分开；同一筛选供概览和历史使用。 */
export function filterAccounts(entries: readonly AccountEntry[], filter: AccountFilter) {
    return entries.filter((one) => {
        if (!inAccountRange(one.date, filter)) return false;
        if (filter.characterId && filter.characterId !== ALL_ACCOUNTS) {
            const id = filter.characterId === UNASSIGNED ? '' : filter.characterId;
            if (one.characterId !== id) return false;
        }
        for (const key of ['currency', 'kind', 'category', 'channel'] as const) {
            const value = filter[key];
            if (value && value !== ALL_ACCOUNTS && one[key] !== value) return false;
        }
        if (filter.source === 'auto' && one.source !== 'auto') return false;
        if (filter.source === 'manual' && one.source === 'auto') return false;
        return true;
    });
}

export function accountValueText(amount: number, currency: Currency): string {
    return ledgerMoneyText(amount, currency, { sign: 'auto' });
}

/** 坐标轴与记录使用相同单位，不切换万、亿。 */
export const accountAxisText = accountValueText;

function rounded(value: number, currency: Currency) {
    return currency === 'rmb' ? Math.round(value * 100) / 100 : Math.round(value);
}

/** 长区间按月、年汇总，完整保留范围，不截掉旧账。 */
export function accountTrend(
    entries: readonly AccountEntry[],
    currency: Currency,
    range: { from: string; to: string },
) {
    let from = range.from;
    let to = range.to;
    if (!from || !to) {
        for (const one of entries) {
            if (one.currency !== currency) continue;
            if (!range.from && (!from || one.date < from)) from = one.date;
            if (!range.to && (!to || one.date > to)) to = one.date;
        }
    }
    const labels: string[] = [];
    const income: number[] = [];
    const expense: number[] = [];
    if (!from || !to || from > to) return { labels, income, expense, unit: '日' };
    const start = parseDay(from);
    const end = parseDay(to);
    // 使用日历日期的 UTC 分量求天数，避免夏令时多出或少掉一天。
    const dayNumber = (at: Date) => Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
    const days = (dayNumber(end) - dayNumber(start)) / 86400000 + 1;
    const months =
        (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
    const unit = days <= 62 ? '日' : months <= 36 ? '月' : '年';
    const keyOf = (date: string) => date.slice(0, unit === '日' ? 10 : unit === '月' ? 7 : 4);
    const cursor = parseDay(
        unit === '日'
            ? from
            : unit === '月'
              ? from.slice(0, 7) + '-01'
              : from.slice(0, 4) + '-01-01',
    );
    while (keyOf(dateText(cursor)) <= keyOf(to)) {
        labels.push(keyOf(dateText(cursor)));
        income.push(0);
        expense.push(0);
        if (unit === '日') cursor.setDate(cursor.getDate() + 1);
        else if (unit === '月') cursor.setMonth(cursor.getMonth() + 1);
        else cursor.setFullYear(cursor.getFullYear() + 1);
    }
    const indexOf = new Map(labels.map((date, index) => [date, index]));
    for (const one of entries) {
        if (one.currency !== currency) continue;
        if (one.date < from || one.date > to) continue;
        const index = indexOf.get(keyOf(one.date));
        if (index === undefined) continue;
        (one.kind === 'income' ? income : expense)[index] += one.amount;
    }
    return {
        labels,
        income: income.map((value) => rounded(value, currency)),
        expense: expense.map((value) => rounded(value, currency)),
        unit,
    };
}

function groupedAccounts(
    entries: readonly AccountEntry[],
    currency: Currency,
    field: 'characterId' | 'channel',
) {
    const groups = new Map<string, { id: string; income: number; expense: number; net: number }>();
    for (const one of entries) {
        if (one.currency !== currency) continue;
        const id = one[field];
        const group = groups.get(id) ?? {
            id,
            income: 0,
            expense: 0,
            net: 0,
        };
        group[one.kind] += one.amount;
        groups.set(id, group);
    }
    return [...groups.values()]
        .map((one) => ({
            ...one,
            income: rounded(one.income, currency),
            expense: rounded(one.expense, currency),
            net: rounded(one.income - one.expense, currency),
        }))
        .sort((a, b) => b.income + b.expense - (a.income + a.expense) || a.id.localeCompare(b.id));
}

export function characterAccounts(entries: readonly AccountEntry[], currency: Currency) {
    return groupedAccounts(entries, currency, 'characterId');
}

export function channelAccounts(entries: readonly AccountEntry[], currency: Currency) {
    return groupedAccounts(entries, currency, 'channel');
}

/** 先按分类索引快捷项，手记只遍历一次；相同预设仍各自得到一份总额。 */
export function shortcutTotals(
    entries: readonly AccountEntry[],
    presets: readonly Shortcut['preset'][],
) {
    const totals = presets.map(() => ({
        cash: { amount: 0, count: 0 },
        rmb: { amount: 0, count: 0 },
    }));
    const byCategory = new Map<string, number[]>();
    presets.forEach((preset, index) => {
        const list = byCategory.get(preset.category);
        if (list) list.push(index);
        else byCategory.set(preset.category, [index]);
    });
    for (const one of entries) {
        if (one.source === 'auto') continue;
        for (const index of byCategory.get(one.category) ?? []) {
            const preset = presets[index];
            if (one.kind !== preset.kind) continue;
            totals[index][one.currency].amount += one.amount;
            totals[index][one.currency].count += 1;
        }
    }
    return totals.map((total) => ({
        cash: { ...total.cash, amount: rounded(total.cash.amount, 'cash') },
        rmb: { ...total.rmb, amount: rounded(total.rmb.amount, 'rmb') },
    }));
}

/** 每个角色的收入、支出各自按分类拆分；段额之和与角色汇总同口径。 */
export function characterCategoryAccounts(entries: readonly AccountEntry[], currency: Currency) {
    const scoped = entries.filter((one) => one.currency === currency);
    const categories = [...new Set(scoped.map((one) => one.category))].sort((left, right) => {
        const rank = (name: string) => {
            const index = (ACCOUNT_CATEGORIES as readonly string[]).indexOf(name);
            return index < 0 ? ACCOUNT_CATEGORIES.length : index;
        };
        return rank(left) - rank(right) || left.localeCompare(right, 'zh-CN');
    });
    const groups = new Map<string, Map<string, number>>();
    for (const one of scoped) {
        const key = JSON.stringify([one.characterId, one.kind]);
        const group = groups.get(key) ?? new Map<string, number>();
        group.set(one.category, (group.get(one.category) ?? 0) + one.amount);
        groups.set(key, group);
    }
    const rows = characterAccounts(scoped, currency).map((one) => {
        const segments = (kind: 'income' | 'expense') => {
            const group = groups.get(JSON.stringify([one.id, kind]));
            return categories.flatMap((category) => {
                const amount = rounded(group?.get(category) ?? 0, currency);
                return amount > 0 ? [{ category, amount }] : [];
            });
        };
        return { ...one, incomeSegments: segments('income'), expenseSegments: segments('expense') };
    });
    return { categories, rows };
}
