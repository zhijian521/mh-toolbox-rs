import { schoolSkillCap } from '../../services/game-data';

/** 手工等级空值按 0 处理，角色读档也使用相同的非负整数口径。 */
export function normalizeLevel(raw: unknown): number {
    const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** 有效上限来自门派表。游戏规则未加载时沿用已知上限。 */
export function schoolLevelLimit(savedCap?: number): number | undefined {
    const cap = schoolSkillCap() || savedCap;
    return cap && cap > 0 ? cap : undefined;
}

export function normalizeSchoolLevel(raw: unknown, savedCap?: number): number {
    const cap = schoolLevelLimit(savedCap);
    const level = normalizeLevel(raw);
    return cap === undefined ? level : Math.min(level, cap);
}

const OCR_LEVEL_LIMIT = 200;

/** 识别数字先过合理性检查。缺失、负数和越界值不能变成一次有效覆盖。 */
export function isRecognizedLevel(value: number, min = 0, max = OCR_LEVEL_LIMIT): boolean {
    return Number.isInteger(value) && value >= min && value <= Math.min(max, OCR_LEVEL_LIMIT);
}
