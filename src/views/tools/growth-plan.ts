/** 从角色档案生成独立计算草稿；不同种类经验分别汇总，不写回角色。 */
import {
    cultivationCost,
    lifeSkillCost,
    petCultivationCost,
    petLevelCost,
    qianNengGuoCost,
    qianYuanDanCost,
    roleExpBetween,
    schoolSkillCost,
    type LevelCosts,
} from '../../services/level-costs';
import { findAttrRow, type ReadonlyCharacter } from '../characters/character';

export const GROWTH_GROUPS = ['师门', '辅助', '任务修炼', '召唤兽修炼', '人物', '召唤兽升级'];

type GrowthKind =
    'role' | 'school' | 'life' | 'cultivation' | 'petCultivation' | 'dan' | 'fruit' | 'pet';

export interface GrowthLine {
    key: string;
    kind: GrowthKind;
    group: string;
    name: string;
    from: number;
    to: number;
    min: number;
    cap: number;
    typeId: number;
    recorded: boolean;
    removable?: boolean;
}

export interface GrowthResources {
    exp: number;
    cash: number;
    cultivationExp: number;
    petCultivationExp: number;
    petExp: number;
    material: number;
    /** 辅助技能要求当前帮贡，修炼要求历史累计帮贡，两者不能合并。 */
    requiredBond: number;
    cultivationBond: number;
    usedBond: number;
    minRoleLevel: number;
    moonDew: number;
    rounds100: number;
}

const emptyResources = (): GrowthResources => ({
    exp: 0,
    cash: 0,
    cultivationExp: 0,
    petCultivationExp: 0,
    petExp: 0,
    material: 0,
    requiredBond: 0,
    cultivationBond: 0,
    usedBond: 0,
    minRoleLevel: 0,
    moonDew: 0,
    rounds100: 0,
});

export function createGrowthPlan(costs: LevelCosts, role: ReadonlyCharacter): GrowthLine[] {
    const lines: GrowthLine[] = [];
    const add = (
        kind: GrowthKind,
        group: string,
        name: string,
        current: number | undefined,
        cap: number,
        typeId = 0,
        min = 0,
    ) => {
        const from = current ?? min;
        lines.push({
            key: `${kind}:${lines.length}`,
            kind,
            group,
            name,
            from,
            to: from,
            min,
            cap,
            typeId,
            recorded: current !== undefined,
        });
    };
    add('role', '人物', '人物等级', role.level, costs.role.cap);
    for (const [name, kind, cap] of [
        ['乾元丹', 'dan', costs.qianYuanDan.cap],
        ['潜能果', 'fruit', costs.qianNengGuo.cap],
    ] as const) {
        const text = findAttrRow(role, name)?.value.trim() ?? '';
        const value = /^\d+$/.test(text) ? Number(text) : undefined;
        add(kind, '人物', name, value, cap);
    }
    role.skills.forEach((skill) =>
        add('school', '师门', skill.name, skill.off ? 0 : skill.level, costs.schoolSkill.cap),
    );
    for (const skill of role.assists.filter((one) => one.kind === 'life')) {
        const type = costs.lifeSkill.skills.find((one) => one.name === skill.name);
        if (type) add('life', '辅助', skill.name, skill.off ? 0 : skill.level, type.cap, type.id);
    }
    // 按名称匹配，不依赖角色档案内分组顺序；育兽术没有官网代价表，不套用宠修。
    for (const row of role.trainings.flatMap((group) => group.rows)) {
        const type = costs.cultivation.types.find((one) => one.name === row.name);
        if (type) add('cultivation', '任务修炼', row.name, row.level, type.cap, type.id);
        else if (
            costs.cultivation.types.some(
                (one) => one.id <= 4 && row.name === one.name.replace('修炼', '控制力'),
            )
        ) {
            const cap = costs.cultivation.types.find((one) => one.id === 1)?.cap ?? 0;
            add('petCultivation', '召唤兽修炼', row.name, row.level, cap);
        }
    }
    role.pets.forEach((pet, index) =>
        add(
            'pet',
            '召唤兽升级',
            pet.name || `召唤兽 ${index + 1}`,
            pet.level || undefined,
            costs.petLevel.cap,
            index,
            1,
        ),
    );
    return lines.sort(
        (left, right) => GROWTH_GROUPS.indexOf(left.group) - GROWTH_GROUPS.indexOf(right.group),
    );
}

