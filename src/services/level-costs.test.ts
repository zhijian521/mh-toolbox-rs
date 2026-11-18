import { describe, expect, it } from 'vitest';
import rawLevelCosts from '../../public/game/data/level-costs.json';
import {
    cultivationCost,
    expToGrade,
    parseLevelCosts,
    petCultivationCost,
    petCultivationCumulative,
    petLevelCost,
    roleConvention,
    roleExpBetween,
    schoolSkillCost,
    sumLevels,
} from './level-costs';

/**
 * 断言 = **官网工具箱的返回值**。
 *
 * 每一个期望数都是 2026-11-18 从 https://xyq.163.com/tools/ 背后的四个接口
 * （`get_role_need_exp_to_grade` / `get_school_skill_upgrade_need` /
 * `get_expt_need_res_by_lv_range` / `get_pet_upgrade_need_exp`）真调回来的，不是
 * 从我们自己的表推出来的。表错了这里就该红 —— 否则这组断言只是把实现抄了一遍。
 *
 * 读 JSON 走模块解析（`import ... from '../../public/...json'`）而不是 `node:fs`：
 * `tsconfig` 的 `types` 只有 `vite/client`，`src/` 里拿不到 Node 的类型；这条与
 * `game-data.fixture.ts` 同一套做法。
 */
const costs = parseLevelCosts(rawLevelCosts);

describe('表本身', () => {
    it('四个上限与官网一致', () => {
        expect(costs.role.cap).toBe(175);
        expect(costs.schoolSkill.cap).toBe(180);
        expect(costs.petLevel.cap).toBe(180);
        expect(costs.cultivation.types.map((one) => [one.id, one.cap])).toEqual([
            [1, 25],
            [2, 25],
            [3, 25],
            [4, 25],
            [5, 20],
        ]);
    });

    it('列长与「一级一项」的约定对齐', () => {
        expect(costs.role.exp).toHaveLength(175);
        expect(costs.schoolSkill.exp).toHaveLength(180);
        expect(costs.schoolSkill.cash).toHaveLength(180);
        /* 召唤兽第 0 项是 1 级升 2 级，所以 180 级只有 179 项。 */
        expect(costs.petLevel.exp).toHaveLength(179);
        for (const type of costs.cultivation.types) {
            expect(type.levels).toHaveLength(type.cap);
        }
    });

    it('坏表当场报错，不静默变成 0', () => {
        expect(() => parseLevelCosts({})).toThrow(TypeError);
        expect(() =>
            parseLevelCosts({ ...rawLevelCosts, role: { cap: 175, exp: [1, 2, 3] } }),
        ).toThrow(/role\.exp/);
    });
});

describe('人物经验（官网 get_role_need_exp_to_grade）', () => {
    it('0→10 是 16496', () => {
        expect(roleExpBetween(costs, 0, 10)).toBe(16496);
    });

    it('100→120 是 145555144', () => {
        expect(roleExpBetween(costs, 100, 120)).toBe(145555144);
    });

    it('0→175 是 9208633738', () => {
        expect(roleExpBetween(costs, 0, 175)).toBe(9208633738);
    });

    it('同区间两段求和等于整段（区间是可加的）', () => {
        const whole = roleExpBetween(costs, 0, 175);
        expect(roleExpBetween(costs, 0, 90) + roleExpBetween(costs, 90, 175)).toBe(whole);
    });
});

describe('经验换算等级（官网 get_obj_grade_by_exp）', () => {
    it('10 级带 10 万经验 → 16 级、余 22826', () => {
        expect(expToGrade(costs, 10, 100000)).toEqual({ grade: 16, left: 22826 });
    });

    it('不够升一级时原地不动', () => {
        expect(expToGrade(costs, 10, 0)).toEqual({ grade: 10, left: 0 });
        expect(expToGrade(costs, 10, 39)).toEqual({ grade: 10, left: 39 });
    });

    it('刚好够一级就升，余 0', () => {
        /* 0 → 1 级要 40 点。 */
        expect(expToGrade(costs, 0, 40)).toEqual({ grade: 1, left: 0 });
    });

    it('满级之后经验只留不涨', () => {
        const full = expToGrade(costs, 175, 12345);
        expect(full).toEqual({ grade: 175, left: 12345 });
    });
});

describe('师门技能（官网 get_school_skill_upgrade_need）', () => {
    it('50→100：经验 14465552、梦幻币 5424564', () => {
        expect(schoolSkillCost(costs, 50, 100)).toEqual({
            exp: 14465552,
            cash: 5424564,
        });
    });

    it('0→180：经验 660314302、梦幻币 212923395', () => {
        expect(schoolSkillCost(costs, 0, 180)).toEqual({
            exp: 660314302,
            cash: 212923395,
        });
    });
});

