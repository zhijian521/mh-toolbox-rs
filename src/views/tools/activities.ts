/**
 * 活动日历：活动表、判定、文案、以及与闹钟的换算。
 *
 * ---- 为什么数据写死在代码里 ----
 *
 * 24 条活动是**游戏规则**，不是用户数据：网页关掉它们也在，版本更新时才变。放进
 * `localStorage` 或数据库只会多一份会和代码对不上的副本。所以它是一张常量表，
 * 与 `public/game/data/*.json` 那批（一两千条、随包分发）不同——那些太大不宜进源码，
 * 这批小到一屏能读完，放代码里反而好改好审。
 *
 * ---- 规则只有四种形态 ----
 *
 * `每小时`（整点类）/ `每天` / `每周的周几` / `每月第几周周几`。官方那四栏
 * （每日、周末、帮战、PK）全部落得进这四种，所以不必为「帮战只在第 2、3、4 周」
 * 单开一类——它就是「每月第几个周几」的多次版。
 *
 * ---- 与闹钟的关系只在一个函数里 ----
 *
 * `remindDraft()` 把「这条活动的这一段」翻成一份 `AlarmDraft`。翻不动的只有一种：
 * 「每月第几周」在闹钟那边没有对应（闹钟只有每天/每小时/每周/仅一次），
 * 于是退成「仅一次 + 下一次的日期」。这件事必须让用户知道，所以另有 `remindNote()`。
 */
import { dateText } from '../../services/format';
import { pad2 } from '../../services/clock';
import type { AlarmDraft } from './alarms';

/** 类别：决定卡片块面的淡染色相与时刻那一行的颜色。 */
export type ActivityTone = 'daily' | 'week' | 'war' | 'month';

export type ActivityRule =
    /** 整点类：每小时的第几分来一场。 */
    | { type: 'hourly'; minute: number }
    /** 每天，时段固定（可能有好几段）。 */
    | { type: 'daily' }
    /** 每周的某几天。 */
    | { type: 'weekly'; weekdays: number[] }
    /** 每月第几周的哪几天（`weeks` 与 `weekdays` 一起定下「哪几天」）。
     *  `weekdays` 是数组而不是单个数：决战华山在无帮战的那两周里**周五到周日都有场**，
     *  只写一个数会让「下一次」漏掉周末两天。 */
    | { type: 'monthWeek'; weeks: number[]; weekdays: number[] };

export interface ActivitySlot {
    /** `HH:mm`。 */
    start: string;
    end: string;
}

export interface Activity {
    id: string;
    name: string;
    tone: ActivityTone;
    rule: ActivityRule;
    /** 时段。整点类为空数组——它没有「一段」，只有「每小时都有一场」。 */
    slots: ActivitySlot[];
    /** 一句补充，写在卡片第三行。 */
    note?: string;
    /** 时段是随机的（师门守卫那样），不是准点开场。 */
    fuzzy?: boolean;
    /** 官网攻略库之外的补充来源，卡片上会标「据玩家整理」。 */
    playerSourced?: boolean;
}