/** 同级不消耗；非法区间返回错误，汇总不得把坏输入当成零成本。 */
export function growthLineCost(
    costs: LevelCosts,
    line: GrowthLine,
): {
    resources: GrowthResources;
    error: string;
} {
    const resources = emptyResources();
    const { from, to, min, cap } = line;
    if (![from, to].every(Number.isSafeInteger) || from < min || to < from || to > cap) {
        return { resources, error: `等级需满足 ${min} ≤ 当前 ≤ 目标 ≤ ${cap}` };
    }
    if (from === to) return { resources, error: '' };
    switch (line.kind) {
        case 'role':
            resources.exp = roleExpBetween(costs, from, to);
            break;
        case 'school':
            Object.assign(resources, schoolSkillCost(costs, from, to));
            break;
        case 'dan': {
            const result = qianYuanDanCost(costs, from, to);
            if (!result) return { resources, error: '乾元丹颗数超出计算范围' };
            Object.assign(resources, result);
            break;
        }
        case 'fruit': {
            const result = qianNengGuoCost(costs, from, to);
            if (!result) return { resources, error: '潜能果颗数超出计算范围' };
            resources.exp = result.exp;
            break;
        }
        case 'life': {
            const result = lifeSkillCost(costs, line.typeId, from, to);
            if (!result) return { resources, error: '辅助技能不在计算表内' };
            resources.exp = result.exp;
            resources.cash = result.cash;
            resources.requiredBond = result.reqBond;
            resources.usedBond = result.usedBond;
            break;
        }
        case 'cultivation': {
            const result = cultivationCost(costs, line.typeId, from, to);
            if (!result) return { resources, error: '修炼不在计算表内' };
            resources.cultivationExp = result.exp;
            resources.cash = result.cash;
            resources.material = result.material;
            resources.cultivationBond = result.bond;
            resources.minRoleLevel = result.minRoleLevel;
            break;
        }
        case 'petCultivation': {
            const result = petCultivationCost(costs, from, to);
            resources.petCultivationExp = result.exp;
            resources.minRoleLevel = result.minRoleLevel;
            resources.rounds100 = result.rounds100;
            break;
        }
        case 'pet': {
            const result = petLevelCost(costs, from, to);
            resources.petExp = result.exp;
            resources.moonDew = result.moonDew;
            break;
        }
    }
    return { resources, error: '' };
}

export function sumGrowthResources(
    rows: readonly ReturnType<typeof growthLineCost>[],
): GrowthResources {
    const total = emptyResources();
    for (const { resources, error } of rows) {
        if (error) continue;
        for (const key of Object.keys(total) as (keyof GrowthResources)[]) {
            total[key] =
                key === 'requiredBond' || key === 'cultivationBond' || key === 'minRoleLevel'
                    ? Math.max(total[key], resources[key])
                    : total[key] + resources[key];
        }
    }
    return total;
}

export function summarizeGrowthPlan(costs: LevelCosts, lines: readonly GrowthLine[], ownedExp = 0) {
    const rows = lines.map((line) => ({ line, ...growthLineCost(costs, line) }));
    const errors = rows.filter((row) => row.error);
    const ownedExpError =
        Number.isSafeInteger(ownedExp) && ownedExp >= 0 ? '' : '现有经验需为有效的非负整数';
    const total = sumGrowthResources(rows);
    return {
        total,
        rows,
        errors,
        ownedExpError,
        errorCount: errors.length + Number(!!ownedExpError),
        remainingExp: Math.max(0, total.exp - (ownedExpError ? 0 : ownedExp)),
        changed: rows.filter((row) => !row.error && row.line.to > row.line.from).length,
    };
}