describe('人物修炼（官网 get_expt_need_res_by_lv_range）', () => {
    /* 帮贡与人物等级要求取**目标等级那一级**、不求和 —— 0→25 的帮贡是 3750
     * （150×25），不是 25 项之和。这一条最容易写错，所以三个类型的期望值全从官网抄。 */
    it('攻击修炼 0→25', () => {
        expect(cultivationCost(costs, 1, 0, 25)).toEqual({
            exp: 67750,
            cash: 203250000,
            material: 33875,
            bond: 3750,
            minRoleLevel: 145,
        });
    });

    it('防御修炼 5→15', () => {
        expect(cultivationCost(costs, 2, 5, 15)).toEqual({
            exp: 16100,
            cash: 32200000,
            material: 8050,
            bond: 2250,
            minRoleLevel: 95,
        });
    });

    it('猎术修炼 0→20（上限只有 20）', () => {
        expect(cultivationCost(costs, 5, 0, 20)).toEqual({
            exp: 37200,
            cash: 111600000,
            material: 18600,
            bond: 3000,
            minRoleLevel: 120,
        });
    });

    it('超出类型上限返回 null，由页面拦下', () => {
        expect(cultivationCost(costs, 5, 0, 21)).toBeNull();
        expect(cultivationCost(costs, 1, 0, 26)).toBeNull();
        expect(cultivationCost(costs, 99, 0, 1)).toBeNull();
    });
});

describe('召唤兽修炼', () => {
    /* 官网 bundle 里写死的累计表（`zhsxiuliandata`）。我们不再抄一份，改为由
     * 攻击修炼每级经验前缀和推出 —— 这一条断言就是在证明那两处是同一份数。 */
    const OFFICIAL = [
        0, 150, 360, 650, 1040, 1550, 2200, 3010, 4000, 5190, 6600, 8250, 10160, 12350, 14840,
        17650, 20800, 24310, 28200, 32490, 37200, 42350, 47960, 54050, 60640, 67750,
    ];

    it('累计经验表与官网数组逐项相等', () => {
        expect(petCultivationCumulative(costs)).toEqual(OFFICIAL);
    });

    it('0→25：67750 点、人物 145 级、90 轮', () => {
        expect(petCultivationCost(costs, 0, 25)).toEqual({
            exp: 67750,
            minRoleLevel: 145,
            rounds100: 90,
        });
    });

    it('低等级时人物要求兜在 65 级', () => {
        /* 0→1 级：max(1×5+20, 65) = 65，不是 25。 */
        expect(petCultivationCost(costs, 0, 1).minRoleLevel).toBe(65);
    });
});

describe('召唤兽升级', () => {
    /* 经验走存档表的求和（= 官网 get_pet_upgrade_need_exp），月华露走官网本地公式。
     * 两边同源，但**只在月华露上取公式**：官网提交处就是这么混用的。 */
    it('30→80：经验 8221250、月华露 139 个', () => {
        expect(petLevelCost(costs, 30, 80)).toEqual({ exp: 8221250, moonDew: 139 });
    });

    it('1→180：经验 174554200、月华露 1273 个', () => {
        expect(petLevelCost(costs, 1, 180)).toEqual({
            exp: 174554200,
            moonDew: 1273,
        });
    });

    it('1→2 只要 1 个', () => {
        expect(petLevelCost(costs, 1, 2)).toEqual({ exp: 200, moonDew: 1 });
    });

    it('100→120 月华露 111、155→170 月华露 367', () => {
        expect(petLevelCost(costs, 100, 120).moonDew).toBe(111);
        expect(petLevelCost(costs, 155, 170).moonDew).toBe(367);
    });

    it('经验表逐项等于官网公式（179 项）', () => {
        const formula = (level: number) => {
            const base = (level + 1) * (level + 1);
            if (level < 150) return Math.trunc(50 * base);
            if (level < 155) return Math.trunc(50 * base * 2);
            if (level < 160) return Math.trunc(50 * base * 3);
            return Math.trunc(150 * base);
        };
        const mismatched = costs.petLevel.exp
            .map((exp, index) => ({ exp, expect: formula(index + 1), index }))
            .filter((one) => one.exp !== one.expect);
        expect(mismatched).toEqual([]);
    });
});

describe('人物常规', () => {
    /* 官网原文：`skillLimit = parseInt(lv - lv/5 - 10)`，
     * `moneyLimit = lv*lv*2000 + 10000`（封顶 3000 万）；技能上限在 19 级及以下写「无」。 */
    it('175 级：技能 130、金钱 3000 万（封顶）', () => {
        expect(roleConvention(175)).toEqual({ skillCap: 130, moneyCap: 30000000 });
    });

    it('19 级：技能「无」（null，不是 0）', () => {
        expect(roleConvention(19)).toEqual({ skillCap: null, moneyCap: 732000 });
    });

    it('20 级起技能上限开始有值', () => {
        expect(roleConvention(20).skillCap).toBe(6);
    });
});

describe('求和口径', () => {
    it('越界项按 0 记，不抛错', () => {
        expect(sumLevels([1, 2, 3], 0, 5)).toBe(6);
        expect(sumLevels([1, 2, 3], 2, 2)).toBe(0);
    });
});
