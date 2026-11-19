import { describe, expect, it } from 'vitest';
import { onlineSummaryItems } from './online-summary';
import type { OnlineSession } from './online';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();
function session(id: string, startAt: number, endAt: number | null, cardPrice = 15000): OnlineSession {
    return {
        id,
        date: '2026-11-19',
        characterId: id,
        roster: [],
        startAt,
        endAt,
        cardPrice,
        note: '',
        createdAt: startAt,
    };
}

describe('今日在线摘要', () => {
    it('汇总多个角色与进行中记录，并按各段单价与昨日比较', () => {
        const rows = onlineSummaryItems(
            [
                session('yesterday', at(18, 9), at(18, 10)),
                session('today', at(19, 9), at(19, 10), 30000),
                session('running', at(19, 11), null),
            ],
            '2026-11-19',
            at(19, 12),
        );
        expect(rows.map(({ value, sub, delta }) => ({ value, sub, delta }))).toEqual([
            { value: '2 小时', sub: '昨日1小时', delta: '+100%' },
            { value: '27 万', sub: '昨日9万', delta: '+200%' },
        ]);
        expect(rows[1].tone).toBe('loss');
    });

    it('跨午夜只把各日片段计入各自统计', () => {
        const rows = onlineSummaryItems(
            [session('overnight', at(18, 23), at(19, 1))],
            '2026-11-19',
            at(19, 12),
        );
        expect(rows.map(({ value, sub, delta }) => ({ value, sub, delta }))).toEqual([
            { value: '1 小时', sub: '昨日1小时', delta: '±0%' },
            { value: '9 万', sub: '昨日9万', delta: '±0%' },
        ]);
    });

    it('无记录时保留空读数，昨日为零不编造涨幅', () => {
        const rows = onlineSummaryItems([], '2026-11-19', at(19, 12));
        expect(rows.every((row) => row.value === '—' && row.delta === '—')).toBe(true);
        const today = onlineSummaryItems(
            [session('today', at(19, 9), at(19, 10))],
            '2026-11-19',
            at(19, 12),
        );
        expect(today.every((row) => row.sub === '昨日—' && row.delta === '—')).toBe(true);
    });
});
