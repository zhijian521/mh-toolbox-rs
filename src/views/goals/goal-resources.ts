/** 目标的剩余资源只做派生计算，复用养成计算器，不写入账本。 */
import type { LevelCosts } from '../../services/level-costs';
import type { ReadonlyCharacter } from '../characters/character';
import {
    createGrowthPlan,
    growthLineCost,
    sumGrowthResources,
    type GrowthLine,
} from '../tools/growth-plan';
import type { GoalSummary, GoalTracking, ReadonlyGoal } from './goals';

function matchesMetric(line: GrowthLine, tracking: GoalTracking): boolean {
    switch (tracking.category) {
        case 'level':
            return line.kind === 'role';
        case 'skill':
            return line.kind === 'school' && line.name === tracking.key;
        case 'assist':
            return line.kind === 'life' && line.name === tracking.key;
        case 'training':
            return (
                (line.kind === 'cultivation' || line.kind === 'petCultivation') &&
                line.name === tracking.key
            );
        case 'attr':
            return (line.kind === 'dan' || line.kind === 'fruit') && line.name === tracking.key;
    }
}

export function goalResources(
    costs: LevelCosts,
    goal: ReadonlyGoal,
    summary: GoalSummary,
    roster: readonly ReadonlyCharacter[],
) {
    if (summary.kind === 'manual') return null;
    const characters = new Map(roster.map((role) => [role.id, role]));
    const plans = new Map<string, GrowthLine[]>();
    const results: ReturnType<typeof growthLineCost>[] = [];
    const omitted: { label: string; reason: string }[] = [];
    let completed = 0;
    for (const row of summary.rows) {
        const item = 'characterId' in row ? row : null;
        const tracking = item?.tracking ?? goal.tracking;
        const characterId = item?.characterId ?? row.id;
        const role = characters.get(characterId);
        const label = `${row.name || '未命名'} · ${tracking?.key ?? '养成项目'}`;
        const omit = (reason: string) => omitted.push({ label, reason });
        if (!row.exists || !role) {
            omit('角色已删除');
            continue;
        }
        if (!row.applicable) {
            omit('当前角色不适用');
            continue;
        }
        if (row.done) {
            completed += 1;
            continue;
        }
        if (row.value === null) {
            omit('当前值待补录');
            continue;
        }
        if (!plans.has(characterId)) plans.set(characterId, createGrowthPlan(costs, role));
        const line =
            tracking && plans.get(characterId)!.find((one) => matchesMetric(one, tracking));
        if (!line) {
            omit('暂无对应代价数据');
            continue;
        }
        const result = growthLineCost(costs, {
            ...line,
            from: row.value,
            to: item?.target ?? goal.target,
        });
        if (result.error) omit(result.error);
        else results.push(result);
    }
    return {
        total: sumGrowthResources(results),
        calculated: results.length,
        completed,
        omitted,
    };
}

export type GoalResources = NonNullable<ReturnType<typeof goalResources>>;
