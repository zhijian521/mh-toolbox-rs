/** 交易快照保留成交资料；买卖与撤销卖出统一规划库存变更。 */
import type { AccountEntry, AccountKind } from './accounts';
import { gameDataReady } from '../../services/game-data';
import {
    normalizeWarehouseItem,
    parseWarehouse,
    type ReadonlyWarehouseItem,
    type WarehouseItem,
    type WarehouseKind,
} from '../warehouse/warehouse';

export function accountAssetKind(category: string): WarehouseKind | null {
    return category === '装备交易' ? 'gear' : category === '召唤兽交易' ? 'pet' : null;
}

export function normalizeAccountAssets(raw: unknown): WarehouseItem[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new TypeError('关联物品资料不完整');
    if (raw.length && !gameDataReady.value) throw new Error('游戏规则尚未加载，暂不读取交易物品');
    const items = raw.map(normalizeWarehouseItem);
    if (items.some((item) => !item) || new Set(items.map((item) => item?.id)).size !== items.length)
        throw new TypeError('关联物品资料无效或重复');
    return items as WarehouseItem[];
}

export function planAssetTrade(
    category: string,
    direction: AccountKind,
    drafts: readonly ReadonlyWarehouseItem[],
    inventory: readonly ReadonlyWarehouseItem[],
): { assets: WarehouseItem[]; inventory: WarehouseItem[] } {
    const kind = accountAssetKind(category);
    const assets = normalizeAccountAssets(drafts);
    if (!kind || !assets.length || assets.some((item) => item.kind !== kind))
        throw new Error('请选择与交易分类一致的物品');
    const byId = new Map(inventory.map((item) => [item.id, item]));
    for (const item of assets) {
        const current = byId.get(item.id);
        if (direction === 'expense' && current) throw new Error('这件物品已在仓库中');
        if (direction === 'income' && JSON.stringify(normalizeWarehouseItem(current)) !== JSON.stringify(item))
            throw new Error('所选物品已被修改或移出仓库，请重新选择');
    }
    const ids = new Set(assets.map((item) => item.id));
    const next = direction === 'expense'
        ? [...inventory, ...assets]
        : inventory.filter((item) => !ids.has(item.id));
    return { assets, inventory: next.map((item) => normalizeWarehouseItem(item)!) };
}

/** 同一编号只认最后一笔卖出；重复导入的旧记录不能覆盖较新的成交资料。 */
function latestSales(entries: readonly AccountEntry[]) {
    const sales = new Map<string, { entryId: string; item: ReadonlyWarehouseItem }>();
    const ordered = [...entries].sort(
        (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id),
    );
    for (const entry of ordered) {
        if (entry.kind !== 'income' || entry.source === 'auto') continue;
        const kind = accountAssetKind(entry.category);
        if (!kind) continue;
        for (const item of entry.assets ?? []) {
            if (item.kind === kind && !sales.has(item.id))
                sales.set(item.id, { entryId: entry.id, item });
        }
    }
    return sales;
}

/** 已卖出从账目快照派生，仓库里已有的物品不重复展示。 */
export function soldWarehouseItems(
    entries: readonly AccountEntry[],
    inventory: readonly ReadonlyWarehouseItem[],
): ReadonlyWarehouseItem[] {
    const stocked = new Set(inventory.map((item) => item.id));
    return [...latestSales(entries).values()]
        .filter(({ item }) => !stocked.has(item.id))
        .map(({ item }) => item);
}

/** 撤销卖出保留当前库存资料；仍由另一笔较新卖出持有的物品不回仓。 */
export function planSaleReturn(
    entryId: string,
    entries: readonly AccountEntry[],
    inventory: readonly ReadonlyWarehouseItem[],
): WarehouseItem[] {
    const stocked = new Set(inventory.map((item) => item.id));
    const returned = [...latestSales(entries).values()]
        .filter((sale) => sale.entryId === entryId && !stocked.has(sale.item.id))
        .map((sale) => sale.item);
    return parseWarehouse([...inventory, ...returned]);
}
