import { ledgerMoneyText } from '../../services/format';
import {
    cultivationCost,
    expToGrade,
    lifeSkillCost,
    lifeSkillOf,
    MENPAI_FLY_MIN_LEVEL,
    menpaiCost,
    petCultivationCost,
    petLevelCost,
    qianNengGuoCost,
    qianYuanDanCost,
    roleExpBetween,
    schoolSkillCost,
    type LevelCosts,
} from '../../services/level-costs';

export type CalcKey =
    | 'role'
    | 'expGrade'
    | 'schoolSkill'
    | 'lifeSkill'
    | 'cultivation'
    | 'petCultivation'
    | 'petLevel'
    | 'qianYuanDan'
    | 'qianNengGuo'
    | 'menpai';

export interface GrowthInput {
    a: number;
    b: number;
    c: number;
    pick: string;
}

export function growthAmount(value: number, kind: 'count' | 'cash' = 'count') {
    return kind === 'cash' ? ledgerMoneyText(value) : value.toLocaleString('zh-CN');
}

/** 两个等级是否构成一个官网接受的区间；不构成时给出**这句话**。 */
function rangeNote(from: number, to: number, min: number, cap: number): string {
    if (![from, to].every(Number.isSafeInteger)) return '等级需为有效整数';
    if (from < min || from > cap) return '起始等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (to < min || to > cap) return '目标等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (from >= to) return '目标等级要比起始等级高';
    return '';
}

interface Reading {
    cap: string;
    value: string;
}

interface Outcome {
    /** 区间不成立时的说明；非空时读数整块空着，只显示这句。 */
    note: string;
    /** 这一项的答案：经验、梦幻币这类主数字，大字摆在读数卡上半。 */
    headline: Reading[];
    /** 附带条件：等级要求、帮贡、轮次这类小字。 */
    details: Reading[];
}

const NONE: Outcome = { note: '', headline: [], details: [] };

/**
 * 各项读数共用一个出口：页面只认识「主数字 + 附带条件」两栏，
 * 不认识「修炼」与「乾元丹」的区别——那些口径住在 `level-costs.ts` 里。
 */
export function growthOutcome(
    table: LevelCosts | null,
    project: CalcKey,
    input: GrowthInput,
): Outcome {
    if (!table) return NONE;
    const values = [
        input.a,
        input.b,
        ...(project === 'menpai' && input.pick === 'fly' ? [input.c] : []),
    ];
    if (
        values.some(
            (value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER,
        )
    ) {
        return { ...NONE, note: '请输入有效的非负数值' };
    }

    switch (project) {
        case 'role': {
            const note = rangeNote(input.a, input.b, 0, table.role.cap);
            if (note) return { ...NONE, note };
            return {
                note: '',
                headline: [
                    {
                        cap: '需要经验',
                        value: growthAmount(roleExpBetween(table, input.a, input.b)),
                    },
                ],
                details: [],
            };
        }
        case 'expGrade': {
            if (input.a < 1 || input.a > table.role.cap) {
                return { ...NONE, note: `当前等级需在 1 到 ${table.role.cap} 之间` };
            }
            const result = expToGrade(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '剩余经验', value: growthAmount(result.left) }],
                details: [{ cap: '可达等级', value: String(result.grade) }],
            };
        }
        case 'schoolSkill': {
            const note = rangeNote(input.a, input.b, 0, table.schoolSkill.cap);
            if (note) return { ...NONE, note };
            const result = schoolSkillCost(table, input.a, input.b);
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: growthAmount(result.exp) },
                    { cap: '需要梦幻币', value: growthAmount(result.cash, 'cash') },
                ],
                details: [],
            };
        }
        case 'lifeSkill':
            return lifeSkillOutcome(table, input);
        case 'cultivation':
            return cultivationOutcome(table, input);
        case 'petCultivation': {
            const note = rangeNote(input.a, input.b, 0, 25);
            if (note) return { ...NONE, note };
            const result = petCultivationCost(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '需要修炼经验', value: growthAmount(result.exp) }],
                details: [
                    { cap: '人物等级要求', value: String(result.minRoleLevel) },
                    { cap: '100 环数量', value: result.rounds100 + ' 轮' },
                ],
            };
        }
        case 'petLevel': {
            const note = rangeNote(input.a, input.b, 1, table.petLevel.cap);
            if (note) return { ...NONE, note };
            const result = petLevelCost(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '需要经验', value: growthAmount(result.exp) }],
                details: [{ cap: '需要月华露', value: growthAmount(result.moonDew) + ' 个' }],
            };
        }
        case 'qianYuanDan': {
            if (input.a < 0 || input.a > table.qianYuanDan.cap) {
                return { ...NONE, note: `已有颗数需在 0 到 ${table.qianYuanDan.cap} 之间` };
            }
            if (input.b < input.a || input.b > table.qianYuanDan.cap) {
                return {
                    ...NONE,
                    note: `目标颗数需在 ${input.a} 到 ${table.qianYuanDan.cap} 之间`,
                };
            }
            const result = qianYuanDanCost(table, input.a, input.b);
            if (!result) return { ...NONE, note: '颗数超出范围' };
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: growthAmount(result.exp) },
                    { cap: '需要梦幻币', value: growthAmount(result.cash, 'cash') },
                ],
                details: [],
            };
        }
        case 'qianNengGuo': {
            const cap = table.qianNengGuo.cap;
            if (input.a < 0 || input.a > cap) {
                return { ...NONE, note: `已有颗数需在 0 到 ${cap} 之间` };
            }
            if (input.b < input.a || input.b > cap) {
                return { ...NONE, note: `目标颗数需在 ${input.a} 到 ${cap} 之间` };
            }
            const result = qianNengGuoCost(table, input.a, input.b);
            if (!result) return { ...NONE, note: '颗数超出范围' };
            return {
                note: '',
                headline: [{ cap: '需要经验', value: growthAmount(result.exp) }],
                /* 只算新增那几颗：0→200 与 150→200 的差价，取决于从第几颗开始吃。 */
                details: [{ cap: '新增颗数', value: growthAmount(result.fruits) + ' 颗' }],
            };
        }
        case 'menpai':
            return menpaiOutcome(table, input);
        default:
            return NONE;
    }
}

