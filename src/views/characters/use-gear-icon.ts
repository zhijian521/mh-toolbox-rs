import { onMounted, shallowRef } from 'vue';
import { loadEquipmentNames, type EquipmentEntry } from '../../services/game-data';
import { gearSlotIcon } from '../../services/game-icons';
import type { GearSlot } from './gear';
import { gearIconFile } from './gear-icons';

const entries = shallowRef<EquipmentEntry[]>([]);
let pending: Promise<void> | null = null;

/**
 * 装备部位图标：卡片、编辑器与部位导航共享一次名录加载，名称变化时同步换图。
 *
 * 返回两个查法，**取决于调用方是「一件」还是「一排」**：
 * - `icon(slot)` 查一件；
 * - `many(slots)` 一次取一排，给出 `Map<部位, 图地址>`。
 *
 * 为什么要有 `many`：模板里 `v-if="icon(slot)"` 加 `:src="icon(slot)"` 会把同一件
 * 查两次，装备页 12 格就是 24 次。`many` 在 `computed` 里跑一遍，模板只查表。
 * 查表本身不再遍历名录——`gearIconFile` 内部已按「名录引用 + 这几项输入」记忆化。
 */
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
    function icon(slot: GearSlot): string | undefined {
        const file = gearIconFile(slot, entries.value);
        return file ? gearSlotIcon(file) : undefined;
    }
    /** 名录没加载完时返回空表——与 `icon()` 返回 `undefined` 同义，调用方照旧回退首字。 */
    function many(slots: readonly GearSlot[]): Map<string, string> {
        const table = new Map<string, string>();
        if (!entries.value.length) return table;
        for (const slot of slots) {
            const file = gearIconFile(slot, entries.value);
            if (file) table.set(slot.slot, gearSlotIcon(file));
        }
        return table;
    }
    return { icon, many };
}
