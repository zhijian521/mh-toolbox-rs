/** 综合预算中的可选计算项；参考读数不进入资源消耗。 */
import {
    expToGrade,
    gemCost,
    guildShopQuota,
    menpaiCost,
    petScenesAt,
    roleConvention,
    type LevelCosts,
} from '../../services/level-costs';

export type GrowthExtraKind =
    'gem' | 'menpai' | 'guildShop' | 'petScene' | 'expGrade' | 'convention';

export const GROWTH_EXTRA_OPTIONS: { value: GrowthExtraKind; label: string }[] = [
    { value: 'gem', label: '宝石合成' },
    { value: 'menpai', label: '转门派' },
    { value: 'guildShop', label: '商会免税' },
    { value: 'petScene', label: '练级场景' },
    { value: 'expGrade', label: '经验换算等级' },
    { value: 'convention', label: '人物常规' },
];

export interface GrowthExtra {
    key: string;
    kind: GrowthExtraKind;
    name: string;
    a: number;
    b: number;
    c: number;
    pick: string;
}

export interface GrowthExtraResult {
    exp: number;
    cash: number;
    fruits: number;
    readings: { label: string; value: number | string; money?: boolean }[];
    note: string;
    error: string;
}

export function createGrowthExtra(
    costs: LevelCosts,
    kind: GrowthExtraKind,
    key: string,
    roleLevel: number,
): GrowthExtra {
    return {
        key,
        kind,
        name: GROWTH_EXTRA_OPTIONS.find((one) => one.value === kind)?.label ?? '',
        a: kind === 'gem' ? 5 : kind === 'guildShop' ? 100 : kind === 'petScene' ? 80 : roleLevel,
        b: kind === 'guildShop' ? 2 : 0,
        c: 0,
        pick: kind === 'gem' ? costs.gem.types[0].id : 'nofly',
    };
}

export function growthExtraCost(costs: LevelCosts, item: GrowthExtra): GrowthExtraResult {
    const result: GrowthExtraResult = {
        exp: 0,
        cash: 0,
        fruits: 0,
        readings: [],
        note: '',
        error: '',
    };
    const invalid = (error: string) => ({ ...result, error });
    if (
        ![item.a, item.b, item.c].every(
            (one) => Number.isFinite(one) && one >= 0 && one <= Number.MAX_SAFE_INTEGER,
        )
    ) {
        return invalid('请输入有效的非负数值');
    }
    if (!Number.isSafeInteger(item.a)) return invalid('等级或指数需为整数');
    switch (item.kind) {
        case 'gem': {
            const value = gemCost(costs, item.pick, item.a, item.b * 10_000);
            if (!value) return invalid('宝石等级或单价超出范围');
            result.cash = value.money;
            result.readings = [{ label: '需要 1 级宝石', value: value.total }];
            result.note = '按理想合成数量计算，不含失败损耗与手续费。';
            break;
        }
        case 'menpai': {
            const fly = item.pick === 'fly';
            const value = menpaiCost(costs, item.a, item.b, fly ? item.c : null);
            if (!value) return invalid('人物等级、总经验或潜能果数量超出范围');
            if (fly) {
                result.fruits = value.fruit ?? 0;
                result.readings = [
                    { label: '经验换算参考', value: value.exp },
                    { label: '按当前潜能果还缺', value: value.fruitShort },
                ];
                result.note = '已飞升按潜能果计入消耗，换算经验不重复计入；不含仙玉。';
            } else {
                result.exp = value.exp;
                result.note = '经验计入合计；不含仙玉及其他条件。';
            }
            break;
        }
        case 'guildShop': {
            if (!Number.isSafeInteger(item.b) || item.a < 1 || item.b < 1)
                return invalid('指数和店铺间数需为正整数');
            const quota = guildShopQuota(item.a, item.b);
            if (!Number.isSafeInteger(quota)) return invalid('营业额超出计算范围');
            result.readings = [{ label: '所需营业额', value: quota, money: true }];
            result.note = '营业额仅供参考，不计入支出。';
            break;
        }
        case 'petScene': {
            if (item.a > costs.role.cap) return invalid(`等级需在 0 到 ${costs.role.cap} 之间`);
            result.readings = petScenesAt(costs, item.a).map((one) => ({
                label: one.name,
                value: `${one.min}–${one.max} 级 · ${one.exp.toLocaleString('zh-CN')} 经验`,
            }));
            result.note = '五人组队领双的场景经验，仅供参考。';
            break;
        }
        case 'expGrade': {
            if (item.a > costs.role.cap || !Number.isSafeInteger(item.b))
                return invalid('等级或经验超出范围');
            const value = expToGrade(costs, item.a, item.b);
            result.readings = [
                { label: '可达等级', value: value.grade },
                { label: '剩余经验', value: value.left },
            ];
            result.note = '单独换算，不抵扣综合预算的现有经验。';
            break;
        }
        case 'convention': {
            if (item.a < 1 || item.a > costs.role.cap)
                return invalid(`等级需在 1 到 ${costs.role.cap} 之间`);
            const value = roleConvention(item.a);
            result.readings = [
                { label: '人物技能要求', value: value.skillCap ?? '无' },
                { label: '携带金钱上限', value: value.moneyCap, money: true },
            ];
            result.note = '上限与要求仅供参考，不计入消耗。';
            break;
        }
    }
    return result;
}
