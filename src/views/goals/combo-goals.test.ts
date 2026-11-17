import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import type { CharacterData } from '../characters/character';
import {
    GOAL_KINDS,
    autoTitle,
    comboGoalRows,
    goalItemKey,
    goalSummary,
    groupComboRows,
    parseGoal,
    parseGoalItems,
    prepareComboUpdates,
    type Goal,
} from './goals';

const character = (id: string, level = 100): CharacterData =>
    ({
        id,
        name: id,
        school: '大唐官府',
        level,
        attrGroups: [],
        skills: [],
        assists: [{ name: '强身术', kind: 'life', level: 110 }],
        trainings: [],
    }) as unknown as CharacterData;
const combo = (): Goal => ({
    id: 'combo',
    kind: 'combo',
    title: '组合计划',
    target: 0,
    unit: '项',
    tracking: null,
    members: [
        { id: 'a', name: '甲' },
        { id: 'b', name: '乙' },
    ],
    items: [
        { characterId: 'a', tracking: { category: 'level', key: '角色等级' }, target: 110 },
        { characterId: 'a', tracking: { category: 'assist', key: '强身术' }, target: 110 },
        { characterId: 'b', tracking: { category: 'level', key: '角色等级' }, target: 120 },
        { characterId: 'b', tracking: { category: 'assist', key: '烹饪技巧' }, target: 100 },
    ],
    deadline: '',
    note: '',
    logs: [],
    createdAt: 1,
});

