import type { EquipmentEntry } from '../../services/game-data';
import { GEAR_SLOT_ICON, type GearSlot } from './gear';
import { GEAR_RULES } from '../../services/game-rules';
const compact = (value: string) => value.normalize('NFKC').replace(/\s/g, '');

/* ---- 记忆化 ----
 * 一次「装备」页渲染要查 12 格、每格 2 次（`v-if` 与 `:src` 各一次），卡片多起来就是
 * 上千次。每次查询都要对全部名录做一次 `filter`——名录实测 334 条（装备 83 + 武器 231 +
 * 灵石 20），外加 `compact()` 的 `NFKC` 归一化。名字与部位在一张卡里是固定的，
 * 所以按「名录这一份引用 + 这几项输入」缓存即可。
 *
 * 外层用 `WeakMap` 挂在 `entries` 上，不做全局单例：名录换了（`loadEquipmentNames()
 * 重新 resolve` 会给一个新数组），旧表跟着整份回收，不需要手动清。
 */
const memo = new WeakMap<readonly EquipmentEntry[], Map<string, string | null>>();

function cacheKey(slot: GearSlot): string {
    return [
        slot.slot,
        slot.caption ?? '',
        slot.detail?.name ?? '',
        slot.detail?.kind ?? '',
        (slot.detail?.requires ?? []).join('\u0001'),
    ].join('\u0001');
}

/** 名称优先；未收录的低等级装备按类型使用 60 级图，部位之间不串图。 */
export function gearIconFile(slot: GearSlot, entries: readonly EquipmentEntry[]): string | null {
    let table = memo.get(entries);
    if (!table) {
        table = new Map();
        memo.set(entries, table);
    }
    const key = cacheKey(slot);
    const hit = table.get(key);
    if (hit !== undefined) return hit;

    const file = resolveGearIcon(slot, entries);
    table.set(key, file);
    return file;
}

function resolveGearIcon(slot: GearSlot, entries: readonly EquipmentEntry[]): string | null {
    const fallback = GEAR_SLOT_ICON[slot.slot] ?? null;
    if (slot.slot.startsWith('玉魄')) return fallback;
    const candidates = entries.filter((entry) =>
        slot.slot === '武器'
            ? entry.family === 'weapon'
            : entry.family !== 'weapon' &&
              GEAR_RULES[slot.slot]?.groups.some((group) => group.id === entry.group),
    );
    const kind = compact(slot.detail?.kind ?? '');
    const weaponGroup = [...new Set(candidates.map((entry) => entry.group))]
        .sort((a, b) => b.length - a.length)
        .find((group) => kind.includes(compact(group)));
    const female = /女|发钗|发冠/.test([kind, ...(slot.detail?.requires ?? [])].join(''));
    const group =
        slot.slot === '武器'
            ? weaponGroup
            : GEAR_RULES[slot.slot]?.groups[female && ['头', '衣服'].includes(slot.slot) ? 1 : 0]
                  ?.id;
    const names = [slot.detail?.name ?? '', slot.caption ?? ''].map(compact).filter(Boolean);
    const exact = candidates.filter((entry) => names.includes(compact(entry.name)));
    const match = exact.length === 1 ? exact[0] : exact.find((entry) => entry.group === group);
    const entry = match ?? candidates.find((one) => one.level === 60 && one.group === group);
    return entry ? `${entry.family}/${entry.img}` : fallback;
}
