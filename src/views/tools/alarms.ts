/**
 * 闹钟：一条记录长什么样、什么时候该提醒。
 *
 * ---- 与「记录一笔账」不同，这里只有一件事要算准 ----
 *
 * 提醒点在**响铃前一分钟**。单看这条很短，但跨日一进来就不直白了：`00:00` 的闹钟要
 * 提前到**前一天 23:59** 提醒。所以除时间之外，这里所有函数都以「响的那一天」为参数，
 * 由调用方决定是哪天——`00:00` 这一类才不会差一天。
 *
 * ---- 四种重复，共用一个 `time` ----
 *
 * `每天` / `每小时` / `每周` / `仅一次`。四者只在「哪些天响、一天响几次」上不同，
 * 所以不必各存一套字段：`time` 一律是 `HH:mm`，`每周` 另带 `weekdays`，`仅一次` 另带
 * `date`；**`每小时` 只用 `time` 的分钟部分**（小时固定 `00` 占位）——它的语义是
 * 「每小时的第几分」，存一个完整的 `HH:mm` 里那一半没用的数字反而容易读错。
 *
 * ---- 为什么记 `fired` 是「哪一次的键」，不是「哪一天」 ----
 *
 * `每天` `每周` `仅一次` 一天只响一次，记日期就够；但 `每小时` 一天响 24 次，
 * 只记日期的话，第二次开始就再也提醒不了。所以键统一成 `<日期> <时刻>`：
 *
 *     2026-11-08 07:30
 *
 * 四种模式都用它判重，逻辑不必分叉。旧档里只存了日期（上一版只有「每天」和「仅一次」），
 * 读档时补上时刻——不补的话升上来那一刻会认为「今天没提醒过」，把当天那次再弹一遍。
 *
 * ---- 这个文件不碰存储、不碰界面 ----
 *
 * 读写规则在 `alarm-store.ts`，计时与弹出在 `AlarmHost.vue`。这里全是纯函数，
 * 所以上面那几条跨日口径能被单测钉住（`alarms.test.ts`）。
 */
import { normalizeTime, pad2 } from '../../services/clock';
import { dateText, daysAgo, parseDay } from '../../services/format';

export type AlarmRepeat = 'daily' | 'hourly' | 'weekly' | 'once';

/**
 * 只读看待一条闹钟时的形状。
 *
 * 页面拿到的是 `readonly(alarms)`，元素里连 `weekdays` 都是 `readonly number[]`。
 * 而「算下一次什么时候响」本来就不该改数据，所以这些函数的入参一律要这一份窄接口，
 * 而不是可变的 `Alarm`——否则页面每次都得先摊一份副本才能问一句「还有多久」。
 *
 * `Alarm` 实现它（`number[]` 可赋给 `readonly number[]`），两边不必写两份字段。
 */
export interface AlarmLike {
    readonly id: number;
    readonly time: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly repeat: AlarmRepeat;
    readonly weekdays: readonly number[];
    readonly date: string;
    readonly fired: string;
}

export interface Alarm extends AlarmLike {
    id: number;
    /** 响的时刻，`HH:mm`。`hourly` 时小时部分是占位的 `00`，只有分钟有意义。 */
    time: string;
    /** 备注，可以是空串。 */
    label: string;
    enabled: boolean;
    repeat: AlarmRepeat;
    /** `weekly` 专用：星期几，**0 = 周日**（与 `Date.getDay()` 同一套编号）。其他模式为空数组。 */
    weekdays: number[];
    /** 仅 `once` 有意义：响的那一天（`YYYY-MM-DD`）。 */
    date: string;
    /** 已经提醒过的那一次的键（`YYYY-MM-DD HH:mm`）。空串 = 还没提醒过。 */
    fired: string;
}

export interface AlarmDraft {
    time: string;
    label: string;
    repeat: AlarmRepeat;
    weekdays: number[];
    date: string;
}

