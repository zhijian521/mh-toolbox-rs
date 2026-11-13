import { dateText, parseDay } from '../../services/format';
import { timeText } from '../../services/clock';

export function backfillDraft(now = Date.now()) {
    const start = now - 3_600_000;
    return { date: dateText(start), startTime: timeText(start), endTime: timeText(now) };
}

export function onlineTimeAt(day: string, time: string): number {
    const at = parseDay(day);
    const [hour, minute] = time.split(':').map(Number);
    at.setHours(hour, minute, 0, 0);
    return at.getTime();
}

/** 只把更早的结束时刻解释为次日；相同时刻交给时长校验拒绝。 */
export function backfillEndAt(day: string, time: string, startAt: number): number {
    const end = onlineTimeAt(day, time);
    if (end >= startAt) return end;
    const next = new Date(end);
    next.setDate(next.getDate() + 1);
    return next.getTime();
}
