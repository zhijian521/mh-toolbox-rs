import { describe, it, expect } from 'vitest';
import '../../services/game-data.fixture';
import { emptyCharacter, normalizeCharacter, parseRoster, serializeRoster } from './roster';
import {
    normalizeGrowthHistory,
    selectGrowthHistory,
    withGrowthHistory,
    type GrowthEntry,
} from './growth-history';

describe('成长历史', () => {
    it('角色和日期先筛选，边界包含当天、同日按时间倒序，原始记录与顺序不变', () => {
        const entry = (id: string, date: string, createdAt: number): GrowthEntry => ({
            id,
            date,
            createdAt,
            source: 'edit',
            note: '',
            changes: [{ group: '角色', label: '等级', from: '0', to: '10' }],
        });
        const character = normalizeCharacter({ id: 'c1', name: '角色一' });
        character.growthHistory = [
            entry('past', '2026-11-01', 1),
            entry('early', '2026-11-14', 3),
            entry('start', '2026-11-12', 2),
            entry('late', '2026-11-14', 4),
            entry('future', '2026-11-15', 5),
        ];
        const other = normalizeCharacter({ id: 'c2', name: '角色二' });
        other.growthHistory = [entry('other', '2026-11-14', 6)];
        const characters = [character, other, normalizeCharacter({ id: 'empty' })];
        const filter = { characterId: 'c1', from: '2026-11-12', to: '2026-11-14' };
        const rows = selectGrowthHistory(characters, filter);
        expect(rows.map((one) => one.entry.id)).toEqual(['late', 'early', 'start']);
        expect(rows[0].entry).toBe(character.growthHistory[3]);
        expect(rows[0].character).toBe(character);
        expect(character.growthHistory.map((one) => one.id)).toEqual([
            'past',
            'early',
            'start',
            'late',
            'future',
        ]);
        expect(selectGrowthHistory(characters, { ...filter, characterId: '' })[0].entry.id).toBe(
            'other',
        );
        expect(selectGrowthHistory(characters, { ...filter, characterId: 'gone' })).toEqual([]);
        expect(selectGrowthHistory(characters, { ...filter, from: '2026-12-01' })).toEqual([]);
    });

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