/** 一次提醒命中：哪个闹钟、是哪一次的键、什么时候该提醒。 */
export interface DueHit {
    alarm: AlarmLike;
    /** 这一刻的键（`YYYY-MM-DD HH:mm`），记 `fired` 用它。 */
    key: string;
    remindAt: Date;
}

/** 备注上限。卡片一行放得下十来个字，多出来的会折行把卡顶高。 */
export const LABEL_LIMIT = 20;

/** 提前量：一分钟。 */
export const LEAD_MS = 60_000;

/** 同时最多几个闹钟：一张卡片一个，再多就得分页，而这一页没有分页的理由。 */
export const MAX_ALARMS = 12;

/**
 * 星期几的选项：**显示顺序是「一 … 六、日」**，值仍是 `getDay()` 那套（周日 0）。
 *
 * 显示与取值分开的理由：中文里一周从头是周一，而 JS 里 0 是周日。若为了显示顺序去改
 * 编号（把周日存成 6），每次和 `Date.getDay()` 比对都要加一次换算——那正是出错的地方。
 */
export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
    { value: 1, label: '一' },
    { value: 2, label: '二' },
    { value: 3, label: '三' },
    { value: 4, label: '四' },
    { value: 5, label: '五' },
    { value: 6, label: '六' },
    { value: 0, label: '日' },
];

/**
 * 按重复方式把时间收成最终存的 `HH:mm`；认不出返回 `null`。
 *
 * `每小时` 只留分钟，小时写死 `00`：它的语义是「每小时的第几分」。这一步放在这里而不是
 * 界面上，是因为存进去的值只有这一个真源——界面按模式切成两种输入，落盘却是同一个字段。
 *
 * **`每小时` 还要认裸分钟**（`30` 就是第 30 分）：那一格在界面上只填分钟，
 * 让用户为了通过校验把它敲成 `00:30` 是在替校验器写表单。
 */
export function alarmTime(repeat: AlarmRepeat, raw: string): string | null {
    const text = (raw ?? '').trim();
    if (repeat === 'hourly' && /^\d{1,2}$/.test(text)) {
        const minute = Number(text);
        return minute <= 59 ? `00:${pad2(minute)}` : null;
    }
    const time = normalizeTime(text);
    if (!time) return null;
    return repeat === 'hourly' ? `00:${time.slice(3)}` : time;
}

/** `HH:mm` → 一天里的第几分钟。用于排顺序与算时刻。 */
export function minuteOf(time: string): number {
    const [hour, minute] = time.split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
}

/** `YYYY-MM-DD` 是不是一个像样的日子。只校验形状——`2026-02-31` 这类由 `parseDay` 进位，不拦。 */
export function isDayText(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 那天是星期几（0 = 周日）。`getDay()` 的本地口径。 */
export function weekdayOf(day: string): number {
    return parseDay(day).getDay();
}

/**
 * 某一天这个闹钟**响**的时刻。
 *
 * 用 `new Date(y, m, d, 0, 分钟数)` 而不是「日期 + 毫秒」：分钟数超过 59 会自己进位到
 * 小时，跨夏令时的时区也不会差一小时——这两种都交给日期构造器算，它已经处理过。
 */
export function fireAt(alarm: AlarmLike, day: string): Date {
    const at = parseDay(day);
    return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, minuteOf(alarm.time), 0, 0);
}

/** 某一天的**提醒**时刻 = 响的时刻早一分钟。`00:00` 的闹钟因此落在前一天 23:59。 */
export function reminderAt(alarm: AlarmLike, day: string): Date {
    return new Date(fireAt(alarm, day).getTime() - LEAD_MS);
}

