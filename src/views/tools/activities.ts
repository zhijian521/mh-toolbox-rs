/** 活动日历算法与闹钟换算。活动表见 public/game/data/activities.json。 */
import { dateText } from '../../services/format';
import { pad2 } from '../../services/clock';
import type { AlarmDraft } from './alarms';
import type { Activity, ActivitySlot } from '../../services/game-activities';
export { ACTIVITIES } from '../../services/game-activities';
export type {
    Activity,
    ActivityRule,
    ActivitySlot,
    ActivityTone,
} from '../../services/game-activities';

/** 中文的星期名，按 `getDay()` 编号取。 */
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayName(day: number): string {
    return `周${WEEKDAY_NAMES[day] ?? '?'}`;
}

/* ============================================================
   判定
   ============================================================ */

const minutesOf = (text: string): number => {
    const [hour, minute] = text.split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
};

/** 这一天是本月第几个「该星期几」。按日期除以 7 取整，与游戏内的轮换口径一致。 */
export function nthWeekday(date: Date): number {
    return Math.ceil(date.getDate() / 7);
}

/** 这一天有没有这条活动。 */
export function occursOn(activity: Activity, date: Date): boolean {
    const weekday = date.getDay();
    const rule = activity.rule;

    if (rule.type === 'daily' || rule.type === 'hourly') return true;
    if (rule.type === 'weekly') return rule.weekdays.includes(weekday);

    return rule.weekdays.includes(weekday) && rule.weeks.includes(nthWeekday(date));
}

/**
 * 下一次发生（含今天）。
 *
 * 往后找 70 天。为什么不是 40：「每月第 5 周周日」这类，2 月里根本不存在（28 天最多
 * 四个周日），从 1 月末往后数要跨过整整两个月才轮得到，40 天够不着，那条会显示成
 * 「本月已过」——它其实不是「过了」，是这个月还没有。70 天留了余量。
 *
 * 真的找不到才返回 `null`（理论上不会：任何一条规则在 70 天内必有一次）。
 * 那时卡片写「本月已过」，比编一个日期出来诚实。
 */
export function nextOccurrence(activity: Activity, from: Date): Date | null {
    for (let offset = 0; offset < 70; offset += 1) {
        const day = new Date(from);
        day.setDate(from.getDate() + offset);
        if (!occursOn(activity, day)) continue;

        /* 今天这一场已经结束就往后找。整点类没有「结束」，永远算还没过。 */
        if (offset === 0) {
            const now = from.getHours() * 60 + from.getMinutes();
            const last = activity.slots.length
                ? activity.slots.reduce((max, slot) => Math.max(max, minutesOf(slot.end)), 0)
                : 24 * 60;
            if (last <= now) continue;
        }
        return day;
    }
    return null;
}

/* ============================================================
   文案
   ============================================================ */

/** 时刻那行：「12:00–17:00」「每个整点」「每小时的 10 分」。 */
export function timesText(activity: Activity): string {
    const rule = activity.rule;

    if (rule.type === 'hourly') {
        return rule.minute === 0 ? '每个整点' : `每小时的 ${rule.minute} 分`;
    }
    return activity.slots.map((slot) => `${slot.start}–${slot.end}`).join('、');
}

/** 规则那行：不含时刻，只说「多久来一次」。 */
export function repeatText(activity: Activity): string {
    const rule = activity.rule;

    if (rule.type === 'daily' || rule.type === 'hourly') return '每天';
    if (rule.type === 'weekly') {
        return `每周${rule.weekdays.map((day) => WEEKDAY_NAMES[day]).join('、')}`;
    }

    const weeks = rule.weeks.join('、');
    const days = rule.weekdays.map(weekdayName).join('、');
    return `每月第 ${weeks} 周${days}`;
}

/* ============================================================
   分组（方案丙：今天 / 明天 / 本周内 / 之后 / 每天）
   ============================================================ */

export type GroupKey = 'today' | 'tomorrow' | 'week' | 'later' | 'daily';

export interface GroupedActivity {
    activity: Activity;
    next: Date | null;
}

export interface ActivityGroup {
    key: GroupKey;
    title: string;
    items: GroupedActivity[];
}

const GROUP_TITLES: { key: GroupKey; title: string }[] = [
    { key: 'today', title: '今天' },
    { key: 'tomorrow', title: '明天' },
    { key: 'week', title: '本周内' },
    { key: 'later', title: '之后' },
    { key: 'daily', title: '每天' },
];

