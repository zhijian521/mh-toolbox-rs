import { describe, expect, it } from 'vitest';
import { planPriceImport } from './price-import';

describe('单价导入预览', () => {
    it('只统计实际新增和覆盖，相同价格独立统计，未提及价格保留', () => {
        const plan = planPriceImport({ 1: 100, 2: 200, 9: 900 }, [
            { itemId: 1, price: 100 },
            { itemId: 2, price: 250 },
            { itemId: 3, price: 300 },
        ]);
        expect(plan).toEqual({
            next: { 1: 100, 2: 250, 3: 300, 9: 900 },
            added: 1,
            updated: 1,
            unchanged: 1,
        });
    });

    it('忽略非法值，重复 id 以最后一个有效价格为准且只计一次', () => {
        expect(
            planPriceImport({}, [
                { itemId: 1, price: 100 },
                { itemId: 1, price: 200 },
                { itemId: 2, price: null },
                { itemId: -1, price: 20 },
            ]),
        ).toEqual({ next: { 1: 200 }, added: 1, updated: 0, unchanged: 0 });
    });
});
