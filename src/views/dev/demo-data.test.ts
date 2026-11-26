import { describe, expect, it } from 'vitest';
/* 门派技能由游戏表带出来（`schoolSkills`），单测里没有启动时的 `fetch`，
 * 所以一行副作用导入把真文件装进缓存——与 `schools.test.ts` 同一条做法。 */
import '../../services/game-data.fixture';
import { isPriceCategory } from '../prices/prices-catalog';
import {
    buildDemoData,
    demoCounts,
    DEMO_PRICES,
    demoCharacters,
    demoGoalInputs,
    demoWarehouseItems,
} from './demo-data';
import { parseGoal, goalSummary } from '../goals/goals';

/** 仅检查完整演示账本的结构、资产归属和数据量级，不执行导入。 */
describe('开发页的模拟数据', () => {
    it('仓库示例保留装备和宝宝两类，固定编号便于重复添加去重', () => {
        const first = demoWarehouseItems();
        expect(first.map((item) => item.kind)).toEqual(['gear', 'pet']);
        expect(demoWarehouseItems().map((item) => item.id)).toEqual(first.map((item) => item.id));
        expect(first[0]).toMatchObject({ gear: { detail: { name: '霜冷九州' } } });
        if (first[0].kind === 'gear') first[0].gear.detail.name = '临时修改';
        expect(demoWarehouseItems()[0]).toMatchObject({ gear: { detail: { name: '霜冷九州' } } });
    });
    it('目标示例同时保留普通养成与组合，组合每个角色有多项且可完整读取', () => {
        const characters = demoCharacters();
        const inputs = demoGoalInputs(characters);
        expect(inputs.map((input) => input.kind)).toEqual(['growth', 'combo']);
        const goals = inputs.map((input, index) =>
            parseGoal({ ...input, id: `demo-${index}`, createdAt: 0, logs: [] }),
        );
        expect(goals.every(Boolean)).toBe(true);
        const combo = goals.find((goal) => goal?.kind === 'combo')!;
        expect(combo.items).toHaveLength(combo.members.length * 2);
        expect(goalSummary(combo, characters).done).toBe(false);
        expect(demoGoalInputs([])).toEqual([]);
    });
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

        /* 示例数据继续提供高等级修炼；卡片只展示等级，不再据此标满。 */
        expect(maxed.skills.length).toBeGreaterThan(0);
        expect(maxed.skills.every((row) => row.cap !== undefined && row.level === row.cap)).toBe(
            true,
        );
        expect(maxedTrainings).toHaveLength(10);
        expect(maxedTrainings.every((row) => row.level === (row.name === '育兽术' ? 35 : 20))).toBe(
            true,
        );
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

    it('完整账本覆盖各领域，目标／流水只关联本套角色，编号唯一', () => {
        const data = buildDemoData();
        const ids = new Set(data.characters.map((one) => one.id));
        expect(data).toMatchObject({ format: 2, app: 'mh-toolbox-rs' });
        for (const rows of [
            data.characters,
            data.prices,
            data.income,
            data.online,
            data.accounts,
            data.goals,
            data.warehouse,
        ]) {
            expect(rows.length).toBeGreaterThan(0);
            expect(new Set(rows.map((one) => one.id)).size).toBe(rows.length);
        }
        expect(data.income.every((one) => ids.has(one.characterId))).toBe(true);
        expect(
            data.online.every(
                (one) =>
                    ids.has(one.characterId) &&
                    one.endAt! > one.startAt &&
                    one.endAt! <= Date.now(),
            ),
        ).toBe(true);
        expect(data.goals.every((one) => one.members.every((member) => ids.has(member.id)))).toBe(
            true,
        );
        expect(new Set(data.goals.map((one) => one.kind))).toEqual(
            new Set(['growth', 'combo', 'money', 'gear', 'manual']),
        );
        expect(data.goals.every((one) => parseGoal(one))).toBe(true);
        expect(data.income.some((one) => one.kind === 'income')).toBe(true);
        expect(data.income.some((one) => one.kind === 'expense')).toBe(true);
        expect(new Set(data.accounts.map((one) => one.currency))).toEqual(new Set(['cash', 'rmb']));
        expect(new Set(data.accounts.map((one) => one.kind))).toEqual(
            new Set(['income', 'expense']),
        );
        const counts = demoCounts(data);
        expect(counts).toEqual({
            characters: data.characters.length,
            prices: data.prices.length,
            income: data.income.length,
            accounts: data.accounts.length,
            goals: data.goals.length,
            warehouse: data.warehouse.length,
            online: data.online.length,
        });
    });

    it('穿戴与买入资产在仓库，已售出仅留成交快照，删除售出后有资料可回仓', () => {
        const data = buildDemoData();
        const stocked = new Set(data.warehouse.map((one) => one.id));
        const owned = data.characters
            .flatMap((one) => [...one.gear, ...one.pets])
            .map((one) => one.warehouseId)
            .filter(Boolean);
        expect(owned.every((id) => stocked.has(id!))).toBe(true);
        expect(stocked.has('demo-bought-pet')).toBe(true);
        expect(stocked.has('demo-sold-gear')).toBe(false);
        expect(
            data.accounts.find((one) => one.id === 'demo-account-pet-buy')?.assets?.[0],
        ).toMatchObject({ id: 'demo-bought-pet', kind: 'pet' });
        expect(
            data.accounts.find((one) => one.id === 'demo-account-gear-sale')?.assets?.[0],
        ).toMatchObject({
            id: 'demo-sold-gear',
            kind: 'gear',
            gear: { detail: { name: '霜冷九州' } },
        });
    });

    it('固定单价对应同名物价的当前价，重复生成编号稳定且没有共享可变对象', () => {
        const first = buildDemoData();
        const next = buildDemoData();
        expect(next.characters.map((one) => one.id)).toEqual(first.characters.map((one) => one.id));
        expect(next.warehouse.map((one) => one.id)).toEqual(first.warehouse.map((one) => one.id));
        for (const price of first.quickPrices) {
            expect(
                first.prices
                    .find((one) => one.id === `demo-quick-price-${price.itemId}`)
                    ?.points.at(-1)?.price,
            ).toBe(price.price);
        }
        first.characters[0].name = '临时修改';
        first.warehouse[0].server = '临时修改';
        expect(next.characters[0].name).not.toBe('临时修改');
        expect(next.warehouse[0].server).not.toBe('临时修改');
    });
});
