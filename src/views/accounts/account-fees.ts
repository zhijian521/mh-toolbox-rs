/** 藏宝阁普通寄售按分向上收取手续费，账本只记录卖方实得。 */
import { CBG_FEES, type CbgFeeRule } from '../../services/gameplay';
import type { AccountEntry } from './accounts';

type Sale = Pick<AccountEntry, 'kind' | 'currency' | 'category' | 'channel'>;

export function isCbgSale(sale: Sale): boolean {
    return (
        sale.kind === 'income' &&
        sale.currency === 'rmb' &&
        sale.channel === '藏宝阁' &&
        ['游戏币卖出', '装备交易', '召唤兽交易'].includes(sale.category)
    );
}

export function cbgSaleRule(sale: Sale): CbgFeeRule | null {
    if (!isCbgSale(sale) || !CBG_FEES.value) return null;
    return sale.category === '游戏币卖出' ? CBG_FEES.value.coin : CBG_FEES.value.item;
}

/** 用整数分计算，避免 5.015 元被四舍五入或浮点误差多收一分。 */
export function quoteCbgFee(amount: number, rule: CbgFeeRule) {
    const cents = Math.round(amount * 100);
    const weighted = cents * rule.rateBasisPoints;
    if (!Number.isSafeInteger(weighted) || cents <= 0) return null;
    const cap = rule.maxYuan === null ? Infinity : Math.round(rule.maxYuan * 100);
    const fee = Math.min(Math.ceil(weighted / 10000), cap);
    return { gross: cents / 100, fee: fee / 100, net: (cents - fee) / 100 };
}
