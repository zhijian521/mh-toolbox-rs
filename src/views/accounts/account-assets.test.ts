import { beforeAll, describe, expect, it } from 'vitest';
import {
    accountAssetKind,
    normalizeAccountAssets,
    planAssetTrade,
    planSaleReturn,
    soldWarehouseItems,
} from './account-assets';
import type { AccountEntry } from './accounts';
import { normalizeWarehouseItem } from '../warehouse/warehouse';

beforeAll(async () => { await import('../../services/game-data.fixture'); });

const pet = () => normalizeWarehouseItem({
    id: 'pet-1', kind: 'pet', server: '测试区', createdAt: 1, updatedAt: 1,
    pet: { name: '画魂', growth: '1.287', life: '9999', skills: ['高级必杀'] },
})!;

function sale(id: string, createdAt: number, assets = [pet()]): AccountEntry {
    return {
        id, createdAt, assets, date: '2026-11-17', characterId: '', kind: 'income',
        currency: 'rmb', category: '召唤兽交易', channel: '游戏内', amount: 100, note: '', source: '',
    };
}

describe('交易物品与库存计划', () => {
    it('装备与召唤兽分类独立，买入隔离草稿，卖出保留交易快照', () => {
        expect(accountAssetKind('装备交易')).toBe('gear');
        expect(accountAssetKind('召唤兽交易')).toBe('pet');
        expect(accountAssetKind('其他收支')).toBeNull();
        const item = pet();
        const bought = planAssetTrade('召唤兽交易', 'expense', [item], []);
        expect(bought.inventory).toHaveLength(1);
        if (item.kind === 'pet') item.pet.name = '草稿变更';
        expect(bought.assets[0]).toMatchObject({ pet: { name: '画魂', growth: '1.287' } });
        const sold = planAssetTrade('召唤兽交易', 'income', bought.assets, bought.inventory);
        expect(sold.inventory).toEqual([]);
        expect(sold.assets[0]).toMatchObject({ pet: { skills: ['高级必杀'] } });
    });

    it('拒绝错分类、重复物品、过期选择及重复买入或卖出', () => {
        const item = pet();
        expect(() => planAssetTrade('装备交易', 'expense', [item], [])).toThrow();
        expect(() => planAssetTrade('召唤兽交易', 'expense', [item, item], [])).toThrow();
        expect(() => planAssetTrade('召唤兽交易', 'expense', [item], [item])).toThrow();
        expect(() => planAssetTrade('召唤兽交易', 'income', [item], [])).toThrow();
        expect(() => planAssetTrade('召唤兽交易', 'income', [{ ...item, server: '旧区服' }], [item])).toThrow();
        expect(() => planAssetTrade('召唤兽交易', 'expense', [], [])).toThrow();
        expect(() => normalizeAccountAssets([{ id: 'broken' }])).toThrow();
        expect(normalizeAccountAssets(undefined)).toEqual([]);
    });

    it('已卖出只读成交快照，忽略买入、普通收入、自动账目及在仓物品', () => {
        const first = sale('first', 1);
        const latest = sale('latest', 2, [{ ...pet(), server: '成交时区服' }]);
        const stocked = { ...pet(), id: 'stocked' };
        const entries = [
            first, latest, sale('in-stock', 3, [stocked]),
            { ...sale('purchase', 4, [{ ...pet(), id: 'bought' }]), kind: 'expense' as const },
            { ...sale('other', 5, [{ ...pet(), id: 'other' }]), category: '其他收支' },
            { ...sale('auto', 6, [{ ...pet(), id: 'auto' }]), source: 'auto' },
        ];
        const before = JSON.stringify(entries);
        expect(soldWarehouseItems(entries, [stocked])).toEqual(latest.assets);
        expect(JSON.stringify(entries)).toBe(before);
        expect(soldWarehouseItems([], [])).toEqual([]);
    });

    it('撤销卖出批量回仓且不覆盖在仓资料，不复活仍被较新记录卖出的物品', () => {
        const first = sale('first', 1);
        const second = { ...pet(), id: 'second' };
        const latest = sale('latest', 2, [pet(), second]);
        expect(planSaleReturn(first.id, [first, latest], [])).toEqual([]);
        const current = { ...pet(), server: '仓库中已修改' };
        const restored = planSaleReturn(latest.id, [first, latest], [current]);
        expect(restored).toEqual([current, second]);
        if (restored[0].kind === 'pet') restored[0].pet.name = '回仓草稿修改';
        expect(current.kind === 'pet' && current.pet.name).toBe('画魂');
        expect(latest.assets?.[0]).toMatchObject({ pet: { name: '画魂' } });
    });
});
