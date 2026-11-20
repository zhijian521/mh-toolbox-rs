/** 仓库物品独立编号；识别只生成草稿，保存后才入仓，不隐式产生收支。 */
import type { DeepReadonly } from 'vue';
import { isObject, makeId, rawText, rows, stamp } from '../../services/shape';
import { normalizeGearDetail, normalizeGearMeta, normalizePet } from '../characters/details';
import {
    GEAR_SLOTS,
    hasGearDetail,
    type GearDetail,
    type GearSlot,
    type GearStat,
} from '../characters/gear';
import type { Pet } from '../characters/pets';
import { gearPanelParts, mergeGearPanel, type GearPanelResult } from '../characters/ocr/gear-panel';

interface ItemBase {
    id: string;
    server: string;
    createdAt: number;
    updatedAt: number;
}
export interface WarehouseGear extends ItemBase {
    kind: 'gear';
    gear: GearSlot & { detail: GearDetail };
    /** 同图载体读数单独留存，不混入玉魄属性，也不重复保存到另一枚玉魄。 */
    soul?: GearStat[];
}
export interface WarehousePet extends ItemBase {
    kind: 'pet';
    pet: Pet;
}
export type WarehouseItem = WarehouseGear | WarehousePet;
export type ReadonlyWarehouseItem = DeepReadonly<WarehouseItem>;
export type WarehouseKind = WarehouseItem['kind'];
export type WarehouseState = 'all' | 'equipped' | 'stock' | 'sold';

/** 全部包含成交快照；未穿戴只返回实物库存，供浏览与交易选取区分。 */
export function warehouseItemsByState(
    inventory: readonly ReadonlyWarehouseItem[],
    sold: readonly ReadonlyWarehouseItem[],
    owners: ReadonlyMap<string, string>,
    state: WarehouseState,
): readonly ReadonlyWarehouseItem[] {
    if (state === 'all') return [...inventory, ...sold];
    if (state === 'sold') return sold;
    return inventory.filter((item) => owners.has(item.id) === (state === 'equipped'));
}

export function normalizeWarehouseItem(raw: unknown): WarehouseItem | null {
    if (!isObject(raw) || !rawText(raw.id).trim()) return null;
    const base: ItemBase = {
        id: rawText(raw.id).trim(),
        server: rawText(raw.server),
        createdAt: stamp(raw.createdAt),
        updatedAt: stamp(raw.updatedAt),
    };
    if (raw.kind === 'pet') {
        const pet = normalizePet(raw.pet);
        if (pet) delete pet.warehouseId;
        return pet ? { ...base, kind: 'pet', pet } : null;
    }
    if (raw.kind !== 'gear' || !isObject(raw.gear)) return null;
    const savedGear = raw.gear;
    const slot = GEAR_SLOTS.find((one) => one === savedGear.slot);
    const detail = normalizeGearDetail(savedGear.detail);
    if (!slot || !detail || !hasGearDetail(detail)) return null;
    const soul = normalizeGearMeta({ soul: raw.soul }).soul;
    return {
        ...base,
        kind: 'gear',
        gear: { slot, caption: rawText(savedGear.caption) || detail.name, detail },
        ...(soul?.length ? { soul } : {}),
    };
}

/** 损坏、重复身份不能当作空仓库继续保存，避免覆盖原始数据。 */
export function parseWarehouse(raw: unknown): WarehouseItem[] {
    if (!Array.isArray(raw)) throw new TypeError('仓库数据不是数组');
    const seen = new Set<string>();
    return raw.map((value) => {
        const item = normalizeWarehouseItem(value);
        if (!item || seen.has(item.id)) throw new TypeError('仓库存在无法读取或编号重复的物品');
        seen.add(item.id);
        return item;
    });
}

export function warehouseName(item: ReadonlyWarehouseItem): string {
    return item.kind === 'gear'
        ? item.gear.detail?.name || item.gear.caption || item.gear.slot
        : item.pet.name;
}

export function filterWarehouse(
    items: readonly ReadonlyWarehouseItem[],
    kind: WarehouseKind,
    keyword = '',
    slot = '',
): ReadonlyWarehouseItem[] {
    const search = keyword.trim().toLocaleLowerCase();
    return items
        .filter((item) => {
            if (item.kind !== kind) return false;
            if (slot && (item.kind !== 'gear' || item.gear.slot !== slot)) return false;
            const fields = [warehouseName(item), item.server];
            if (item.kind === 'gear') {
                fields.push(
                    item.gear.slot,
                    item.gear.detail?.kind ?? '',
                    item.gear.detail?.note ?? '',
                );
                for (const row of rows(item.gear.detail?.lines)) {
                    if (isObject(row)) fields.push(rawText(row.value));
                }
            } else fields.push(...item.pet.skills);
            return !search || fields.some((field) => field.toLocaleLowerCase().includes(search));
        })
        .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function newWarehouseItem(kind: 'gear', now?: number): WarehouseGear;
export function newWarehouseItem(kind: 'pet', now?: number): WarehousePet;
export function newWarehouseItem(kind: WarehouseKind, now?: number): WarehouseItem;
export function newWarehouseItem(kind: WarehouseKind, now = Date.now()): WarehouseItem {
    const base = { id: makeId('asset'), server: '', createdAt: now, updatedAt: now };
    return kind === 'gear'
        ? {
              ...base,
              kind,
              gear: {
                  slot: GEAR_SLOTS[0] ?? '武器',
                  detail: { name: '', kind: '', stats: [] },
              },
          }
        : { ...base, kind, pet: { ...normalizePet({ name: '未命名' })!, name: '' } };
}

/** 新增允许同部位多件；编辑只替换当前物品，同图的另一枚玉魄保留为独立草稿。 */
export function recognizeWarehouseGear(
    current: WarehouseGear,
    result: GearPanelResult,
    companions: readonly WarehouseGear[] = [],
): WarehouseGear[] {
    const parts = gearPanelParts(result).filter((part) => part.slot && part.hit);
    const primary = parts.find((part) => part.slot === current.gear.slot) ?? parts[0];
    if (!primary) return [current];
    return [primary, ...parts.filter((part) => part !== primary)].map<WarehouseGear>(
        (part, index) => {
            const base =
                index === 0
                    ? current
                    : (companions.find((one) => one.gear.slot === part.slot) ??
                      newWarehouseItem('gear'));
            const detail = normalizeGearDetail(
                mergeGearPanel({ ...base.gear, slot: part.slot! }, part).detail,
            )!;
            return {
                ...base,
                kind: 'gear',
                server: base.server || current.server,
                gear: { slot: part.slot!, caption: detail.name, detail },
                soul: result.soul
                    ? index === 0
                        ? result.soul.map((row) => ({ ...row }))
                        : undefined
                    : base.soul,
            };
        },
    );
}
