/**
 * 召唤兽：一只兽的字段，以及概览 / 详情那两处共用的取数口径。
 *
 * 2026-11-05 从 `character.ts` 拆出来，界线同样是**域**：这里的常数（技能格 12、
 * 内丹 8、概览五格）只被召唤兽那几处读，放在角色契约里等于让每张卡的六个分区
 * 共用一个 700 行的文件。
 *
 * 对外仍然可以从 `character.ts` 拿（那边 re-export 了本文件）。
 */

/* ======================================================================
 * 召唤兽
 * ==================================================================== */

/**
 * 一只召唤兽。
 *
 * **信息量大到装不进一格**：属性 9 项 + 资质 6 项 + 寿命/成长/五行 + 技能 12 格 +
 * 内丹 8 格 + 进阶灵性。所以它在卡内是**纵向列表**（一行一只），
 * hover 才浮出「判断值不值」的那一半（资质、成长、五行、寿命）。
 * 技能与内丹只记**名字**，不记图标——图标要进 `public/game/icons/`，
 * 现在没有，而名字本身已经够读。
 */
export interface Pet {
    name: string;
    level: number;
    /** 参战等级：低于人物等级才带得动，是这个号「有没有用」的第一道门槛。 */
    joinLevel: number;
    /** 六项资质。顺序与游戏面板一致。 */
    quality: {
        attack: number;
        defense: number;
        hp: number;
        mp: number;
        speed: number;
        dodge: number;
    };
    /** 寿命。归零就放不出来，是「这只能不能继续用」的硬指标。 */
    life: number;
    /** 成长，如 `1.202`。字符串而不是 number：它是三位小数，转数字会丢末尾的 0。 */
    growth: string;
    /** 五行，如 `火`。 */
    element: string;
    /** 战斗属性，只记上限。 */
    attrs: { label: string; value: string }[];
    /** 已学技能名。 */
    skills: string[];
    /** 内丹名。 */
    innerPills: string[];
    /** 进阶灵性；`undefined` 表示没进阶。 */
    spirit?: number;
}

/* ======================================================================
 * 召唤兽：概览与详情的取数口径
 * ==================================================================== */

/**
 * 游戏里召唤兽的**技能格上限**。详情页按它画满格子，「4 / 12」的分母就是它。
 *
 * 写成常量而不是在模板里写字面量：这个数被三处引用（概览的 `+N` 判断、详情的格数、
 * 空格的补齐），散着写迟早有一处还停在旧值，而界面上不会报错——只会少画两格。
 */
export const PET_SKILL_SLOTS = 12;

/** 内丹格上限。八格是游戏给的上限，与技能那 12 格同理。 */
export const PET_PILL_SLOTS = 8;

/**
 * 概览那一行最多列几个技能名，其余收成 `+N`。
 *
 * 4 是量出来的：牌内宽 398，12px 的技能名两字约 24、「·」占 10，四个名字加三个间隔
 * 约 130。六个名字挤一行会把这一行读成另一张表，而这一行要回答的只是「会不会打架」；
 * 真要看全，点开详情有 12 个格子。
 */
export const PET_PREVIEW_SKILLS = 4;

/**
 * 寿命低于这个数要转朱。
 *
 * **0 不算**：编辑器新建一只兽时 `life` 默认 0，把它当告警会让每只刚加的兽一上来就是红的。
 * 0 在这份数据里读作「还没填」，不是「寿命耗尽」——后者在游戏里根本放不出来，
 * 不靠这枚颜色提醒也看得见。
 */
const PET_LIFE_LOW = 50;

/**
 * 概览的五格：气血 / 攻击 / 防御 / 速度 / 法伤，**按这个顺序取**。
 *
 * 不从 `attrs` 里切前五条：`attrs` 是自由数组（编辑器能增能删，也可以少填几项），
 * 顺序不保证。按 index 取会在「气血没填」时把魔法顶到第一格，而那一格永远是气血。
 */
export const PET_PREVIEW_STATS = ['气血', '攻击', '防御', '速度', '法伤'] as const;

/**
 * 资质六项的键与名，顺序即游戏面板顺序。
 *
 * 名字用 **体力 / 法力 / 躲闪** 而不是气血 / 魔法 / 闪避：这三项在游戏里叫「资质」，
 * 与同名的战斗属性不是一回事（体力资质 3030 说的是这只兽的上限，不是它的当前血量）。
 * 编辑器的六格与详情页的六行共用这一份，两处标签因此不会再一处叫体力、一处叫气血。
 */
export const PET_QUALITY_FIELDS = [
    { key: 'attack', label: '攻击' },
    { key: 'defense', label: '防御' },
    { key: 'hp', label: '体力' },
    { key: 'mp', label: '法力' },
    { key: 'speed', label: '速度' },
    { key: 'dodge', label: '躲闪' },
] as const;

/**
 * 取概览那五格。缺项给空串（画面上变成一枚淡「—」），**不省略那一格**：
 * 五格的位置固定，少一格会让后面四项各往前挪一位，读起来的「速度」其实是法伤。
 */
export function previewStats(pet: Pet): { label: string; value: string }[] {
    return PET_PREVIEW_STATS.map((label) => ({
        label,
        value: pet.attrs.find((attr) => attr.label.trim() === label)?.value.trim() ?? '',
    }));
}

/** 概览行要列的名字（最多四个）与没列出来的个数。 */
export function previewSkills(pet: Pet): { names: string[]; rest: number } {
    return {
        names: pet.skills.slice(0, PET_PREVIEW_SKILLS),
        rest: Math.max(0, pet.skills.length - PET_PREVIEW_SKILLS),
    };
}

/**
 * 参战等级还差几级。0 = 带得动（或还没填参战等级）。
 *
 * 它把「参战 65」从**一个数字**变成**一个结论**：130 级的人带 65 级的兽没问题，
 * 但名册里另一张卡上的人是 45 级，同一个 65 就要报出来。旧版只摆数字，从不比较。
 */
export function joinShort(pet: Pick<Pet, 'joinLevel'>, charLevel: number): number {
    return Math.max(0, pet.joinLevel - charLevel);
}

/** 寿命是否已经低到该抬头看见（0 视为未填，不告警）。 */
export function lifeLow(life: number): boolean {
    return life > 0 && life < PET_LIFE_LOW;
}
