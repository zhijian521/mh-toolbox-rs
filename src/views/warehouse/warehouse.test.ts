import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import {
    filterWarehouse,
    newWarehouseItem,
    normalizeWarehouseItem,
    parseWarehouse,
    recognizeWarehouseGear,
    warehouseItemsByState,
} from './warehouse';
import type { GearPanelResult } from '../characters/ocr/gear-panel';

describe('仓库物品与截图草稿', () => {
    it('全部包含售出快照，已穿戴和未穿戴仍仅来自在仓物品', () => {
        const worn = newWarehouseItem('gear', 1);
        const stock = { ...newWarehouseItem('pet', 2), id: 'stock' };
        const sold = { ...newWarehouseItem('gear', 3), id: 'sold' };
        const inventory = [worn, stock];
        const sales = [sold];
        const owners = new Map([[worn.id, '测试角色']]);
        const before = JSON.stringify({ inventory, sales });

        expect(warehouseItemsByState(inventory, sales, owners, 'all')).toEqual([worn, stock, sold]);
        expect(warehouseItemsByState(inventory, sales, owners, 'equipped')).toEqual([worn]);
        expect(warehouseItemsByState(inventory, sales, owners, 'stock')).toEqual([stock]);
        expect(warehouseItemsByState(inventory, sales, owners, 'sold')).toEqual([sold]);
        expect(warehouseItemsByState([], [], owners, 'all')).toEqual([]);
        expect(JSON.stringify({ inventory, sales })).toBe(before);
    });

    it('同名同部位保留独立身份，不按属性自动合并', () => {
        const first = newWarehouseItem('gear');
        first.gear.detail.name = '霜冷九州';
        const second = { ...first, id: 'another' };
        expect(parseWarehouse([first, second])).toHaveLength(2);
        expect(() => parseWarehouse([first, first])).toThrow('编号重复');
        expect(() => parseWarehouse([first, null])).toThrow('无法读取');
    });

    it('同图双玉魄保存两件，共用命魂只存一份；连续识别复用草稿编号', () => {
        const source = newWarehouseItem('gear');
        source.gear.slot = '玉魄·阳';
        source.gear.detail.note = '自用备注';
        const result: GearPanelResult = {
            slot: '玉魄·阳',
            hit: 2,
            total: 2,
            detail: { name: '上古玉魄', stats: [{ label: '伤害', value: '10' }] },
            soul: [{ label: '防御', value: '20' }],
            related: [
                { slot: '玉魄·阴', hit: 1, total: 1, detail: { name: '上古玉魄', stats: [] } },
            ],
        };
        const first = recognizeWarehouseGear(source, result);
        expect(first).toHaveLength(2);
        expect(first[0].id).toBe(source.id);
        expect(first[0].gear.detail.note).toBe('自用备注');
        expect(first[0].soul).toEqual(result.soul);
        expect(first[1].soul).toBeUndefined();
        const again = recognizeWarehouseGear(first[0], result, first.slice(1));
        expect(again.map((item) => item.id)).toEqual(first.map((item) => item.id));
        expect(source.gear.detail.stats).toEqual([]);
    });

    it('宝宝保留成长、寿命和技能，按技能搜索，空名称不能入仓', () => {
        const item = newWarehouseItem('pet');
        expect(normalizeWarehouseItem(item)).toBeNull();
        item.pet.name = '画魂';
        item.pet.growth = '1.287';
        item.pet.life = 8000;
        item.pet.skills = ['高级魔之心'];
        const restored = parseWarehouse([item]);
        expect(restored[0]).toMatchObject({ pet: { growth: '1.287', life: 8000 } });
        expect(filterWarehouse(restored, 'pet', '高级魔之心')).toHaveLength(1);
        expect(filterWarehouse(restored, 'gear')).toHaveLength(0);
    });
});
