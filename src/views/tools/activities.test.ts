import { describe, expect, it } from 'vitest';
import {
    ACTIVITIES,
    dayGap,
    groupActivities,
    nextOccurrence,
    nthWeekday,
    occursOn,
    remindDraft,
    remindNote,
    repeatText,
    timesText,
    type Activity,
} from './activities';

/**
 * 活动日历的判据。
 *
 * 固定用「2026 年 11 月 8 日（周日）21:00」当现在——那天是 11 月的第 2 个周日，
 * 于是「每月第几周」这一类能同时验到「今天是第 2 周」和「下一次是哪天」。
 */

const at = (month: number, day: number, hour = 12, minute = 0) =>
    new Date(2026, month - 1, day, hour, minute);

const byId = (id: string): Activity => {
    const found = ACTIVITIES.find((one) => one.id === id);
    if (!found) throw new Error(`活动表里没有 ${id}`);
    return found;
};

describe('第几周', () => {
    it('按日期除以 7 取整，1–7 日是第 1 周', () => {
        expect(nthWeekday(at(11, 1))).toBe(1);
        expect(nthWeekday(at(11, 7))).toBe(1);
        expect(nthWeekday(at(11, 8))).toBe(2);
        expect(nthWeekday(at(11, 29))).toBe(5);
        expect(nthWeekday(at(11, 30))).toBe(5);
    });
});

describe('这一天有没有', () => {
    it('每天与整点类天天都有', () => {
        expect(occursOn(byId('stars'), at(11, 8))).toBe(true);
        expect(occursOn(byId('turtle'), at(11, 3))).toBe(true);
    });

    it('每周固定只看星期几', () => {
        /* 降妖伏魔：每周六。11/14 是周六，11/15 是周日。 */
        expect(occursOn(byId('subdue'), at(11, 14))).toBe(true);
        expect(occursOn(byId('subdue'), at(11, 15))).toBe(false);
        /* 天下美食：周一到周四。周五不算。 */
        expect(occursOn(byId('food'), at(11, 13))).toBe(false);
        expect(occursOn(byId('food'), at(11, 12))).toBe(true);
    });

    it('每月第几周同时看周次与星期', () => {
        /* 门派闯关：第 1 周周日。2026-11-01 是周日且是第 1 周。 */
        expect(occursOn(byId('sect-run'), at(11, 1))).toBe(true);
        expect(occursOn(byId('sect-run'), at(11, 8))).toBe(false);
        /* 帮战夺旗：第 2、3、4 周周日。 */
        expect(occursOn(byId('war-flag'), at(11, 8))).toBe(true);
        expect(occursOn(byId('war-flag'), at(11, 1))).toBe(false);
        /* 长安保卫战：第 5 周周日。11/29 是第 5 周。 */
        expect(occursOn(byId('changan'), at(11, 29))).toBe(true);
    });

    it('一条活动可以落在同一周的几天上', () => {
        /* 决战华山：无帮战的两周（第 1、5 周）里周五到周日都有场。
         * 11/6 周五、11/7 周六都在第 1 周；11/13 是第 2 周周五，归帮战建设。 */
        expect(occursOn(byId('huashan'), at(11, 6))).toBe(true);
        expect(occursOn(byId('huashan'), at(11, 7))).toBe(true);
        expect(occursOn(byId('huashan'), at(11, 13))).toBe(false);
        /* 与帮战互补：11/8 是第 2 周周日，归夺旗，不归华山。 */
        expect(occursOn(byId('huashan'), at(11, 8))).toBe(false);
        expect(repeatText(byId('huashan'))).toBe('每月第 1、5 周周五、周六、周日');
    });
});

describe('下一次', () => {
    it('今天还没结束就算今天', () => {
        /* 降妖伏魔 15:00–17:00；周六 14:00 问，就是今天。 */
        const next = nextOccurrence(byId('subdue'), at(11, 14, 14));
        expect(next?.getDate()).toBe(14);
    });

    it('今天已经结束就往后找一周', () => {
        const next = nextOccurrence(byId('subdue'), at(11, 14, 18));
        expect(next?.getDate()).toBe(21);
    });

    it('整点类永远算没过', () => {
        const next = nextOccurrence(byId('stars'), at(11, 8, 23, 30));
        expect(next?.getDate()).toBe(8);
    });

    it('要跨两个月才轮得到的那种也找得着', () => {
        /* 2026 年 2 月只有四个周日，整月没有「第 5 周周日」；下一次是 3/29。
         * 从 2/8 数过去 49 天——窗口若只留 40 天，这里会返回 null（卡片写「本月已过」），
         * 而事实是「2 月本来就没有」。 */
        const next = nextOccurrence(byId('changan'), at(2, 8, 12));
        expect(next?.getMonth()).toBe(2);
        expect(next?.getDate()).toBe(29);
    });

    it('本月那一周已经过了，就落到下个月', () => {
        /* 科举大赛：第 2 周周日。11/8 17:00 已结束 → 下一次 12/13。 */
        const next = nextOccurrence(byId('exam'), at(11, 8, 21));
        expect(next?.getMonth()).toBe(11);
        expect(next?.getDate()).toBe(13);
    });
});