function lifeSkillOutcome(table: LevelCosts, input: GrowthInput): Outcome {
    const skill = lifeSkillOf(table, Number(input.pick));
    if (!skill) return { ...NONE, note: '请选择一项辅助技能' };
    const note = rangeNote(input.a, input.b, 0, skill.cap);
    if (note) return { ...NONE, note };
    const result = lifeSkillCost(table, skill.id, input.a, input.b);
    if (!result) return { ...NONE, note: `目标等级需在 0 到 ${skill.cap} 之间` };
    return {
        note: '',
        headline: [
            { cap: '需要经验', value: growthAmount(result.exp) },
            { cap: '需要梦幻币', value: growthAmount(result.cash, 'cash') },
        ],
        /* 帮贡两列都由等级推出：需要 = 5×目标等级，消耗 = 区间三角数之差。 */
        details: [
            { cap: '需要帮贡', value: growthAmount(result.reqBond) },
            { cap: '消耗帮贡', value: growthAmount(result.usedBond) },
        ],
    };
}

function cultivationOutcome(table: LevelCosts, input: GrowthInput): Outcome {
    const type = table.cultivation.types.find((one) => one.id === Number(input.pick));
    if (!type) return { ...NONE, note: '请选择一类修炼' };
    const note = rangeNote(input.a, input.b, 0, type.cap);
    if (note) return { ...NONE, note };
    const result = cultivationCost(table, type.id, input.a, input.b);
    if (!result) return { ...NONE, note: `目标等级需在 0 到 ${type.cap} 之间` };
    return {
        note: '',
        headline: [
            { cap: '需要修炼经验', value: growthAmount(result.exp) },
            { cap: '需要梦幻币', value: growthAmount(result.cash, 'cash') },
        ],
        /* 帮贡与人物等级要求取目标等级那一级，不随区间增长。 */
        details: [
            { cap: '需要资材', value: growthAmount(result.material) },
            { cap: '需要帮贡', value: growthAmount(result.bond) },
            { cap: '人物等级要求', value: String(result.minRoleLevel) },
        ],
    };
}

function menpaiOutcome(table: LevelCosts, input: GrowthInput): Outcome {
    const fly = input.pick === 'fly';
    const floor = fly ? MENPAI_FLY_MIN_LEVEL : table.menpai.min;
    if (input.a < floor || input.a > table.menpai.max) {
        return { ...NONE, note: `人物等级需在 ${floor} 到 ${table.menpai.max} 之间` };
    }
    if (fly && (input.c < 0 || input.c > table.qianNengGuo.cap)) {
        return { ...NONE, note: `已吃潜能果需在 0 到 ${table.qianNengGuo.cap} 之间` };
    }
    const result = menpaiCost(table, input.a, input.b, fly ? input.c : null);
    if (!result) return { ...NONE, note: '等级超出可转范围' };
    const details: Reading[] = [];
    if (result.capped) {
        details.push({ cap: '已按上限计', value: '10 亿' });
    }
    if (result.fruit !== null) {
        details.push({ cap: '需扣除潜能果', value: growthAmount(result.fruit) + ' 颗' });
        if (result.fruitShort) {
            details.push({ cap: '还需再吃', value: growthAmount(result.fruitShort) + ' 颗' });
        }
    }
    return {
        note: '',
        headline: [{ cap: '需要经验', value: growthAmount(result.exp) }],
        details,
    };
}
