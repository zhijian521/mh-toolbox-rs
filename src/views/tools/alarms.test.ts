import { describe, expect, it } from 'vitest';
import {
    alarmTime,
    countdownText,
    dueAlarms,
    fireAt,
    nextReminder,
    readAlarm,
    reminderAt,
    repeatText,
    type Alarm,
} from './alarms';

/** 造一条闹钟，字段默认值取「每天、开着、没提醒过」。 */
function make(patch: Partial<Alarm> = {}): Alarm {
    return {
        id: 1,
        time: '08:30',
        label: '',
        enabled: true,
        repeat: 'daily',
        weekdays: [],
        date: '',
        fired: '',
        ...patch,
    };
}

/** 本地时刻，避免用例受时区影响。 */
function at(day: string, hour: number, minute: number): Date {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date, hour, minute, 0, 0);
}

/* 2026-11-08 是周日、11-09 是周一。`weekly` 的用例都建在这两个已知日子上，
 * 不写 `getDay()` 的期望值——那样测试会跟着实现一起错。 */
const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';

/* 时刻本身的归一与「取分钟」在 `services/clock.test.ts`，这里只剩「按重复方式收」。 */
describe('按重复方式收时间', () => {
    it('每小时的模式只留分钟，且认裸数字', () => {
        expect(alarmTime('hourly', '30')).toBe('00:30');
        expect(alarmTime('hourly', '07:30')).toBe('00:30');
        expect(alarmTime('hourly', '60')).toBeNull();
        expect(alarmTime('daily', '07:30')).toBe('07:30');
    });
});

describe('提醒时刻', () => {
    it('比响的时刻早一分钟', () => {
        expect(reminderAt(make({ time: '08:30' }), SUNDAY).getTime()).toBe(
            at(SUNDAY, 8, 29).getTime(),
        );
    });

    /* 这一条是整套跨日口径的核心：00:00 的闹钟要提前到**前一天** 23:59，
     * 而它的键仍是次日。写反了就会漏掉这一类，且只在午夜前后才看得出来。 */
    it('00:00 的闹钟提醒落在前一天 23:59', () => {
        const alarm = make({ time: '00:00' });
        expect(reminderAt(alarm, SUNDAY).getTime()).toBe(at('2026-11-07', 23, 59).getTime());
        expect(fireAt(alarm, SUNDAY).getTime()).toBe(at(SUNDAY, 0, 0).getTime());
    });
});

describe('该提醒谁', () => {
    it('扫过提醒点就命中一次', () => {
        const alarm = make();
        const hits = dueAlarms([alarm], at(SUNDAY, 8, 28), at(SUNDAY, 8, 30));
        expect(hits).toHaveLength(1);
        expect(hits[0].key).toBe(`${SUNDAY} 08:30`);
    });

    it('区间是左开右闭，同一点不会被两次检查各命中一次', () => {
        const alarm = make();
        const point = at(SUNDAY, 8, 29);
        expect(dueAlarms([alarm], at(SUNDAY, 8, 28), point)).toHaveLength(1);
        expect(dueAlarms([alarm], point, at(SUNDAY, 8, 30))).toHaveLength(0);
    });

    it('已经提醒过的那一次不再命中', () => {
        const alarm = make({ fired: `${SUNDAY} 08:30` });
        expect(dueAlarms([alarm], at(SUNDAY, 8, 28), at(SUNDAY, 8, 30))).toEqual([]);
    });

    it('停用的不命中', () => {
        const alarm = make({ enabled: false });
        expect(dueAlarms([alarm], at(SUNDAY, 8, 28), at(SUNDAY, 8, 30))).toEqual([]);
    });

    it('仅一次只在它那一天命中', () => {
        const alarm = make({ repeat: 'once', date: MONDAY });
        expect(dueAlarms([alarm], at(MONDAY, 8, 28), at(MONDAY, 8, 30))).toHaveLength(1);
        expect(dueAlarms([alarm], at(SUNDAY, 8, 28), at(SUNDAY, 8, 30))).toEqual([]);
    });

    it('每周只在选中的那天命中', () => {
        const alarm = make({ repeat: 'weekly', weekdays: [1, 3] });
        /* 11-09 周一：响 */
        expect(dueAlarms([alarm], at(MONDAY, 8, 28), at(MONDAY, 8, 30))).toHaveLength(1);
        /* 11-08 周日：不响 */
        expect(dueAlarms([alarm], at(SUNDAY, 8, 28), at(SUNDAY, 8, 30))).toEqual([]);
    });

    it('每小时的每个整点那一分都命中，且键各不相同', () => {
        const alarm = make({ repeat: 'hourly', time: '00:30' });
        const hits = dueAlarms([alarm], at(SUNDAY, 9, 28), at(SUNDAY, 11, 32));
        expect(hits.map((hit) => hit.key)).toEqual([
            `${SUNDAY} 09:30`,
            `${SUNDAY} 10:30`,
            `${SUNDAY} 11:30`,
        ]);
    });

    it('每小时记过 09:30 之后，10:30 那一次照样响', () => {
        const alarm = make({ repeat: 'hourly', time: '00:30', fired: `${SUNDAY} 09:30` });
        const hits = dueAlarms([alarm], at(SUNDAY, 10, 28), at(SUNDAY, 10, 30));
        expect(hits).toHaveLength(1);
        expect(hits[0].key).toBe(`${SUNDAY} 10:30`);
    });

    it('跨午夜时，零点档的闹钟在这一段里被扫到', () => {
        const alarm = make({ time: '00:00' });
        const hits = dueAlarms([alarm], at('2026-11-07', 23, 58), at('2026-11-08', 0, 1));
        expect(hits).toHaveLength(1);
        expect(hits[0].key).toBe(`${SUNDAY} 00:00`);
    });

    it('区间反过来就是没有命中', () => {
        const alarm = make();
        expect(dueAlarms([alarm], at(SUNDAY, 8, 30), at(SUNDAY, 8, 28))).toEqual([]);
    });
});

