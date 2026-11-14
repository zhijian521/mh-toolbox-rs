import { describe, it, expect } from 'vitest';
import '../../services/game-data.fixture';
import { emptyCharacter, normalizeCharacter, parseRoster, serializeRoster } from './roster';
import { normalizeGrowthHistory, withGrowthHistory } from './growth-history';

describe('成长历史', () => {
    it('保存生成前后值，新增删除技能与零值不丢失', () => {
        const previous = emptyCharacter();
        previous.assists = [{ name: '强身术', kind: 'life', level: 0 }];
        const next = withGrowthHistory(
            previous,
            { ...previous, level: 109, assists: [{ name: '冥想', kind: 'life', level: 50 }] },
            'goal',
            '提升',
            1000000000000,
        );
        expect(next.growthHistory?.[0]).toMatchObject({
            source: 'goal',
            note: '提升',
            changes: expect.arrayContaining([
                { group: '角色', label: '等级', from: '0', to: '109' },
                { group: '生活技能', label: '强身术', from: '0', to: '' },
                { group: '生活技能', label: '冥想', from: '', to: '50' },
            ]),
        });
        expect(previous.growthHistory).toBeUndefined();
        expect(parseRoster(serializeRoster([next]))?.[0].growthHistory).toEqual(next.growthHistory);
    });
    it('无变化不添加记录，草稿不能覆盖已有记录', () => {
        const previous = emptyCharacter();
        expect(withGrowthHistory(previous, previous).growthHistory).toBeUndefined();
        const saved = withGrowthHistory(previous, { ...previous, level: 10 });
        expect(withGrowthHistory(saved, { ...saved, growthHistory: [] }).growthHistory).toEqual(
            saved.growthHistory,
        );
    });
    it('历史保留数字零，丢弃无效日期和重复身份', () => {
        const entry = {
            id: 'g1',
            date: '2026-11-14',
            changes: [{ group: '修炼', label: '攻击修炼', from: 0, to: 1 }],
        };
        expect(
            normalizeGrowthHistory([entry, entry, { ...entry, id: 'bad', date: '2026-02-30' }]),
        ).toHaveLength(1);
        expect(normalizeGrowthHistory([entry])[0].changes[0].from).toBe('0');
        expect(normalizeCharacter({ name: '旧记录' }).growthHistory).toBeUndefined();
    });
});
