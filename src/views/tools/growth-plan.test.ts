import { describe, expect, it } from 'vitest';
import rawCosts from '../../../public/game/data/level-costs.json';
import { parseLevelCosts } from '../../services/level-costs';
import type { CharacterData } from '../characters/character';
import {
    createGrowthPlan,
    GROWTH_GROUPS,
    growthLineCost,
    summarizeGrowthPlan,
} from './growth-plan';

const costs = parseLevelCosts(rawCosts);
const character = (): CharacterData => ({
    id: 'role-a',
    name: '角色甲',
    level: 100,
    school: '大唐官府',
    server: '',
    guild: '',
    attrGroups: [
        {
            title: '潜能',
            rows: [
                { label: '乾元丹', value: '0' },
                { label: '潜能果', value: '' },
            ],
        },
    ],
    experience: { value: '500万', need: '' },
    skills: [{ name: '十方无敌', level: 50 }],
    assists: [
        { name: '强身术', level: 0, kind: 'life' },
        { name: '调息', level: 1, kind: 'story' },
    ],
    trainings: [
        { title: '任务修炼', rows: [{ name: '攻击修炼', level: 0 }] },
        {
            title: '宠物修炼',
            rows: [
                { name: '攻击控制力', level: 0 },
                { name: '育兽术', level: 10 },
            ],
        },
    ],
    gear: [],
    gearMeta: { special: '', suit: '' },
    pets: [],
});

