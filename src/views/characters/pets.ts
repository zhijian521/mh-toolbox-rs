/** 召唤兽字段契约。名录、属性顺序和识别标签均来自 public/game/data。 */
export { PET_SKILL_SLOTS, PET_QUALITY_FIELDS } from '../../services/game-rules';

export interface Pet {
    name: string;
    /** 稳定资源编号，独立于玩家自定义的名字。 */
    portrait?: string;
    level: number;
    joinLevel: number;
    /** 战斗属性只记上限，加点独立存放。旧档案没有加点时留空。 */
    attrs: { label: string; value: string }[];
    points?: { label: string; value: string }[];
    quality: {
        attack: number;
        defense: number;
        hp: number;
        mp: number;
        speed: number;
        dodge: number;
    };
    life: number;
    /** 字符串保留成长三位小数。 */
    growth: string;
    element: string;
    skills: string[];
    /** 仅兼容旧记录，不再展示或识别。 */
    innerPills: string[];
    spirit?: number;
}

/** 默认格数只控制留白，已学技能全部展示。 */
export function petDetailSlots(names: readonly string[], minimum: number): string[] {
    return Array.from({ length: Math.max(minimum, names.length) }, (_, i) => names[i] ?? '');
}
