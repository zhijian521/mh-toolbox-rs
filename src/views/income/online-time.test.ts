import { describe, expect, it } from 'vitest';
import { backfillDraft, backfillEndAt, onlineTimeAt } from './online-time';

describe('补记时刻', () => {
    it('凌晨默认一小时前落在前一天，跨月与跨年也正确', () => {
        expect(backfillDraft(new Date(2027, 0, 1, 0, 30).getTime())).toEqual({
            date: '2026-12-31',
            startTime: '23:30',
            endTime: '00:30',
        });
    });

    it('结束早于开始按次日，相同时间保持零时长供校验拒绝', () => {
        const start = onlineTimeAt('2026-11-12', '23:30');
        expect(backfillEndAt('2026-11-12', '00:30', start)).toBe(
            onlineTimeAt('2026-11-13', '00:30'),
        );
        expect(backfillEndAt('2026-11-12', '23:30', start)).toBe(start);
    });

    it('编辑未改的时刻保留秒数，修改日期或分钟才重新落时刻', () => {
        const original = new Date(2026, 10, 14, 0, 30, 45, 123).getTime();
        expect(onlineTimeAt('2026-11-14', '00:30', original)).toBe(original);
        expect(onlineTimeAt('2026-11-14', '00:45', original)).toBe(
            new Date(2026, 10, 14, 0, 45).getTime(),
        );
        expect(onlineTimeAt('2026-11-12', '00:30', original)).toBe(
            new Date(2026, 10, 12, 0, 30).getTime(),
        );
    });
});
