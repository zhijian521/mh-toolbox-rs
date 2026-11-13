import type { QuickPrices } from './income';

/** 导入预览和实际合并共用规则；相同价格不算覆盖，也不触发写盘。 */
export function planPriceImport(
    current: QuickPrices,
    incoming: readonly { itemId: number; price: number | null }[],
) {
    const imported = new Map<number, number>();
    for (const one of incoming) {
        if (!Number.isInteger(one.itemId) || one.itemId <= 0) continue;
        if (typeof one.price !== 'number' || !Number.isFinite(one.price) || one.price <= 0)
            continue;
        imported.set(one.itemId, one.price);
    }
    const next = { ...current };
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const [id, price] of imported) {
        if (!(id in current)) added += 1;
        else if (current[id] !== price) updated += 1;
        else unchanged += 1;
        next[id] = price;
    }
    return { next, added, updated, unchanged };
}
