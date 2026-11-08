import { onMounted, shallowRef } from 'vue';
import { loadEquipmentNames, type EquipmentEntry } from '../../services/game-data';
import { gearSlotIcon } from '../../services/game-icons';
import type { GearSlot } from './gear';
import { gearIconFile } from './gear-icons';

const entries = shallowRef<EquipmentEntry[]>([]);
let pending: Promise<void> | null = null;

/** 卡片、部位导航与编辑器共享一次加载，名称变化时同步换图。 */
export function useGearIcon() {
    onMounted(() => {
        if (entries.value.length || pending) return;
        pending = loadEquipmentNames()
            .then((value) => {
                entries.value = value;
            })
            .catch((error: unknown) => {
                console.error('装备图标名录加载失败', error);
            })
            .finally(() => {
                pending = null;
            });
    });
    return (slot: GearSlot): string | undefined => {
        const file = gearIconFile(slot, entries.value);
        return file ? gearSlotIcon(file) : undefined;
    };
}