const dayStart = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 差几个日历日。用「零点之间差多少天」，不是「两个时刻差多久再四舍五入」——
 *  后者在下午会算错一天（21:00 与明天 10:00 只差 13 小时，四舍五入成 1 天是运气好）。 */
export function dayGap(from: Date, to: Date): number {
    return Math.round((dayStart(to) - dayStart(from)) / 86_400_000);
}

/**
 * 按「最近一次」分五组。
 *
 * 顺序是固定的（今天 → 明天 → 本周内 → 之后 → 每天），空组不返回。每天那一批永远
 * 排在最后：它们是背景，不是这周要赶的事。
 */
export function groupActivities(activities: readonly Activity[], now: Date): ActivityGroup[] {
    const buckets = new Map<GroupKey, GroupedActivity[]>(GROUP_TITLES.map((one) => [one.key, []]));

    for (const activity of activities) {
        const dailyish = activity.rule.type === 'daily' || activity.rule.type === 'hourly';
        const next = nextOccurrence(activity, now);

        if (dailyish) {
            buckets.get('daily')?.push({ activity, next });
            continue;
        }
        if (!next) {
            buckets.get('later')?.push({ activity, next: null });
            continue;
        }

        const gap = dayGap(now, next);
        if (gap === 0) buckets.get('today')?.push({ activity, next });
        else if (gap === 1) buckets.get('tomorrow')?.push({ activity, next });
        else if (gap <= 6) buckets.get('week')?.push({ activity, next });
        else buckets.get('later')?.push({ activity, next });
    }

    /* 「之后」按日期升序：不排的话是表里的原始顺序，十月末的排在十一月前头。 */
    buckets.get('later')?.sort((a, b) => (a.next?.getTime() ?? 0) - (b.next?.getTime() ?? 0));

    return GROUP_TITLES.map(({ key, title }) => ({
        key,
        title,
        items: buckets.get(key) ?? [],
    })).filter((one) => one.items.length > 0);
}

/* ============================================================
   与闹钟的换算
   ============================================================ */

/**
 * 把「这条活动的这一段」翻成一份闹钟草稿。
 *
 * 只提醒**开始时刻**：活动结束不需要人上线。多段的活动由调用方先选一段——一次
 * 加五个闹钟（衣冠古丘一天五场）只会把用户自己的闹钟列表变成噪声。
 *
 * 「每月第几周」在闹钟那边没有对应，退成「仅一次 + 下一次的日期」。这是唯一的
 * 有损换算，所以界面上必须说出来（见 `remindNote`）。
 */
export function remindDraft(activity: Activity, slot: ActivitySlot, now: Date): AlarmDraft {
    const rule = activity.rule;

    if (rule.type === 'hourly') {
        return {
            time: `00:${pad2(rule.minute)}`,
            label: activity.name,
            repeat: 'hourly',
            weekdays: [],
            date: '',
        };
    }

    if (rule.type === 'weekly') {
        return {
            time: slot.start,
            label: activity.name,
            repeat: 'weekly',
            weekdays: [...rule.weekdays],
            date: '',
        };
    }

    if (rule.type === 'daily') {
        return {
            time: slot.start,
            label: activity.name,
            repeat: 'daily',
            weekdays: [],
            date: '',
        };
    }

    const next = nextOccurrence(activity, now);
    return {
        time: slot.start,
        label: activity.name,
        repeat: 'once',
        weekdays: [],
        date: next ? dateText(next) : '',
    };
}

/**
 * 加提醒之前该说的一句话。空串表示没有要提醒的。
 *
 * 三种情况各有一句：换算有损（每月轮换）、时段随机、整点类会一直响。
 *  其余活动（每周固定、每天固定时段）不必多说——怎样响从规则本身就读得出来。
 */
export function remindNote(activity: Activity): string {
    const rule = activity.rule;

    if (rule.type === 'monthWeek') {
        return '这类活动按月轮换，闹钟只能记到「下一次」那一天；那天过后要回来再点一次。';
    }
    if (activity.fuzzy) {
        return '时段是随机的，提醒落在开始的整点，不等于活动就在那一刻开。';
    }
    if (rule.type === 'hourly') {
        return '每小时都提醒一次，一直到你把这条闹钟关掉。';
    }
    return '';
}
