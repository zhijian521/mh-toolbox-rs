import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import { normalizeCharacter } from '../characters/roster';
import {
    characterAssetOwners,
    detachSoldCharacterAssets,
    identifyCharacterAssets,
    mergeCharacterAssets,
} from './character-assets';
import { newWarehouseItem } from './warehouse';
import { GEAR_SLOTS } from '../characters/gear';

function role() {
    return identifyCharacterAssets(
        normalizeCharacter({
            id: 'hero',
            name: '甲',
            server: '大雁塔',
            gear: [{ slot: '武器', detail: { name: '斩妖泣血', kind: '', stats: [] } }],
            pets: [{ name: '画魂' }, { name: '画魂' }],
        }),
        true,
    );
}

describe('角色与仓库物品身份', () => {
    it('出售穿戴装备和携带召唤兽只解除匹配编号，不影响其他物品或原档案', () => {
        const character = role();
        const weapon = character.gear.find((item) => item.warehouseId)!;
        const before = JSON.stringify(character);
        const next = detachSoldCharacterAssets([character], new Set([
            weapon.warehouseId!, character.pets[0].warehouseId!,
        ]));
        expect(next[0].gear.find((item) => item.slot === weapon.slot)).toEqual({ slot: weapon.slot });
        expect(next[0].pets).toEqual([character.pets[1]]);
        expect(characterAssetOwners(next).size).toBe(1);
        expect(JSON.stringify(character)).toBe(before);
    });

    it('旧物品按位置稳定纳入，同名召唤兽各有编号，重载不重复', () => {
        const character = role();
        expect(character.pets[0].warehouseId).not.toBe(character.pets[1].warehouseId);
        const inventory = mergeCharacterAssets([], [character]);
        expect(inventory).toHaveLength(3);
        expect(mergeCharacterAssets(inventory, [role()])).toEqual(inventory);
        expect(inventory.every((item) => item.server === '大雁塔')).toBe(true);
    });

    it('改名和更改属性覆盖同一编号，保留原入仓时间且隔离引用', () => {
        const character = role();
        const first = mergeCharacterAssets([], [character]);
        first[0].createdAt = 123;
        const changed = {
            ...character,
            pets: character.pets.map((pet) => ({ ...pet, name: '新名字' })),
        };
        const next = mergeCharacterAssets(first, [changed]);
        expect(next).toHaveLength(3);
        expect(next[0].createdAt).toBe(123);
        expect(
            first.filter((item) => item.kind === 'pet').every((item) => item.pet.name === '画魂'),
        ).toBe(true);
        expect(characterAssetOwners([changed]).size).toBe(3);
    });

    it('替换、卸下、移除或删角色只解除归属，原物品保留', () => {
        const character = role();
        const stock = newWarehouseItem('gear');
        stock.gear.slot = '武器';
        stock.gear.detail.name = '新武器';
        const before = mergeCharacterAssets([stock], [character]);
        const next = { ...character, gear: [{ ...stock.gear, warehouseId: stock.id }], pets: [] };
        const inventory = mergeCharacterAssets(before, [next]);
        expect(inventory).toHaveLength(4);
        expect(characterAssetOwners([next]).size).toBe(1);
        expect(mergeCharacterAssets(inventory, [])).toEqual(inventory);
    });

    it('同编号重复穿戴、跨种类和跨部位均拒绝', () => {
        const character = role();
        expect(() => mergeCharacterAssets([], [character, { ...character, id: 'other' }])).toThrow(
            '重复',
        );
        const pet = newWarehouseItem('pet');
        pet.pet.name = '画魂';
        pet.id = character.gear.find((gear) => gear.warehouseId)!.warehouseId!;
        expect(() => mergeCharacterAssets([pet], [character])).toThrow('种类');
        const gear = newWarehouseItem('gear');
        gear.id = pet.id;
        gear.gear.slot = GEAR_SLOTS.find((slot) => slot !== '武器')!;
        gear.gear.detail.name = '头盔';
        expect(() => mergeCharacterAssets([gear], [character])).toThrow('部位');
    });

    it('卸下后新录入不复用旧编号；仅有名称的旧装备也保留', () => {
        const legacy = identifyCharacterAssets(
            normalizeCharacter({
                id: 'legacy',
                gear: [{ slot: '武器', caption: '旧武器' }],
            }),
            true,
        );
        expect(mergeCharacterAssets([], [legacy])).toHaveLength(1);
        const first = identifyCharacterAssets(
            normalizeCharacter({
                id: 'new',
                gear: [{ slot: '武器', caption: '同名武器' }],
            }),
        );
        const second = identifyCharacterAssets(
            normalizeCharacter({
                id: 'new',
                gear: [{ slot: '武器', caption: '同名武器' }],
            }),
        );
        expect(first.gear.find((gear) => gear.slot === '武器')?.warehouseId).not.toBe(
            second.gear.find((gear) => gear.slot === '武器')?.warehouseId,
        );
    });
});
