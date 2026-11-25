import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import rawCosts from '../../../public/game/data/level-costs.json';
import { parseLevelCosts } from '../../services/level-costs';
import type { CharacterData } from '../characters/character';
import { goalSummary, type Goal, type GoalItem } from './goals';
import { goalResources } from './goal-resources';

const costs = parseLevelCosts(rawCosts);
const character = (id = 'a'): CharacterData => ({
    id,
    name: id,
    school: '大唐官府',
    level: 0,
    server: '',
    guild: '',
    attrGroups: [
        {
            title: '潜能',
            rows: [
                { label: '乾元丹', value: '0' },
                { label: '潜能果', value: '0' },
                { label: '气血', value: '100' },
            ],
        },
    ],
    experience: { value: '1000万', need: '' },
    skills: [{ name: '十方无敌', level: 0 }],
    assists: [{ name: '强身术', level: 0, kind: 'life' }],
    trainings: [
        {
            title: '修炼',
            rows: [
                { name: '攻击修炼', level: 0 },
                { name: '攻击控制力', level: 0 },
                { name: '育兽术', level: 0 },
            ],
        },
    ],
    gear: [],
    gearMeta: { special: '', suit: '' },
    pets: [],
});
const goal = (patch: Partial<Goal> = {}): Goal => ({
    id: 'goal',
    kind: 'growth',
    title: '养成',
    members: [{ id: 'a', name: '甲' }],
    tracking: { category: 'level', key: '角色等级' },
    target: 2,
    unit: '级',
    deadline: '',
    note: '',
    logs: [],
    createdAt: 1,
    ...patch,
});
const combo = (items: GoalItem[]) =>
    goal({
        kind: 'combo',
        tracking: null,
        items,
        members: [...new Set(items.map((item) => item.characterId))].map((id) => ({ id, name: id })),
    });
const estimate = (target: Goal, roster: CharacterData[]) =>
    goalResources(costs, target, goalSummary(target, roster), roster)!;

describe('目标剩余资源', () => {
    it('普通养成按每个角色当前值汇总，超额完成不抵扣别人，不扣库存经验', () => {
        const roles = [character('a'), character('b'), character('c')];
        roles[1].level = 1;
        roles[2].level = 10;
        const target = goal({ members: roles.map(({ id, name }) => ({ id, name })) });
        const before = JSON.stringify(roles);
        const result = estimate(target, roles);
        expect(result.total.exp).toBe(150 + 110);
        expect(result.completed).toBe(1);
        expect(result.omitted).toEqual([]);
        expect(JSON.stringify(roles)).toBe(before);
        roles[0].level = 2;
        expect(estimate(target, roles).total.exp).toBe(110);
    });

    it('组合累加跨角色和多项目的消耗，人物和宠修经验分别保存', () => {
        const target = combo([
            { characterId: 'a', tracking: { category: 'level', key: '角色等级' }, target: 2 },
            { characterId: 'a', tracking: { category: 'skill', key: '十方无敌' }, target: 1 },
            { characterId: 'a', tracking: { category: 'training', key: '攻击修炼' }, target: 1 },
            { characterId: 'b', tracking: { category: 'training', key: '攻击控制力' }, target: 1 },
        ]);
        const result = estimate(target, [character('a'), character('b')]);
        expect(result).toMatchObject({ calculated: 4, omitted: [] });
        expect(result.total).toMatchObject({
            exp: 150,
            cash: 450006,
            cultivationExp: 150,
            petCultivationExp: 150,
            material: 75,
            usedBond: 0,
        });
    });

    it('生活技能、乾元丹、潜能果沿用各自代价表和下标', () => {
        const target = combo([
            { characterId: 'a', tracking: { category: 'assist', key: '强身术' }, target: 1 },
            { characterId: 'a', tracking: { category: 'attr', key: '乾元丹' }, target: 1 },
            { characterId: 'a', tracking: { category: 'attr', key: '潜能果' }, target: 1 },
        ]);
        const result = estimate(target, [character()]);
        const life = costs.lifeSkill.skills.find((one) => one.name === '强身术')!;
        const curve = costs.lifeSkill.curves[life.curve];
        expect(result.total.exp).toBe(
            curve.exp[0] + costs.qianYuanDan.exp[0] + costs.qianNengGuo.exp[1] * 10000,
        );
        expect(result.total.cash).toBe(curve.cash[0] + costs.qianYuanDan.cash[0]);
        expect(result.total.usedBond).toBe(1);
        expect(result.omitted).toEqual([]);
    });

    it('未学技能从零计算，缺失当前值不能当零', () => {
        const role = character();
        role.skills[0] = { ...role.skills[0], level: 50, off: true };
        const target = goal({ tracking: { category: 'skill', key: '十方无敌' }, target: 1 });
        expect(estimate(target, [role]).total.cash).toBe(6);
        role.skills = [];
        const result = estimate(target, [role]);
        expect(result.calculated).toBe(0);
        expect(result.omitted[0].reason).toBe('当前值待补录');
        expect(result.total.cash).toBe(0);
    });

    it('未支持属性和育兽术、已删角色及越界目标明确排除，仍保留可计算部分', () => {
        const target = combo([
            { characterId: 'a', tracking: { category: 'level', key: '角色等级' }, target: 2 },
            { characterId: 'a', tracking: { category: 'attr', key: '气血' }, target: 200 },
            { characterId: 'a', tracking: { category: 'training', key: '育兽术' }, target: 10 },
            {
                characterId: 'a',
                tracking: { category: 'attr', key: '潜能果' },
                target: costs.qianNengGuo.cap + 1,
            },
            { characterId: 'deleted', tracking: { category: 'level', key: '角色等级' }, target: 10 },
        ]);
        const result = estimate(target, [character()]);
        expect(result.total.exp).toBe(150);
        expect(result.calculated).toBe(1);
        expect(result.omitted.map((one) => one.reason)).toEqual([
            '暂无对应代价数据',
            '暂无对应代价数据',
            expect.stringContaining('等级需满足'),
            '角色已删除',
        ]);
    });

    it('门派变更后不再适用的师门项不产生费用', () => {
        const role = character();
        role.school = '龙宫';
        const target = goal({ tracking: { category: 'skill', key: '十方无敌' }, target: 1 });
        const result = estimate(target, [role]);
        expect(result.total.cash).toBe(0);
        expect(result.omitted[0].reason).toBe('当前角色不适用');
    });

    it('全部完成后清零；存钱和手动目标不套用养成代价', () => {
        const role = character();
        role.level = 10;
        expect(estimate(goal(), [role])).toMatchObject({
            total: { exp: 0, cash: 0 },
            completed: 1,
            omitted: [],
        });
        expect(estimate(goal({ kind: 'money', tracking: null }), [role])).toBeNull();
        expect(estimate(goal({ kind: 'manual', tracking: null }), [role])).toBeNull();
    });
});
