import { isObject } from './shape';

export type ActivityTone = 'daily' | 'week' | 'war' | 'month';
interface MonthPattern {
    weeks: number[];
    weekdays: number[];
    /** 周末统一按所属周日计次，跨月时归到那个周日所在的月份。 */
    anchorWeekday?: number;
}
export type ActivityRule =
    | { type: 'hourly'; minute: number }
    | { type: 'daily' }
    | { type: 'weekly'; weekdays: number[]; extra?: MonthPattern }
    | ({ type: 'monthWeek' } & MonthPattern);
export interface ActivitySlot {
    start: string;
    /** 没有固定结束时刻时只记开场，不推测活动时长。 */
    end?: string;
    nextDay?: boolean;
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
    const monthPattern = (value: unknown): boolean =>
        isObject(value) &&
        indices(value.weeks, 1, 5) &&
        indices(value.weekdays, 0, 6) &&
        (value.anchorWeekday === undefined ||
            (Number.isInteger(value.anchorWeekday) &&
                Number(value.anchorWeekday) >= 0 &&
                Number(value.anchorWeekday) <= 6));
    return raw.map((value) => {
        if (
            !isObject(value) ||
            !validText(value.id) ||
            !/^[a-z0-9-]+$/.test(value.id) ||
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
            (rule.type === 'weekly' &&
                indices(rule.weekdays, 0, 6) &&
                (rule.extra === undefined || monthPattern(rule.extra))) ||
            (rule.type === 'monthWeek' && monthPattern(rule))
        )) {
            throw new TypeError(`activities.json：${value.id} 的周期无效`);
        }
        const slots = value.slots.map((slot) => {
            if (
                !isObject(slot) ||
                !time(slot.start) ||
                (slot.nextDay !== undefined && typeof slot.nextDay !== 'boolean') ||
                (slot.end === undefined
                    ? slot.nextDay === true
                    : !time(slot.end) ||
                      (slot.nextDay === true ? slot.end >= slot.start : slot.start >= slot.end))
            ) {
                throw new TypeError(`activities.json：${value.id} 的时段无效`);
            }
            return {
                start: slot.start,
                end: slot.end as string | undefined,
                nextDay: slot.nextDay === true || undefined,
            };
        });
        if (
            (rule.type !== 'hourly' && !slots.length) ||
            new Set(slots.map((slot) => slot.start)).size !== slots.length
        ) {
            throw new TypeError(`activities.json：${value.id} 的时段缺失或重复`);
        }
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

/** 日历和闹钟共用同一周期判定，不能把按月或有条件的活动简化为每周。 */
export function activityOccursOn(activity: Activity, date: Date): boolean {
    const matches = (pattern: MonthPattern): boolean => {
        if (!pattern.weekdays.includes(date.getDay())) return false;
        const anchor = new Date(date);
        if (pattern.anchorWeekday !== undefined) {
            anchor.setDate(date.getDate() + ((pattern.anchorWeekday - date.getDay() + 7) % 7));
        }
        return pattern.weeks.includes(Math.ceil(anchor.getDate() / 7));
    };
    const rule = activity.rule;
    if (rule.type === 'daily' || rule.type === 'hourly') return true;
    if (rule.type === 'weekly') {
        return rule.weekdays.includes(date.getDay()) || Boolean(rule.extra && matches(rule.extra));
    }
    return matches(rule);
}

export function activitySlotText(slot: ActivitySlot): string {
    return slot.end
        ? `${slot.start}–${slot.nextDay ? '次日 ' : ''}${slot.end}`
        : `${slot.start} 开始`;
}

export function activityRuleText(activity: Activity): string {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    const rule = activity.rule;
    if (rule.type === 'daily' || rule.type === 'hourly') return '每天';
    const days = (values: number[]) => values.map((day) => `周${names[day]}`).join('、');
    if (rule.type === 'weekly') {
        const base = `每${days(rule.weekdays)}`;
        return rule.extra
            ? `${base}；每月第 ${rule.extra.weeks.join('、')} 个周末的${days(rule.extra.weekdays)}`
            : `每周${rule.weekdays.map((day) => names[day]).join('、')}`;
    }
    return rule.anchorWeekday === undefined
        ? `每月第 ${rule.weeks.join('、')} 周${days(rule.weekdays)}`
        : `每月第 ${rule.weeks.join('、')} 个周末${days(rule.weekdays)}`;
}