/* ============================================================
   活动表
   ============================================================
   来源：官网活动攻略库（每日 / 周末 / 帮战 / PK 四栏），加官网说明页补的三条日常
   （师门守卫、衣冠古丘、二十八星宿）。带 `playerSourced` 的五条来自玩家攻略，
   官网那几页没写，版本一变就可能不准。
*/
export const ACTIVITIES: Activity[] = [
    /* ---- 每天 ---- */
    {
        id: 'stars',
        name: '二十八星宿',
        tone: 'daily',
        rule: { type: 'hourly', minute: 0 },
        slots: [],
        note: '每次七个，存在一小时',
    },
    {
        id: 'star-dust',
        name: '星辰碎片',
        tone: 'daily',
        rule: { type: 'hourly', minute: 10 },
        slots: [],
        playerSourced: true,
    },
    {
        id: 'turtle',
        name: '小龟快跑',
        tone: 'daily',
        rule: { type: 'daily' },
        slots: [
            { start: '12:00', end: '12:30' },
            { start: '22:00', end: '22:30' },
        ],
    },
    {
        id: 'yiguan',
        name: '衣冠古丘',
        tone: 'daily',
        rule: { type: 'daily' },
        slots: [
            { start: '14:00', end: '14:30' },
            { start: '16:00', end: '16:30' },
            { start: '18:00', end: '18:30' },
            { start: '20:00', end: '20:30' },
            { start: '22:00', end: '22:30' },
        ],
        note: '每天投五次，半小时内可进',
    },
    {
        id: 'disha',
        name: '地煞星',
        tone: 'daily',
        rule: { type: 'daily' },
        slots: [
            { start: '12:00', end: '13:00' },
            { start: '18:00', end: '19:00' },
        ],
        playerSourced: true,
    },
    {
        id: 'sect-guard',
        name: '师门守卫',
        tone: 'daily',
        rule: { type: 'daily' },
        slots: [{ start: '12:00', end: '22:00' }],
        fuzzy: true,
        playerSourced: true,
    },

    /* ---- 每周固定 ---- */
    {
        id: 'food',
        name: '天下美食',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [1, 2, 3, 4] },
        slots: [{ start: '19:30', end: '21:10' }],
    },
    {
        id: 'maze',
        name: '帮派迷宫',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [1, 3, 6] },
        slots: [{ start: '20:00', end: '21:00' }],
    },
    {
        id: 'treasure',
        name: '幻境寻宝',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [2, 4, 0] },
        slots: [{ start: '20:00', end: '21:00' }],
    },
    {
        id: 'qiankun',
        name: '乾坤盘对抗赛',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [3] },
        slots: [{ start: '19:30', end: '20:00' }],
    },
    {
        id: 'card-war',
        name: '卡牌风云赛',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [3] },
        slots: [{ start: '20:00', end: '21:10' }],
    },
    {
        id: 'fishing',
        name: '钓鱼大赛',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [4] },
        slots: [{ start: '20:00', end: '22:00' }],
    },
    {
        id: 'cixin',
        name: '慈心渡鬼',
        tone: 'week',
        rule: { type: 'weekly', weekdays: [6] },
        slots: [{ start: '10:00', end: '11:30' }],
        playerSourced: true,
    },
    {
        id: 'subdue',
        name: '降妖伏魔',
        tone: 'month',
        rule: { type: 'weekly', weekdays: [6] },
        slots: [{ start: '15:00', end: '17:00' }],
        note: '俗称铃铛',
    },
    {
        id: 'dream',
        name: '寻梦追忆',
        tone: 'week',
        rule: { type: 'monthWeek', weeks: [1, 5], weekdays: [6] },
        slots: [{ start: '19:30', end: '21:30' }],
        playerSourced: true,
    },

    /* ---- 帮战 ---- */
    {
        id: 'war-build',
        name: '帮战 · 建设',
        tone: 'war',
        rule: { type: 'monthWeek', weeks: [2, 3, 4], weekdays: [5] },
        slots: [{ start: '20:30', end: '22:00' }],
    },
    {
        id: 'war-race',
        name: '帮战 · 竞赛',
        tone: 'war',
        rule: { type: 'monthWeek', weeks: [2, 3, 4], weekdays: [6] },
        slots: [{ start: '20:30', end: '22:00' }],
    },
    {
        id: 'war-flag',
        name: '帮战 · 夺旗',
        tone: 'war',
        rule: { type: 'monthWeek', weeks: [2, 3, 4], weekdays: [0] },
        slots: [{ start: '20:30', end: '22:00' }],
    },
    {
        id: 'huashan',
        name: '决战华山',
        tone: 'war',
        rule: { type: 'monthWeek', weeks: [1, 5], weekdays: [5, 6, 0] },
        slots: [{ start: '19:30', end: '22:00' }],
        note: '只在没有帮战的那两周',
        playerSourced: true,
    },

    /* ---- 每月第几周周日 ---- */
    {
        id: 'sect-run',
        name: '门派闯关',
        tone: 'month',
        rule: { type: 'monthWeek', weeks: [1], weekdays: [0] },
        slots: [{ start: '15:00', end: '17:00' }],
    },
    {
        id: 'exam',
        name: '科举大赛',
        tone: 'month',
        rule: { type: 'monthWeek', weeks: [2], weekdays: [0] },
        slots: [{ start: '12:00', end: '17:00' }],
    },
    {
        id: 'rainbow',
        name: '彩虹争霸赛',
        tone: 'month',
        rule: { type: 'monthWeek', weeks: [3], weekdays: [0] },
        slots: [{ start: '15:00', end: '17:00' }],
    },
    {
        id: 'hero',
        name: '英雄大会',
        tone: 'month',
        rule: { type: 'monthWeek', weeks: [4], weekdays: [0] },
        slots: [{ start: '13:00', end: '18:00' }],
    },
    {
        id: 'changan',
        name: '长安保卫战',
        tone: 'month',
        rule: { type: 'monthWeek', weeks: [5], weekdays: [0] },
        slots: [{ start: '14:00', end: '17:00' }],
    },
];

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
