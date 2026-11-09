import { isObject } from './shape';

export type ActivityTone = 'daily' | 'week' | 'war' | 'month';
export type ActivityRule =
    | { type: 'hourly'; minute: number }
    | { type: 'daily' }
    | { type: 'weekly'; weekdays: number[] }
    | { type: 'monthWeek'; weeks: number[]; weekdays: number[] };
export interface ActivitySlot {
    start: string;
    end: string;
}
export interface Activity {
    id: string;
    name: string;
    tone: ActivityTone;
    rule: ActivityRule;
    slots: ActivitySlot[];
    note?: string;
    fuzzy?: boolean;
    playerSourced?: boolean;
}
export let ACTIVITIES: Activity[] = [];

/** 周期与时刻在资源入口校验，日历算法只接收完整的活动。 */
export function parseActivities(raw: unknown): Activity[] {
    if (!Array.isArray(raw)) throw new TypeError('activities.json：应为数组');
    const seen = new Set<string>();
    const validText = (value: unknown): value is string =>
        typeof value === 'string' && Boolean(value.trim());
    const indices = (value: unknown, low: number, high: number): value is number[] =>
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((one) => Number.isInteger(one) && one >= low && one <= high);
    const time = (value: unknown): value is string =>
        typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    return raw.map((value) => {
        if (
            !isObject(value) ||
            !validText(value.id) ||
            !validText(value.name) ||
            !['daily', 'week', 'war', 'month'].includes(String(value.tone)) ||
            seen.has(value.id) ||
            !isObject(value.rule) ||
            !Array.isArray(value.slots)
        ) {
            throw new TypeError('activities.json：活动字段无效或 id 重复');
        }
        seen.add(value.id);
        const rule = value.rule;
        if (!(
            rule.type === 'daily' ||
            (rule.type === 'hourly' &&
                Number.isInteger(rule.minute) &&
                Number(rule.minute) >= 0 &&
                Number(rule.minute) <= 59) ||
            (rule.type === 'weekly' && indices(rule.weekdays, 0, 6)) ||
            (rule.type === 'monthWeek' && indices(rule.weekdays, 0, 6) && indices(rule.weeks, 1, 5))
        )) {
            throw new TypeError(`activities.json：${value.id} 的周期无效`);
        }
        const slots = value.slots.map((slot) => {
            if (!isObject(slot) || !time(slot.start) || !time(slot.end) || slot.start >= slot.end) {
                throw new TypeError(`activities.json：${value.id} 的时段无效`);
            }
            return { start: slot.start, end: slot.end };
        });
        return {
            id: value.id,
            name: value.name,
            tone: value.tone as ActivityTone,
            rule: { ...rule } as ActivityRule,
            slots,
            note: validText(value.note) ? value.note : undefined,
            fuzzy: value.fuzzy === true || undefined,
            playerSourced: value.playerSourced === true || undefined,
        };
    });
}

/** game-data 校验所有资源成功后统一提交。 */
export function installActivities(activities: Activity[]): void {
    ACTIVITIES = activities;
}