describe('下一次提醒', () => {
    it('今天的还没到就给今天', () => {
        const next = nextReminder(make(), at(SUNDAY, 7, 0));
        expect(next?.getTime()).toBe(at(SUNDAY, 8, 29).getTime());
    });

    it('今天的过了就给明天', () => {
        const next = nextReminder(make(), at(SUNDAY, 9, 0));
        expect(next?.getTime()).toBe(at(MONDAY, 8, 29).getTime());
    });

    it('仅一次的日子过了就没有下一次', () => {
        const alarm = make({ repeat: 'once', date: SUNDAY });
        expect(nextReminder(alarm, at(SUNDAY, 9, 0))).toBeNull();
        expect(nextReminder(alarm, at(MONDAY, 9, 0))).toBeNull();
    });

    it('每周：今天没选中，下一次落在最近的那个选中的日子', () => {
        const alarm = make({ repeat: 'weekly', weekdays: [1, 3] });
        /* 周日 12:00 → 下一次是周一 08:29 */
        expect(nextReminder(alarm, at(SUNDAY, 12, 0))?.getTime()).toBe(at(MONDAY, 8, 29).getTime());
        /* 周一 09:00（已过）→ 下一次是周三 08:29 */
        expect(nextReminder(alarm, at(MONDAY, 9, 0))?.getTime()).toBe(
            at('2026-11-11', 8, 29).getTime(),
        );
    });

    it('每小时：本小时的过了就给下一小时', () => {
        const alarm = make({ repeat: 'hourly', time: '00:30' });
        expect(nextReminder(alarm, at(SUNDAY, 9, 10))?.getTime()).toBe(at(SUNDAY, 9, 29).getTime());
        expect(nextReminder(alarm, at(SUNDAY, 9, 29))?.getTime()).toBe(
            at(SUNDAY, 10, 29).getTime(),
        );
    });

    it('停用的没有下一次', () => {
        expect(nextReminder(make({ enabled: false }), at(SUNDAY, 7, 0))).toBeNull();
    });
});

describe('文案', () => {
    it('还有多久', () => {
        const now = at(SUNDAY, 8, 0);
        expect(countdownText(at(SUNDAY, 8, 29), now)).toBe('29 分钟后');
        expect(countdownText(at(SUNDAY, 11, 12), now)).toBe('3 小时 12 分后');
        expect(countdownText(at(SUNDAY, 11, 0), now)).toBe('3 小时后');
        expect(countdownText(at(SUNDAY, 8, 0), now)).toBe('');
    });

    it('重复规则四种写法', () => {
        expect(repeatText(make())).toBe('每天');
        expect(repeatText(make({ repeat: 'hourly', time: '00:05' }))).toBe('每小时');
        expect(repeatText(make({ repeat: 'weekly', weekdays: [1, 3, 5] }))).toBe('每周 一三五');
        expect(repeatText(make({ repeat: 'once', date: MONDAY }))).toBe('仅 11-09');
    });
});

describe('读档归一', () => {
    it('认不出的时间整条丢掉', () => {
        expect(readAlarm({ time: '25:00' })).toBeNull();
        expect(readAlarm({ time: 'abc' })).toBeNull();
        expect(readAlarm(null)).toBeNull();
    });

    it('缺字段按默认值补：重复按每天、开关按开、星期为空', () => {
        const alarm = readAlarm({ id: 3, time: '7:5' });
        expect(alarm).toMatchObject({
            id: 3,
            time: '07:05',
            repeat: 'daily',
            enabled: true,
            weekdays: [],
        });
    });

    it('仅一次没给日子，丢掉——留着会变成一个永远不响的记录', () => {
        expect(readAlarm({ time: '08:00', repeat: 'once' })).toBeNull();
        expect(readAlarm({ time: '08:00', repeat: 'once', date: MONDAY })).toMatchObject({
            repeat: 'once',
            date: MONDAY,
        });
    });

    it('每周：去重、去越界、按「一 … 六、日」排好；一个都没选就丢掉', () => {
        const alarm = readAlarm({
            time: '08:00',
            repeat: 'weekly',
            weekdays: [3, 1, 1, 0, 9, -1],
        });
        expect(alarm?.weekdays).toEqual([1, 3, 0]);
        expect(readAlarm({ time: '08:00', repeat: 'weekly', weekdays: [] })).toBeNull();
    });

    it('每小时的时间只有分钟有意义', () => {
        expect(readAlarm({ time: '07:30', repeat: 'hourly' })).toMatchObject({
            time: '00:30',
            repeat: 'hourly',
        });
    });

    /* 旧档的 `fired` 只有日期（上一版一天只响一次）。不补时刻的话，升级后第一次扫描
     * 会认为「今天没提醒过」，把当天已经弹过的那次再弹一遍。 */
    it('旧的「只记日期」补成「日期 + 时刻」', () => {
        expect(readAlarm({ time: '08:00', fired: SUNDAY })?.fired).toBe(`${SUNDAY} 08:00`);
        expect(readAlarm({ time: '08:00', fired: `${SUNDAY} 07:59` })?.fired).toBe(
            `${SUNDAY} 07:59`,
        );
        expect(readAlarm({ time: '08:00', fired: '昨天' })?.fired).toBe('');
    });

    it('备注超长截断', () => {
        const alarm = readAlarm({
            time: '08:00',
            label: '一二三四五六七八九十一二三四五六七八九十超出',
        });
        expect(alarm?.label).toHaveLength(20);
    });
});
