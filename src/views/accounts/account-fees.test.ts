import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import { CBG_FEES } from '../../services/gameplay';
import { cbgSaleRule, isCbgSale, quoteCbgFee } from './account-fees';

describe('藏宝阁普通寄售手续费', () => {
    it('官方小数示例按分向上取整，整分不多收', () => {
        const rule = CBG_FEES.value!.coin;
        expect(quoteCbgFee(100.3, rule)).toEqual({ gross: 100.3, fee: 5.02, net: 95.28 });
        expect(quoteCbgFee(100, rule)).toEqual({ gross: 100, fee: 5, net: 95 });
        expect(quoteCbgFee(0.2, rule)).toEqual({ gross: 0.2, fee: 0.01, net: 0.19 });
        expect(quoteCbgFee(0.21, rule)).toEqual({ gross: 0.21, fee: 0.02, net: 0.19 });
    });

    it('物品封顶前后按同一口径，梦幻币不封顶', () => {
        const rules = CBG_FEES.value!;
        expect(quoteCbgFee(19999.8, rules.item)?.fee).toBe(999.99);
        expect(quoteCbgFee(20000, rules.item)?.fee).toBe(1000);
        expect(quoteCbgFee(20000.01, rules.item)?.fee).toBe(1000);
        expect(quoteCbgFee(30000, rules.coin)?.fee).toBe(1500);
    });

    it('无效金额与超出整数计算精度的金额不产生报价', () => {
        for (const amount of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
            expect(quoteCbgFee(amount, CBG_FEES.value!.coin)).toBeNull();
        }
    });

    it('只有藏宝阁人民币卖出适用，其他分类不猜测费用', () => {
        const sale = {
            kind: 'income',
            currency: 'rmb',
            channel: '藏宝阁',
            category: '游戏币卖出',
        } as const;
        expect(cbgSaleRule(sale)).toBe(CBG_FEES.value!.coin);
        expect(cbgSaleRule({ ...sale, category: '召唤兽交易' })).toBe(CBG_FEES.value!.item);
        expect(isCbgSale({ ...sale, kind: 'expense' })).toBe(false);
        expect(isCbgSale({ ...sale, currency: 'cash' })).toBe(false);
        expect(cbgSaleRule({ ...sale, channel: '游戏内' })).toBeNull();
        expect(cbgSaleRule({ ...sale, category: '其他收支' })).toBeNull();
    });
});