/** 一次提醒的键：`<日期> <时刻>`。`fired` 用它判重，四种模式共用一个形状。 */
export function firedKey(day: string, at: Date): string {
    return `${day} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/**
 * 这一天该响的**全部**时刻。多数模式只有一次，`每小时` 有 24 次。
 *
 * 这是四种模式唯一分歧的地方，其余函数都建在它上面——`dueAlarms` 扫它、
 * `nextReminder` 挑它、卡片算倒计时也走它。若把「每天 / 每周 / 每小时」写成三套判断，
 * 同一个跨日口径就要抄三遍。
 */
export function occurrences(alarm: AlarmLike, day: string): Date[] {
    const weekday = weekdayOf(day);
    switch (alarm.repeat) {
        case 'daily':
            return [fireAt(alarm, day)];
        case 'weekly':
            return alarm.weekdays.includes(weekday) ? [fireAt(alarm, day)] : [];
        case 'once':
            return alarm.date === day ? [fireAt(alarm, day)] : [];
        case 'hourly': {
            const minute = minuteOf(alarm.time) % 60;
            const at = parseDay(day);
            return Array.from(
                { length: 24 },
                (_, hour) =>
                    new Date(at.getFullYear(), at.getMonth(), at.getDate(), hour, minute, 0, 0),
            );
        }
        default:
            return [];
    }
}

/**
 * `(from, to]` 之间跨过的提醒点。
 *
 * **左开右闭**：`from` 是上一次检查的时刻，同一点不该被两次检查各命中一次。
 *
 * 为什么要扫「前一天」：`00:00` 的闹钟提醒发生在 23:59，而它记的键是**次日**。
 * 只扫 `from` 到 `to` 当天的话，跨午夜那一下会漏掉这一类。
 */
export function dueAlarms(alarms: readonly AlarmLike[], from: Date, to: Date): DueHit[] {
    if (to.getTime() <= from.getTime()) return [];

    const days: string[] = [];
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
    while (cursor.getTime() <= last.getTime()) {
        days.push(dateText(cursor));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

    const hits: DueHit[] = [];
    for (const day of days) {
        for (const alarm of alarms) {
            if (!alarm.enabled) continue;
            for (const at of occurrences(alarm, day)) {
                /* 同一次只提醒一次。重载、切回窗口都会重新扫这一段，
                 * 少了这一条就会反复弹。 */
                const key = firedKey(day, at);
                if (alarm.fired === key) continue;
                const remind = at.getTime() - LEAD_MS;
                if (remind > from.getTime() && remind <= to.getTime()) {
                    hits.push({ alarm, key, remindAt: new Date(remind) });
                }
            }
        }
    }
    return hits;
}

/**
 * 下一次提醒的时刻。卡片拿它算「还有多久」。
 *
 * 往后看 **8 天**：`每周` 最坏的情况是「今天不是选中的那天、本周剩下的也不是」，
 * 下一次在 7 天后。往前看 1 天是给 `每小时` 兜底——若此刻正好在本小时的提醒点之前一点，
 * 那一次在今天里就能命中，不必等到明天。
 */
export function nextReminder(alarm: AlarmLike, now: Date): Date | null {
    if (!alarm.enabled) return null;
    for (let offset = -1; offset <= 8; offset += 1) {
        const day = daysAgo(-offset, now);
        for (const at of occurrences(alarm, day)) {
            const remind = at.getTime() - LEAD_MS;
            if (remind > now.getTime()) return new Date(remind);
        }
    }
    return null;
}

/** 「还有 3 小时 12 分」。到点或已过返回空串，由调用方换一句别的。 */
export function countdownText(at: Date, now: Date): string {
    const diff = at.getTime() - now.getTime();
    if (diff <= 0) return '';
    const minutes = Math.ceil(diff / 60_000);
    if (minutes <= 1) return '不到一分钟';
    if (minutes < 60) return `${minutes} 分钟后`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分后` : `${hours} 小时后`;
}

/**
 * 重复规则的一句话。
 *
 * 四种模式都只说「按什么重复」，**时刻不在这里说**——它在卡片左侧的大字里，
 * 再说一遍就是同一行字出现两次。
 */
