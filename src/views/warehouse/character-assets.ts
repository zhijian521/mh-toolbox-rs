/** 角色物品以稳定编号关联仓库；换下只解除归属，编辑与重载不复制物品。 */
import { makeId } from '../../services/shape';
import type { CharacterData, ReadonlyCharacter } from '../characters/character';
import { hasGearDetail } from '../characters/gear';
import {
    normalizeWarehouseItem,
    parseWarehouse,
    type ReadonlyWarehouseItem,
    type WarehouseItem,
} from './warehouse';

export function identifyCharacterAssets(character: CharacterData, legacy = false): CharacterData {
    return {
        ...character,
        gear: character.gear.map((gear) => {
            const detail = hasGearDetail(gear.detail)
                ? gear.detail
                : gear.caption?.trim()
                  ? { name: gear.caption, kind: '', stats: [] }
                  : undefined;
            return detail
                ? {
                      ...gear,
                      detail,
                      warehouseId:
                          gear.warehouseId ||
                          (legacy ? `${character.id}/gear/${gear.slot}` : makeId('asset')),
                  }
                : { slot: gear.slot };
        }),
        pets: character.pets.map((pet, index) => ({
            ...pet,
            warehouseId:
                pet.warehouseId || (legacy ? `${character.id}/pet/${index}` : makeId('asset')),
        })),
    };
}

export function characterAssetOwners(roster: readonly ReadonlyCharacter[]): Map<string, string> {
    const owners = new Map<string, string>();
    for (const character of roster) {
        for (const item of [...character.gear, ...character.pets]) {
            if (!item.warehouseId) continue;
            if (owners.has(item.warehouseId)) throw new Error('同一件物品不能重复穿戴或携带');
            owners.set(item.warehouseId, character.name || '未命名角色');
        }
    }
    return owners;
}

/** 卖出只解除对应编号的归属；装备空位保留，其他档案与未售出物品不变。 */
export function detachSoldCharacterAssets(
    roster: readonly ReadonlyCharacter[],
    soldIds: ReadonlySet<string>,
): ReadonlyCharacter[] {
    return roster.map((character) => {
        const gear: ReadonlyCharacter['gear'] = character.gear.map((item) =>
            item.warehouseId && soldIds.has(item.warehouseId) ? { slot: item.slot } : item,
        );
        const pets = character.pets.filter(
            (item) => !item.warehouseId || !soldIds.has(item.warehouseId),
        );
        const soldJade = character.gear.some(
            (item) =>
                item.slot.startsWith('玉魄') && item.warehouseId && soldIds.has(item.warehouseId),
        );
        const gearMeta = { ...character.gearMeta };
        if (soldJade && !gear.some((item) => item.slot.startsWith('玉魄') && item.warehouseId))
            delete gearMeta.soul;
        return { ...character, gear, pets, gearMeta };
    });
}

export function mergeCharacterAssets(
    inventory: readonly ReadonlyWarehouseItem[],
    roster: readonly ReadonlyCharacter[],
): WarehouseItem[] {
    characterAssetOwners(roster);
    const items = new Map(parseWarehouse(inventory).map((item) => [item.id, item]));
    for (const character of roster) {
        const base = {
            server: character.server,
            createdAt: 0,
            updatedAt: character.updatedAt ?? 0,
        };
        let soulSaved = false;
        for (const gear of character.gear) {
            if (!hasGearDetail(gear.detail) || !gear.warehouseId) continue;
            const soul =
                !soulSaved && gear.slot.startsWith('玉魄') ? character.gearMeta.soul : undefined;
            if (soul?.length) soulSaved = true;
            const current = items.get(gear.warehouseId);
            if (current && (current.kind !== 'gear' || current.gear.slot !== gear.slot))
                throw new Error('仓库物品种类或部位已变化，请重新选择');
            const item = normalizeWarehouseItem({
                ...base,
                id: gear.warehouseId,
                kind: 'gear',
                gear,
                soul,
                server: character.server || current?.server || '',
                createdAt: current?.createdAt ?? base.createdAt,
            });
            if (item) items.set(item.id, item);
        }
        for (const pet of character.pets) {
            if (!pet.warehouseId) continue;
            const current = items.get(pet.warehouseId);
            if (current && current.kind !== 'pet')
                throw new Error('仓库物品种类已变化，请重新选择');
            const item = normalizeWarehouseItem({
                ...base,
                id: pet.warehouseId,
                kind: 'pet',
                pet,
                server: character.server || current?.server || '',
                createdAt: current?.createdAt ?? base.createdAt,
            });
            if (item) items.set(item.id, item);
        }
    }
    return [...items.values()];
}
