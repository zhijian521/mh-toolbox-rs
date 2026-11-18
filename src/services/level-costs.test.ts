import { describe, expect, it } from 'vitest';
import rawLevelCosts from '../../public/game/data/level-costs.json';
import {
    cultivationCost,
    expToGrade,
    fruitForExp,
    gemCost,
    guildShopQuota,
    lifeSkillCost,
    lifeSkillOf,
    menpaiCost,
    parseLevelCosts,
    petCultivationCost,
    petCultivationCumulative,
    petLevelCost,
    petScenesAt,
    qianNengGuoCost,
    qianYuanDanCost,
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

describe('养成输入边界', () => {
    it.each([-1, 1.5, NaN, Infinity])('非法起点 %s 不产生负成本', (from) => {
        expect(lifeSkillCost(costs, 201, from, 10)).toBeNull();
        expect(cultivationCost(costs, 1, from, 10)).toBeNull();
        expect(qianYuanDanCost(costs, from, 9)).toBeNull();
        expect(qianNengGuoCost(costs, from, 10)).toBeNull();
    });

    it('辅助与修炼不能倒算负消耗，宝石等级不得默默取整', () => {
        expect(lifeSkillCost(costs, 201, 20, 10)).toBeNull();
        expect(cultivationCost(costs, 1, 20, 10)).toBeNull();
        expect(gemCost(costs, 'putong', 2.5, 100)).toBeNull();
        expect(gemCost(costs, 'putong', 5, NaN)).toBeNull();
        expect(menpaiCost(costs, 129, Infinity)).toBeNull();
    });

    it('技能上限超过曲线与重复技能必须在读取时拦下', () => {
        const short = structuredClone(rawLevelCosts);
        short.lifeSkill.skills[0].cap = 999;
        expect(() => parseLevelCosts(short)).toThrow(/曲线/);
        const duplicate = structuredClone(rawLevelCosts);
        duplicate.lifeSkill.skills.push(duplicate.lifeSkill.skills[0]);
        expect(() => parseLevelCosts(duplicate)).toThrow(/重复/);
    });
});

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

describe('辅助技能（官网 get_life_skill_upgrade_need）', () => {
    /* 21 项去重成 5 条曲线：多数技能逐级代价完全相同，只有打造那一族、
     * 灵石、强壮那一族各自不一样。这一条钉住去重没把两条不同的曲线并成一條。 */
    it('5 条曲线、21 项技能，上限按官网', () => {
        expect(costs.lifeSkill.curves).toHaveLength(5);
        expect(costs.lifeSkill.skills.map((one) => one.id)).toEqual([
            201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 216, 217, 218, 230, 231,
            237, 239, 240, 241,
        ]);
        expect(lifeSkillOf(costs, 201)?.cap).toBe(140);
        /* 烹饪技巧官网 bundle 的 limitobj 写 160，接口从 141 起就报错 —— 真实上限 140。 */
        expect(lifeSkillOf(costs, 208)?.cap).toBe(140);
        expect(lifeSkillOf(costs, 239)?.cap).toBe(20);
        expect(lifeSkillOf(costs, 230)?.cap).toBe(60);
    });

    it('强身术 0→140：经验 104406194、梦幻币 13901235', () => {
        expect(lifeSkillCost(costs, 201, 0, 140)).toEqual({
            exp: 104406194,
            cash: 13901235,
            reqBond: 700,
            usedBond: 9870,
        });
    });

    it('烹饪技巧 0→140 的经验比强身术少（两者共用前 140 级曲线以外的那条）', () => {
        expect(lifeSkillCost(costs, 208, 0, 140)?.exp).toBe(74141717);
    });

    it('冥想 100→120：经验 20551163、梦幻币 3853295、帮贡 600 / 2210', () => {
        /* 区间是从 100 级起，两列帮贡都按「目标等级」与「区间差」算，不随经验表求和。 */
        expect(lifeSkillCost(costs, 202, 100, 120)).toEqual({
            exp: 20551163,
            cash: 3853295,
            reqBond: 600,
            usedBond: 2210,
        });
    });

    it('打造 0→160 与淬灵 0→160 同值（同一条曲线）', () => {
        const build = lifeSkillCost(costs, 204, 0, 160);
        const quench = lifeSkillCost(costs, 231, 0, 160);
        expect(build?.exp).toBe(161126102);
        expect(build?.cash).toBe(26315625);
        expect(quench).toEqual(build);
    });

    it('灵石 0→120、强壮 0→60、风之感应 0→20', () => {
        expect(lifeSkillCost(costs, 218, 0, 120)).toEqual({
            exp: 87583962,
            cash: 13137285,
            reqBond: 600,
            usedBond: 7260,
        });
        expect(lifeSkillCost(costs, 230, 0, 60)?.exp).toBe(3612200000);
        expect(lifeSkillCost(costs, 230, 0, 60)?.cash).toBe(903050000);
        expect(lifeSkillCost(costs, 239, 0, 20)).toEqual({
            exp: 129400000,
            cash: 32350000,
            reqBond: 100,
            usedBond: 210,
        });
    });

    it('超上限、未知技能一律 null', () => {
        expect(lifeSkillCost(costs, 208, 0, 141)).toBeNull();
        expect(lifeSkillCost(costs, 239, 0, 21)).toBeNull();
        expect(lifeSkillCost(costs, 999, 0, 10)).toBeNull();
        expect(lifeSkillOf(costs, 999)).toBeNull();
    });

    it('区间可加：0→160 = 0→80 + 80→160', () => {
        const whole = lifeSkillCost(costs, 202, 0, 160);
        const half = lifeSkillCost(costs, 202, 0, 80);
        const rest = lifeSkillCost(costs, 202, 80, 160);
        expect((half?.exp ?? 0) + (rest?.exp ?? 0)).toBe(whole?.exp);
        expect((half?.usedBond ?? 0) + (rest?.usedBond ?? 0)).toBe(whole?.usedBond);
    });
});

describe('乾元丹（官网 bundle qianyuandandata）', () => {
    it('0→9 颗：经验 465600800、梦幻币 93120136', () => {
        expect(qianYuanDanCost(costs, 0, 9)).toEqual({ exp: 465600800, cash: 93120136 });
    });

    it('1→2 颗就是第一档：22341872 / 4468371', () => {
        expect(qianYuanDanCost(costs, 0, 1)).toEqual({ exp: 22341872, cash: 4468371 });
    });

    it('第 9 颗的经验比第 8 颗低 —— 原始数据就是这样，不做「修正」', () => {
        /* 75415928 → 75977600 → **72201200**：末一颗反而回落，官网表里就是这个数。 */
        const eighth = qianYuanDanCost(costs, 7, 8);
        const ninth = qianYuanDanCost(costs, 8, 9);
        expect(eighth).toEqual({ exp: 75977600, cash: 15195518 });
        expect(ninth).toEqual({ exp: 72201200, cash: 14440238 });
        expect(ninth?.exp).toBeLessThan(eighth?.exp as number);
    });

    it('超出 9 颗或区间反了都返回 null', () => {
        expect(qianYuanDanCost(costs, 0, 10)).toBeNull();
        expect(qianYuanDanCost(costs, 5, 4)).toBeNull();
    });
});

describe('商会免税（官网 shms）', () => {
    it('指数 × 1000 × 间数', () => {
        expect(guildShopQuota(100, 2)).toBe(200000);
        expect(guildShopQuota(150, 10)).toBe(1500000);
        expect(guildShopQuota(100, 1)).toBe(100000);
    });

    it('小数与负数都归整，不会出负值', () => {
        expect(guildShopQuota(120.7, 3)).toBe(360000);
        expect(guildShopQuota(-5, 2)).toBe(0);
    });
});

describe('宝石合成（官网 baoshi）', () => {
    it('普通宝石：2 的幂，上限 20', () => {
        const lv5 = gemCost(costs, 'putong', 5, 1000);
        expect(lv5).toEqual({ total: 16, lower: 8, lower2: 4, money: 16000 });
        expect(gemCost(costs, 'putong', 20, 1)?.total).toBe(2 ** 19);
    });

    it('星辉石：3 的幂，上限 11', () => {
        expect(gemCost(costs, 'xinghui', 4, 10)).toEqual({
            total: 27,
            lower: 9,
            lower2: 3,
            money: 270,
        });
        expect(gemCost(costs, 'xinghui', 11, 1)?.total).toBe(3 ** 10);
        expect(gemCost(costs, 'xinghui', 12, 1)).toBeNull();
    });

    it('1 级与 2 级没有更下一档，记 0', () => {
        expect(gemCost(costs, 'putong', 1, 500)).toEqual({
            total: 1,
            lower: 0,
            lower2: 0,
            money: 500,
        });
        expect(gemCost(costs, 'putong', 2, 1)?.lower2).toBe(0);
    });

    it('未知档位或越界一律 null', () => {
        expect(gemCost(costs, 'nope', 3, 1)).toBeNull();
        expect(gemCost(costs, 'putong', 0, 1)).toBeNull();
        expect(gemCost(costs, 'putong', 21, 1)).toBeNull();
    });
});

describe('转门派（官网 menpai_nofly / menpai_fly）', () => {
    it('未飞升：官网 get_exp 的四个样本', () => {
        expect(menpaiCost(costs, 69, 0)?.exp).toBe(39750864);
        expect(menpaiCost(costs, 109, 0)?.exp).toBe(156809887);
        expect(menpaiCost(costs, 129, 0)?.exp).toBe(260345752);
        expect(menpaiCost(costs, 155, 0)?.exp).toBe(463926794);
    });

    it('175 级零经验就顶到 10 亿', () => {
        const top = menpaiCost(costs, 175, 0);
        expect(top?.exp).toBe(1_000_000_000);
        expect(top?.capped).toBe(true);
    });

    it('总经验按 2% 计入，超上限仍截到 10 亿', () => {
        expect(menpaiCost(costs, 159, 1_000_000_000)?.exp).toBe(521241377);
        expect(menpaiCost(costs, 175, 5_000_000_000)?.exp).toBe(1_000_000_000);
    });

    it('未飞升不算潜能果；已飞升才给 fruit 与缺口', () => {
        expect(menpaiCost(costs, 129, 0)?.fruit).toBeNull();
        const fly = menpaiCost(costs, 129, 0, 0);
        expect(fly?.fruit).toBe(fly?.fruitShort);
        const rich = menpaiCost(costs, 129, 0, 200);
        expect(rich?.fruitShort).toBe(0);
    });

    it('等级越界返回 null', () => {
        expect(menpaiCost(costs, 59, 0)).toBeNull();
        expect(menpaiCost(costs, 176, 0)).toBeNull();
    });
});

describe('潜能果反推（官网 get_qianneng）', () => {
    it('官网五个样本', () => {
        expect(fruitForExp(costs, 200, 1_000_000_000)).toBe(9);
        expect(fruitForExp(costs, 10, 1_000_000)).toBe(1);
        expect(fruitForExp(costs, 0, 1_000_000)).toBe(1);
        expect(fruitForExp(costs, 50, 10_000_000)).toBe(1);
        expect(fruitForExp(costs, 3, 300_000_000)).toBe(26);
    });

    it('不需要经验就是 0 颗', () => {
        expect(fruitForExp(costs, 0, 0)).toBe(0);
    });
});

describe('潜能果兑换经验（官网 qiannengguo）', () => {
    it('累计三个点：0→10 / 0→50 / 0→200', () => {
        expect(qianNengGuoCost(costs, 0, 10)).toEqual({ exp: 106750000, fruits: 10 });
        expect(qianNengGuoCost(costs, 0, 50)?.exp).toBe(683750000);
        expect(qianNengGuoCost(costs, 0, 200)?.exp).toBe(8792500000);
    });

    it('区间可加，且只算新增那几颗', () => {
        const whole = qianNengGuoCost(costs, 0, 50)?.exp ?? 0;
        const head = qianNengGuoCost(costs, 0, 20)?.exp ?? 0;
        const rest = qianNengGuoCost(costs, 20, 50)?.exp ?? 0;
        expect(head + rest).toBe(whole);
        expect(qianNengGuoCost(costs, 30, 30)).toEqual({ exp: 0, fruits: 0 });
    });

    it('超过 200 颗或区间反了返回 null', () => {
        expect(qianNengGuoCost(costs, 0, 201)).toBeNull();
        expect(qianNengGuoCost(costs, 50, 40)).toBeNull();
    });
});

describe('召唤兽练级场景（官网 zhsscene）', () => {
    it('0 级只有东海湾，175 级三个场景同经验', () => {
        expect(petScenesAt(costs, 0).map((one) => one.name)).toEqual(['东海湾']);
        const top = petScenesAt(costs, 175);
        expect(top.map((one) => one.exp)).toEqual([20710, 20710, 20710]);
    });

    it('80 级命中七段，含龙窟六层与凤巢五层', () => {
        const names = petScenesAt(costs, 80).map((one) => one.name);
        expect(names).toHaveLength(7);
        expect(names).toContain('龙窟六层');
        expect(names).toContain('凤巢五层');
    });

    it('等级负值给空数组', () => {
        expect(petScenesAt(costs, -1)).toEqual([]);
    });
});

describe('求和口径', () => {
    it('越界项按 0 记，不抛错', () => {
        expect(sumLevels([1, 2, 3], 0, 5)).toBe(6);
        expect(sumLevels([1, 2, 3], 2, 2)).toBe(0);
    });
});