export function repeatText(alarm: AlarmLike): string {
    switch (alarm.repeat) {
        case 'daily':
            return '每天';
        case 'hourly':
            /* 只写「每小时」：第几分已经由卡片上那行 `:30` 说了，这里再写一遍是同一件事
             * 占两个位置。别的模式反过来——时刻在左、规则在右，两边各说一件。 */
            return '每小时';
        case 'weekly': {
            /* 按「一 … 六、日」的顺序念，不按存储顺序：`weekdays` 是用户点选的先后，
             * 而一列星期读起来应当从头到尾。 */
            const names = WEEKDAY_OPTIONS.filter((one) => alarm.weekdays.includes(one.value))
                .map((one) => one.label)
                .join('');
            return names ? `每周 ${names}` : '每周（没选日子）';
        }
        case 'once':
            return `仅 ${alarm.date.slice(5)}`;
        default:
            return '';
    }
}

/** 保存前的校验。空串 = 可以存。 */
export function alarmDraftError(draft: AlarmDraft): string {
    if (!alarmTime(draft.repeat, draft.time)) {
        return draft.repeat === 'hourly' ? '分钟写成 0–59' : '时间写成 07:30 这样';
    }
    if (draft.repeat === 'weekly' && draft.weekdays.length === 0) return '选几天';
    if (draft.repeat === 'once' && !isDayText(draft.date)) return '选一个日子';
    return '';
}

/**
 * 读档归一：认不出就返回 `null`（这条丢掉），**不抛错**。
 *
 * 库可能被手改过、也可能是旧版写的。一条坏记录不该让整页打不开——
 * 而把认不出的时间当 `00:00` 更坏：那会凭空多出一个半夜的闹钟。
 */
export function readAlarm(raw: unknown): Alarm | null {
    if (!raw || typeof raw !== 'object') return null;
    const one = raw as Partial<Alarm>;
    const repeat: AlarmRepeat =
        one.repeat === 'hourly' || one.repeat === 'weekly' || one.repeat === 'once'
            ? one.repeat
            : 'daily';

    const time = typeof one.time === 'string' ? alarmTime(repeat, one.time) : null;
    if (!time) return null;

    const date = typeof one.date === 'string' && isDayText(one.date) ? one.date : '';
    if (repeat === 'once' && !date) return null;

    /* 星期几去重、去越界、排成「一 … 六、日」的顺序。`weekly` 但一个都没选，按坏记录丢：
     * 留着一个永远不响的闹钟，用户只会以为它坏了。 */
    const weekdays =
        repeat === 'weekly' && Array.isArray(one.weekdays)
            ? WEEKDAY_OPTIONS.map((option) => option.value).filter((day) =>
                  one.weekdays?.includes(day),
              )
            : [];
    if (repeat === 'weekly' && weekdays.length === 0) return null;

    const id = Number(one.id);
    return {
        id: Number.isInteger(id) && id > 0 ? id : 0,
        time,
        label: typeof one.label === 'string' ? one.label.slice(0, LABEL_LIMIT) : '',
        /* 缺 `enabled` 时按**开**处理：新建的闹钟默认是开的，旧档里没有这个字段的
         * 情形只可能是我们写的，那时它确实在跑。 */
        enabled: one.enabled !== false,
        repeat,
        weekdays,
        date: repeat === 'once' ? date : '',
        fired: readFired(one.fired, time),
    };
}

/**
 * 把 `fired` 收成 `<日期> <时刻>`。
 *
 * 旧档只存了日期（上一版只有「每天 / 仅一次」，一天一次够用）。补上当前的时刻，
 * 否则升级后第一次扫描会认为「今天没提醒过」，把当天已经弹过的那次再弹一遍。
 */
function readFired(raw: unknown, time: string): string {
    if (typeof raw !== 'string') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} ${time}`;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return raw;
    return '';
}
