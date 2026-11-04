import { describe, expect, it } from 'vitest';
/* 门派技能由游戏表带出来（`schoolSkills`），单测里没有启动时的 `fetch`，
 * 所以一行副作用导入把真文件装进缓存——与 `schools.test.ts` 同一条做法。 */
import '../../services/game-data.fixture';
import { isPriceCategory } from '../prices/prices-catalog';
import { DEMO_COUNTS, DEMO_PRICES, demoCharacters } from './demo-data';

/**
 * 模拟数据的两条**结构**断言。
 *
 * 它不验「好不好看」，只验这份数据还能不能用：角色 id 会当页签与 key、物价名要过
 * 重名校验（`addItem` 直接拒同名），而「练满 / 空号」「有历史 / 没记录」这两种极端
 * 一旦被后来的改动悄悄抹平，开发页那个按钮就只是往库里灌了几张普通卡片，
 * 却不会有任何地方报错。
 */
describe('开发页的模拟数据', () => {
    it('四个角色：id 唯一，且一满一空都在', () => {
        const characters = demoCharacters();

        expect(characters).toHaveLength(4);
        expect(new Set(characters.map((one) => one.id)).size).toBe(4);
        expect(characters.every((one) => one.name.trim().length > 0)).toBe(true);

        const maxed = characters.find((one) => one.name === '天罡·满级');
        const blank = characters.find((one) => one.name === '初入江湖');
        if (!maxed || !blank) throw new Error('模拟角色少了「练满」或「空号」那一张');
        const maxedTrainings = maxed.trainings.flatMap((group) => group.rows);
        const blankTrainings = blank.trainings.flatMap((group) => group.rows);

        /* 练满：门派技能与十项修炼都必须顶到各自的上限——卡上因此七条刻度全朱、
         * 修炼十行整条转朱，这正是要验的那一屏。 */
        expect(maxed.skills.length).toBeGreaterThan(0);
        expect(maxed.skills.every((row) => row.cap !== undefined && row.level === row.cap)).toBe(
            true,
        );
        expect(maxedTrainings).toHaveLength(10);
        expect(maxedTrainings.every((row) => row.level === row.cap)).toBe(true);
        expect(maxed.pets).toHaveLength(1);

        /* 空号：辅助、装备、召唤兽全空，修炼全 0——「还没记录」的那几屏靠它。 */
        expect(blank.assists).toHaveLength(0);
        expect(blank.pets).toHaveLength(0);
        expect(blank.gear.every((slot) => slot.caption === undefined)).toBe(true);
        expect(blankTrainings).toHaveLength(10);
        expect(blankTrainings.every((row) => row.level === 0)).toBe(true);
    });

    it('六件物价：名字唯一、一级分类合法，且「只有一天」「一条没记」各有一件', () => {
        expect(DEMO_PRICES).toHaveLength(6);
        expect(new Set(DEMO_PRICES.map((one) => one.name)).size).toBe(6);
        expect(DEMO_PRICES.every((one) => isPriceCategory(one.category))).toBe(true);

        /* 价必须是正数：`addPoint` 把 0 判成「价格要大于 0」直接拒掉，那样这一件会静默
         * 少一条价，而界面上只表现为「记录少了一天」。 */
        expect(DEMO_PRICES.flatMap((one) => one.points).every((point) => point.price > 0)).toBe(
            true,
        );

        /* 单位约定：价一律是**万**的量级。写成 820 一样能跑，但卡上会显示「820」而且
         * 连「万」字都不带（`priceLabel` 只在 ≥ 一万时才折算），一页行情读起来像金额表。 */
        expect(
            DEMO_PRICES.flatMap((one) => one.points).every((point) => point.price >= 10_000),
        ).toBe(true);

        /* 走势要像行情：相邻两天不超过三成。翻倍的线真出现，多半是记错了区，
         * 拿它验走势图反而会让人以为图表坏了。 */
        for (const one of DEMO_PRICES) {
            for (let i = 1; i < one.points.length; i += 1) {
                const before = one.points[i - 1].price;
                const after = one.points[i].price;
                expect(Math.abs(after - before) / before).toBeLessThan(0.3);
            }
        }

        expect(DEMO_PRICES.filter((one) => one.points.length === 1)).toHaveLength(1);
        expect(DEMO_PRICES.filter((one) => one.points.length === 0)).toHaveLength(1);
        /* 有历史的要够画出走势：两条以上才有「涨 / 跌」。 */
        expect(DEMO_PRICES.filter((one) => one.points.length >= 2).length).toBeGreaterThanOrEqual(
            4,
        );
    });

    it('界面报的两个数跟真数据一致', () => {
        /* 开关旁边的小字与确认窗的问句都读 `DEMO_COUNTS`。补了数据却忘了改它，
         * 界面会平静地说一个旧数——不报错、不影响功能，只是说了假话。 */
        expect(DEMO_COUNTS.characters).toBe(demoCharacters().length);
        expect(DEMO_COUNTS.prices).toBe(DEMO_PRICES.length);
    });
});
