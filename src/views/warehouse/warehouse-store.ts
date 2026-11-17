/** 仓库状态由各页面共用；新增、覆盖与删除统一归一并进入现有写队列。 */
import { computed, readonly, ref } from 'vue';
import { useRoster } from '../characters/roster';
import type { ReadonlyCharacter } from '../characters/character';
import { characterAssetOwners, mergeCharacterAssets } from './character-assets';
import { recoverCharacterAssetsLocal } from '../../services/character-assets-local';
import { gameDataReady } from '../../services/game-data';
import { readLocalData, writeLocalData } from '../../services/local-data';
import { loadData } from '../../services/load-data';
import { createPersist } from '../../services/persist';
import { recoverAssetTradeLocal } from '../../services/asset-trade-local';
import { warehouseLoad, warehouseSave } from '../../services/storage';
import {
    normalizeWarehouseItem,
    parseWarehouse,
    type ReadonlyWarehouseItem,
    type WarehouseItem,
} from './warehouse';

const STORAGE_KEY = 'mh-warehouse';
const items = ref<WarehouseItem[]>([]);
const loaded = ref(false);
const loadError = ref('');
const writeError = ref('');
const operationError = ref('');
const tradePending = ref(false);
const characterPending = ref(false);
// 归属在 computed 内惰性读取，两个模块初始化时不能提前展开对方的状态。
const owners = computed(() => characterAssetOwners(useRoster().roster.value));
const inventory = computed(() => mergeCharacterAssets(items.value, useRoster().roster.value));
const persist = createPersist({
    label: '仓库',
    loaded,
    loadError,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, items.value),
    writeRemote: () => warehouseSave(items.value),
});

export async function loadWarehouse(): Promise<void> {
    if (tradePending.value || characterPending.value || persist.pending.value || writeError.value)
        return;
    await loadData({
        loaded,
        loadError,
        error: '仓库读取失败，已暂停写入，请重新读取',
        readLocal: () => {
            try {
                recoverAssetTradeLocal();
                recoverCharacterAssetsLocal();
            } catch {
                return { ok: false, error: '关联交易恢复失败，请重新读取' };
            }
            return readLocalData(STORAGE_KEY, parseWarehouse);
        },
        readRemote: warehouseLoad,
        applyLocal: (value) => {
            const next = value ?? [];
            mergeCharacterAssets(next, useRoster().roster.value);
            items.value = next;
        },
        applyRemote: (value) => {
            const next = parseWarehouse(value);
            mergeCharacterAssets(next, useRoster().roster.value);
            items.value = next;
        },
    });
}

/** 关联交易由账号写队列一次落库；完成前仓库不能单独改写。 */
export function stageWarehouseTrade(next: WarehouseItem[]): boolean {
    if (
        characterPending.value ||
        useRoster().pending.value ||
        tradePending.value ||
        persist.pending.value ||
        writeError.value ||
        !persist.canWrite() ||
        [...owners.value.keys()].some((id) => !next.some((item) => item.id === id))
    )
        return false;
    items.value = parseWarehouse(next);
    tradePending.value = true;
    return true;
}
export function warehouseTradeSnapshot(): WarehouseItem[] | null {
    return tradePending.value ? items.value : null;
}
export function finishWarehouseTrade(): void {
    tradePending.value = false;
}

/** 名册与库存由名册队列一次落库，失败保留联动锁，重试不重复入仓。 */
export function stageCharacterWarehouse(
    before: readonly ReadonlyCharacter[],
    next: readonly ReadonlyCharacter[],
): boolean {
    operationError.value = '';
    try {
        const signature = (roster: readonly ReadonlyCharacter[]) =>
            JSON.stringify(
                mergeCharacterAssets([], roster).map((item) => ({ ...item, updatedAt: 0 })),
            );
        if (signature(before) === signature(next)) return true;
        if (
            tradePending.value ||
            persist.pending.value ||
            writeError.value ||
            !persist.canWrite()
        ) {
            operationError.value = '仓库尚未就绪或有未完成写入，请先处理后再保存角色';
            return false;
        }
        items.value = mergeCharacterAssets(mergeCharacterAssets(items.value, before), next);
        characterPending.value = true;
        return true;
    } catch (error) {
        operationError.value = error instanceof Error ? error.message : '无法关联角色物品';
        return false;
    }
}
export function characterWarehouseSnapshot(): WarehouseItem[] | null {
    return characterPending.value ? items.value : null;
}
export function finishCharacterWarehouse(): void {
    characterPending.value = false;
}

export function useWarehouse() {
    function save(drafts: readonly ReadonlyWarehouseItem[], expected?: string): boolean {
        operationError.value = '';
        if (
            characterPending.value ||
            useRoster().pending.value ||
            tradePending.value ||
            !persist.canWrite()
        )
            return false;
        if (!gameDataReady.value) {
            operationError.value = '游戏规则尚未加载，请重试后保存';
            return false;
        }
        if (!drafts.length) return false;
        const current = items.value.find((one) => one.id === drafts[0].id);
        if (expected !== undefined && JSON.stringify(current) !== expected) {
            operationError.value = '这件物品已被修改或删除，请返回仓库重新打开';
            return false;
        }
        const seen = new Set<string>();
        const normalized: WarehouseItem[] = [];
        for (const draft of drafts) {
            if (owners.value.has(draft.id)) {
                operationError.value = '已穿戴或携带的物品请从对应角色修改';
                return false;
            }
            const item = normalizeWarehouseItem(draft);
            if (
                !item ||
                seen.has(item.id) ||
                (!expected && items.value.some((one) => one.id === item.id))
            ) {
                operationError.value = '请补全物品内容，已有物品请从仓库打开修改';
                return false;
            }
            if (normalized.length && items.value.some((one) => one.id === item.id)) {
                operationError.value = '新增物品的编号已存在，请重新录入';
                return false;
            }
            seen.add(item.id);
            normalized.push({ ...item, updatedAt: Date.now() });
        }
        items.value = [...items.value.filter((one) => !seen.has(one.id)), ...normalized];
        void persist();
        return true;
    }
    function remove(id: string): boolean {
        if (
            tradePending.value ||
            characterPending.value ||
            useRoster().pending.value ||
            owners.value.has(id) ||
            !persist.canWrite() ||
            !items.value.some((item) => item.id === id)
        )
            return false;
        items.value = items.value.filter((item) => item.id !== id);
        void persist();
        return true;
    }
    return {
        items: readonly(inventory),
        owners: readonly(owners),
        loaded,
        loadError,
        writeError,
        operationError,
        tradePending: readonly(tradePending),
        characterPending: readonly(characterPending),
        pending: persist.pending,
        flush: persist.flush,
        retry: () =>
            tradePending.value || characterPending.value || useRoster().pending.value
                ? Promise.resolve(false)
                : persist(),
        save,
        remove,
    };
}
