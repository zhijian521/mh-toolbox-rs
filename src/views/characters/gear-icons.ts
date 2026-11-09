import type { EquipmentEntry } from '../../services/game-data';
import { GEAR_SLOT_ICON, type GearSlot } from './gear';
import { GEAR_RULES } from '../../services/game-rules';
const compact = (value: string) => value.normalize('NFKC').replace(/\s/g, '');

/** 名称优先；未收录的低等级装备按类型使用 60 级图，部位之间不串图。 */
export function gearIconFile(slot: GearSlot, entries: readonly EquipmentEntry[]): string | null {
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