describe('角色综合养成预算', () => {
    it('非法现有经验阻止汇总，不产生负抵扣或非有限缺口', () => {
        for (const exp of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
            const summary = summarizeGrowthPlan(costs, [], exp);
            expect(summary.ownedExpError).not.toBe('');
            expect(summary.errorCount).toBe(1);
            expect(summary.remainingExp).toBe(0);
        }
    });

    it('读取当前值但不修改档案；空颗数与真实零区分，剧情与育兽术不套用公式', () => {
        const role = character();
        const before = JSON.stringify(role);
        const lines = createGrowthPlan(costs, role);
        expect(lines.find((one) => one.kind === 'dan')).toMatchObject({ from: 0, recorded: true });
        expect(lines.find((one) => one.kind === 'fruit')).toMatchObject({
            from: 0,
            recorded: false,
        });
        expect(lines.some((one) => one.name === '调息' || one.name === '育兽术')).toBe(false);
        const level = lines.find((one) => one.kind === 'role');
        if (level) level.to = 120;
        expect(JSON.stringify(role)).toBe(before);
    });

    it('旧档标为未学的技能以零级开始预算，保留已录入状态', () => {
        const role = character();
        role.skills[0] = { ...role.skills[0], level: 50, off: true };
        role.assists[0] = { ...role.assists[0], level: 40, off: true };
        const lines = createGrowthPlan(costs, role);
        for (const name of ['十方无敌', '强身术']) {
            expect(lines.find((line) => line.name === name)).toMatchObject({
                from: 0,
                to: 0,
                recorded: true,
            });
        }
    });

    it('多项目人物经验与梦幻币累加；人物和宠物修炼经验独立', () => {
        const lines = createGrowthPlan(costs, character());
        for (const row of lines) {
            if (row.kind === 'role') row.to = 120;
            if (row.kind === 'school') row.to = 100;
            if (row.kind === 'dan') row.to = 1;
            if (row.kind === 'cultivation' || row.kind === 'petCultivation') row.to = 25;
        }
        const result = summarizeGrowthPlan(costs, lines, 5_000_000);
        expect(result.errors).toEqual([]);
        expect(result.changed).toBe(5);
        expect(result.remainingExp).toBe(145555144 + 14465552 + 22341872 - 5_000_000);
        expect(result.total).toMatchObject({
            exp: 145555144 + 14465552 + 22341872,
            cash: 5424564 + 4468371 + 203250000,
            cultivationExp: 67750,
            petCultivationExp: 67750,
            material: 33875,
            requiredBond: 0,
            cultivationBond: 3750,
            usedBond: 0,
            minRoleLevel: 145,
        });
    });

    it('辅助帮贡消耗相加，帮贡门槛与人物等级要求取最高值', () => {
        const role = character();
        role.assists.push({ name: '冥想', level: 100, kind: 'life' });
        const lines = createGrowthPlan(costs, role);
        for (const row of lines) {
            if (row.name === '强身术') row.to = 140;
            if (row.name === '冥想') row.to = 120;
            if (row.kind === 'cultivation') row.to = 25;
        }
        expect(summarizeGrowthPlan(costs, lines).total).toMatchObject({
            exp: 104406194 + 20551163,
            cash: 13901235 + 3853295 + 203250000,
            requiredBond: 700,
            cultivationBond: 3750,
            usedBond: 9870 + 2210,
        });
    });

    it('同级成本为零，降级、小数、非有限数和超上限报告错误', () => {
        const line = createGrowthPlan(costs, character()).find((one) => one.kind === 'role')!;
        expect(growthLineCost(costs, line).resources.exp).toBe(0);
        for (const to of [99, 100.5, NaN, Infinity, 176]) {
            expect(growthLineCost(costs, { ...line, to }).error).not.toBe('');
        }
        expect(summarizeGrowthPlan(costs, [{ ...line, to: 99 }]).errors).toHaveLength(1);
    });

    it('同名召唤兽分别计算，升级经验和月华露不混进人物资源', () => {
        const role = character();
        const pet = {
            name: '鬼将',
            level: 30,
            joinLevel: 105,
            attrs: [],
            quality: { attack: 0, defense: 0, hp: 0, mp: 0, speed: 0, dodge: 0 },
            life: 0,
            growth: '',
            element: '',
            skills: [],
            innerPills: [],
        };
        role.pets.push(pet, structuredClone(pet));
        const lines = createGrowthPlan(costs, role);
        const pets = lines.filter((one) => one.kind === 'pet');
        pets.forEach((one) => {
            one.to = 80;
        });
        expect(new Set(pets.map((one) => one.key)).size).toBe(2);
        expect(summarizeGrowthPlan(costs, lines).total).toMatchObject({
            exp: 0,
            cash: 0,
            petExp: 16442500,
            moonDew: 278,
        });
    });

    it('换角色生成独立目标，不能沿用上个角色的等级', () => {
        const first = createGrowthPlan(costs, character());
        const level = first.find((one) => one.kind === 'role')!;
        level.to = 175;
        const other = character();
        other.id = 'role-b';
        other.level = 69;
        expect(createGrowthPlan(costs, other).find((one) => one.kind === 'role')).toMatchObject({
            from: 69,
            to: 69,
        });
        expect(level.to).toBe(175);
        expect(summarizeGrowthPlan(costs, first, Number.MAX_SAFE_INTEGER).remainingExp).toBe(0);
    });

    it('固定养成分组按指定顺序展示，任务修炼不沿用旧组名', () => {
        const plan = createGrowthPlan(costs, character());
        expect([...new Set(plan.map((one) => one.group))]).toEqual(GROWTH_GROUPS.slice(0, 5));
        expect(plan.find((one) => one.kind === 'cultivation')?.group).toBe('任务修炼');
    });

    it('新增辅助卡片可删除，删除后帮贡要求与消耗一并移除', () => {
        const lines = createGrowthPlan(costs, character());
        const skill = lines.find((one) => one.kind === 'life')!;
        skill.removable = true;
        skill.to = 140;
        expect(summarizeGrowthPlan(costs, lines).total.usedBond).toBe(9870);
        const remaining = lines.filter((one) => one.key !== skill.key);
        expect(summarizeGrowthPlan(costs, remaining).total).toMatchObject({
            usedBond: 0,
            requiredBond: 0,
        });
    });
});