describe('独立组合目标', () => {
    it('类型位于末尾，普通养成保留原存档与按数值计算的进度', () => {
        expect(GOAL_KINDS.at(-1)?.value).toBe('combo');
        const growth = parseGoal({
            ...combo(),
            kind: 'growth',
            items: undefined,
            tracking: { category: 'level', key: '角色等级' },
            target: 200,
        });
        expect(growth?.kind).toBe('growth');
        expect(growth).not.toHaveProperty('items');
        expect(goalSummary(growth!, [character('a'), character('b')]).pct).toBe(50);
    });

    it('组合按达标项数推进，未达标的部分数值不计进度，未知项仍占分母', () => {
        const summary = goalSummary(combo(), [character('a'), character('b', 120)]);
        expect(summary).toMatchObject({
            current: 2,
            total: 4,
            achieved: 2,
            pct: 50,
            unknown: 1,
            done: false,
        });
        expect(
            groupComboRows(comboGoalRows(combo(), [character('a'), character('b', 120)])).map(
                (group) => [group.id, group.achieved, group.total, group.pct],
            ),
        ).toEqual([
            ['a', 1, 2, 50],
            ['b', 1, 2, 50],
        ]);
        expect(goalSummary(combo(), [character('a', 109)]).pct).toBe(50);
    });

    it('已删除或不适用的项目保留展示、排除计分，全部失效不会被标为达成', () => {
        const one = combo();
        one.items!.push({
            characterId: 'a',
            tracking: { category: 'skill', key: '定心术' },
            target: 100,
        });
        const summary = goalSummary(one, [character('a')]);
        expect(summary.total).toBe(2);
        expect(summary.rows).toHaveLength(5);
        expect(
            summary.rows.find((row) => row.id === goalItemKey(one.items!.at(-1)!))?.applicable,
        ).toBe(false);
        expect(goalSummary(one, [])).toMatchObject({ total: 0, pct: 0, done: false });
    });

    it('组合读写往返保留各角色不同目标，试用过的多项目养成归入组合', () => {
        const parsed = parseGoal(JSON.parse(JSON.stringify(combo())));
        expect(parsed?.items).toEqual(combo().items);
        expect(parsed?.tracking).toBeNull();
        expect(parseGoal({ ...combo(), kind: 'growth', tracking: null })?.kind).toBe('combo');
    });

    it.each(['growth', 'combo'])('恢复误转的单项目养成（保存类型为 %s）及原数值进度', (kind) => {
        const raw = {
            ...combo(),
            kind,
            target: 0,
            tracking: null,
            title: '2 个角色 · 角色等级 到 120级',
            items: ['a', 'b'].map((characterId) => ({
                characterId,
                tracking: { category: 'level', key: '角色等级' },
                target: 120,
            })),
        };
        const before = JSON.stringify(raw);
        const restored = parseGoal(raw);
        expect(restored).toMatchObject({
            id: raw.id,
            kind: 'growth',
            title: raw.title,
            target: 120,
            unit: '级',
            tracking: { category: 'level', key: '角色等级' },
            members: raw.members,
            createdAt: raw.createdAt,
        });
        expect(restored).not.toHaveProperty('items');
        expect(restored).not.toHaveProperty('comboVersion');
        expect(goalSummary(restored!, [character('a', 60), character('b', 120)])).toMatchObject({
            achieved: 1,
            totalMembers: 2,
            pct: 75,
        });
        expect(parseGoal(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it('自定义标题的试用期单项目养成也恢复，保留期限、备注与流水', () => {
        const raw = {
            ...combo(),
            kind: 'growth',
            title: '自定义计划',
            deadline: '2026-12-01',
            note: '保留备注',
            logs: [{ id: 'l1', date: '2026-11-17', delta: 1, note: '', createdAt: 2 }],
            items: combo()
                .items!.filter((item) => item.tracking.category === 'level')
                .map((item) => ({ ...item, target: 120 })),
        };
        expect(parseGoal(raw)).toMatchObject({
            kind: 'growth',
            title: raw.title,
            deadline: raw.deadline,
            note: raw.note,
            logs: raw.logs,
        });
    });

    it('显式创建的单项目组合即使使用旧养成标题也保持组合，自定义组合不误恢复', () => {
        const raw = {
            ...combo(),
            items: ['a', 'b'].map((characterId) => ({
                characterId,
                tracking: { category: 'level', key: '角色等级' },
                target: 120,
            })),
        };
        const title = autoTitle({
            ...raw,
            kind: 'growth',
            tracking: { category: 'level', key: '角色等级' },
            target: 120,
            unit: '级',
        });
        expect(parseGoal({ ...raw, comboVersion: 1, title })?.kind).toBe('combo');
        const retained = parseGoal(raw);
        expect(retained).toMatchObject({ kind: 'combo', comboVersion: 1 });
        expect(parseGoal({ ...retained, title })?.kind).toBe('combo');
    });

    it('不同项目或不同目标值的组合不按旧标题折叠，缺项和重复项仍拒绝', () => {
        const title = '2 个角色 · 角色等级 到 120级';
        expect(parseGoal({ ...combo(), title })?.kind).toBe('combo');
        const unequal = combo().items!.filter((item) => item.tracking.category === 'level');
        expect(parseGoal({ ...combo(), items: unequal, title })?.kind).toBe('combo');
        expect(parseGoal({ ...combo(), items: [unequal[0]], title })).toBeNull();
        expect(parseGoal({ ...combo(), items: [...unequal, unequal[0]], title })).toBeNull();
    });

    it('拒绝空组合、漏角色、重复项目、空项目及非正整数目标', () => {
        const one = combo();
        for (const items of [
            [],
            one.items!.slice(0, 2),
            [...one.items!, one.items![0]],
            [{ ...one.items![0], target: 1.5 }, ...one.items!.slice(1)],
            [{ ...one.items![0], characterId: 'unknown' }, ...one.items!.slice(1)],
            [
                { ...one.items![0], tracking: { category: 'level', key: ' ' } },
                ...one.items!.slice(1),
            ],
        ]) {
            expect(parseGoalItems(items, one.members)).toBeNull();
            expect(parseGoal({ ...one, items })).toBeNull();
        }
    });

    it('同一角色多项修改合并保存，未知值可补录，其他角色不被覆盖', () => {
        const one = combo();
        const roster = [character('a'), character('b', 120)];
        const before = JSON.stringify(roster);
        const rows = comboGoalRows(one, roster);
        const prepared = prepareComboUpdates(one, roster, [
            { id: rows[0].id, value: 130, previous: 100 },
            { id: rows[1].id, value: 140, previous: 110 },
            { id: rows[3].id, value: 100, previous: null },
        ]);
        expect(prepared?.find((row) => row.id === 'a')).toMatchObject({
            level: 130,
            assists: [{ name: '强身术', level: 140 }],
        });
        expect(
            prepared?.find((row) => row.id === 'b')?.assists.find((row) => row.name === '烹饪技巧')
                ?.level,
        ).toBe(100);
        expect(JSON.stringify(roster)).toBe(before);
    });

    it('并发档案变化、重复项、非法数值、已删角色均整批拒绝，不部分写入', () => {
        const one = combo();
        const roster = [character('a')];
        const rows = comboGoalRows(one, roster);
        const valid = { id: rows[0].id, value: 120, previous: 100 };
        for (const values of [
            [valid, valid],
            [{ ...valid, previous: 99 }],
            [{ ...valid, value: -1 }],
            [{ ...valid, value: 1.5 }],
            [{ ...valid, id: rows[2].id }],
            [{ ...valid, previous: undefined }],
        ]) {
            expect(prepareComboUpdates(one, roster, values)).toBeNull();
        }
        expect(roster[0].level).toBe(100);
    });
});
