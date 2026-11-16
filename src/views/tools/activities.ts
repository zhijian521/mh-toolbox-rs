/** 活动日历算法与闹钟换算。活动表见 public/game/data/activities.json。 */
import { pad2 } from '../../services/clock';
import { LEAD_MS, type AlarmDraft } from './alarms';
import type { Activity, ActivitySlot } from '../../services/game-activities';
import {
    activityOccursOn,
    activityRuleText,
    activitySlotText,
} from '../../services/game-activities';
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
    return activityOccursOn(activity, date);
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
    const yesterday = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
    if (
        occursOn(activity, yesterday) &&
        activity.slots.some(
            (slot) =>
                slot.nextDay &&
                minutesOf(slot.end ?? '') > from.getHours() * 60 + from.getMinutes(),
        )
    ) {
        return new Date(from);
    }
    for (let offset = 0; offset < 70; offset += 1) {
        const day = new Date(from);
        day.setDate(from.getDate() + offset);
        if (!occursOn(activity, day)) continue;

        /* 今天这一场已经结束就往后找。整点类没有「结束」，永远算还没过。 */
        if (offset === 0) {
            const now = from.getHours() * 60 + from.getMinutes();
            const last = activity.slots.length
                ? activity.slots.reduce(
                      (max, slot) =>
                          Math.max(
                              max,
                              slot.end
                                  ? minutesOf(slot.end) + (slot.nextDay ? 1440 : 0)
                                  : minutesOf(slot.start),
                          ),
                      0,
                  )
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
    return activity.slots.map(activitySlotText).join('、');
}

/** 规则那行：不含时刻，只说「多久来一次」。 */
export function repeatText(activity: Activity): string {
    return activityRuleText(activity);
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
 * 闹钟只保存活动 ID 与开场时刻，日期始终按同一份活动规则推算。
 */
export function remindDraft(activity: Activity, slot: ActivitySlot): AlarmDraft {
    const rule = activity.rule;

    return {
        time: rule.type === 'hourly' ? `00:${pad2(rule.minute)}` : slot.start,
        label: activity.name,
        repeat: 'activity',
        activityId: activity.id,
        weekdays: [],
        date: '',
    };
}

/** 默认选择下一次还来得及提前提醒的场次，而不是固定第一场。 */
export function upcomingSlot(activity: Activity, now: Date): string {
    for (let offset = 0; offset < 70; offset += 1) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        if (!occursOn(activity, day)) continue;
        const starts = [...activity.slots].sort((a, b) => a.start.localeCompare(b.start));
        for (const slot of starts) {
            const at = new Date(day);
            at.setMinutes(minutesOf(slot.start));
            if (at.getTime() - LEAD_MS > now.getTime()) return slot.start;
        }
    }
    return activity.slots[0]?.start ?? '';
}

/**
 * 加提醒之前该说的一句话。空串表示没有要提醒的。
 *
 * 按月活动持续按规则提醒；随机和需要本帮开启的活动仍需明确条件。
 *  其余活动（每周固定、每天固定时段）不必多说——怎样响从规则本身就读得出来。
 */
export function remindNote(activity: Activity): string {
    const rule = activity.rule;

    if (activity.fuzzy) {
        return '时段是随机的，提醒落在开始的整点，不等于活动就在那一刻开。';
    }
    if (rule.type === 'hourly') {
        return '每小时都提醒一次，一直到你把这条闹钟关掉。';
    }
    if (rule.type === 'monthWeek') return '按活动日期持续提醒，无需每月重新设置。';
    if (rule.type === 'weekly' && rule.extra) return activity.note ?? '';
    return '';
}