describe('文案', () => {
    it('时刻只说时段，规则只说频率', () => {
        expect(timesText(byId('exam'))).toBe('12:00–17:00');
        expect(repeatText(byId('exam'))).toBe('每月第 2 周周日');
        expect(timesText(byId('stars'))).toBe('每个整点');
        expect(timesText(byId('star-dust'))).toBe('每小时的 10 分');
        expect(repeatText(byId('food'))).toBe('每周一、二、三、四');
        expect(repeatText(byId('yiguan'))).toBe('每天');
    });
});

describe('分组', () => {
    const groups = groupActivities(ACTIVITIES, at(11, 8, 21));
    const idsIn = (key: string) =>
        groups.find((one) => one.key === key)?.items.map((one) => one.activity.id) ?? [];

    it('按「今天 / 明天 / 本周内 / 之后 / 每天」排，空组不返回', () => {
        expect(groups.map((one) => one.key)).toEqual([
            'today',
            'tomorrow',
            'week',
            'later',
            'daily',
        ]);
    });

    it('今晚还有一场的落「今天」，明天的落「明天」', () => {
        /* 帮战夺旗 20:30–22:00，21:00 时还没结束。 */
        expect(idsIn('today')).toContain('war-flag');
        /* 11/9 周一：天下美食、帮派迷宫。 */
        expect(idsIn('tomorrow')).toContain('food');
        expect(idsIn('tomorrow')).toContain('maze');
    });

    it('每天那一批单独一组，六条', () => {
        expect(idsIn('daily')).toHaveLength(6);
    });

    it('「之后」按日期升序', () => {
        const later = groups.find((one) => one.key === 'later')?.items ?? [];
        const times = later.map((one) => one.next?.getTime() ?? 0);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('今天已经结束的月度活动落「之后」，不是「今天」', () => {
        expect(idsIn('today')).not.toContain('exam');
        expect(idsIn('later')).toContain('exam');
    });
});

describe('翻成闹钟', () => {
    const now = at(11, 8, 21);

    it('每周固定 → weekly + 那几个星期', () => {
        const draft = remindDraft(byId('maze'), byId('maze').slots[0], now);
        expect(draft.repeat).toBe('weekly');
        expect(draft.weekdays).toEqual([1, 3, 6]);
        expect(draft.time).toBe('20:00');
        expect(draft.label).toBe('帮派迷宫');
    });

    it('每天 → daily，只提醒开始那一刻', () => {
        const draft = remindDraft(byId('turtle'), byId('turtle').slots[1], now);
        expect(draft.repeat).toBe('daily');
        expect(draft.time).toBe('22:00');
    });

    it('整点类 → hourly，只留分钟', () => {
        const stars = remindDraft(byId('stars'), { start: '00:00', end: '00:00' }, now);
        expect(stars.repeat).toBe('hourly');
        expect(stars.time).toBe('00:00');

        const dust = remindDraft(byId('star-dust'), { start: '00:00', end: '00:00' }, now);
        expect(dust.time).toBe('00:10');
    });

    it('每月轮换 → 只能落成「仅一次 + 下一次那天」', () => {
        const draft = remindDraft(byId('exam'), byId('exam').slots[0], now);
        expect(draft.repeat).toBe('once');
        expect(draft.date).toBe('2026-12-13');
        expect(draft.time).toBe('12:00');
    });
});

describe('加提醒之前要说的话', () => {
    it('有损换算必须说出来', () => {
        expect(remindNote(byId('exam'))).toContain('下一次');
        expect(remindNote(byId('war-flag'))).toContain('下一次');
    });

    it('随机时段要说', () => {
        expect(remindNote(byId('sect-guard'))).toContain('随机');
    });

    it('整点类要说「每小时都响」', () => {
        expect(remindNote(byId('stars'))).toContain('每小时');
    });

    it('普通的每周活动不必多说', () => {
        expect(remindNote(byId('maze'))).toBe('');
    });
});

describe('日差', () => {
    it('按零点算，不按小时四舍五入', () => {
        /* 今天 21:00 与明天 10:00 只差 13 小时，但那是「明天」。 */
        expect(dayGap(at(11, 8, 21), at(11, 9, 10))).toBe(1);
        expect(dayGap(at(11, 8, 21), at(11, 8, 23))).toBe(0);
        expect(dayGap(at(11, 8, 21), at(11, 14, 10))).toBe(6);
    });
});
