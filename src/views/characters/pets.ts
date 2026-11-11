/** 召唤兽字段契约。名录、属性顺序和识别标签均来自 public/game/data。 */
export { PET_QUALITY_FIELDS } from '../../services/game-rules';

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

/** 无名召唤兽不能保存，整体修改和单只修改共用同一规则。 */
export function hasPetName(pet: Pick<Pet, 'name'>): boolean {
    return Boolean(pet.name.trim());
}
