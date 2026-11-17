/** 仓库状态由各页面共用；新增、覆盖与删除统一归一并进入现有写队列。 */
import { readonly, ref } from 'vue';
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
const persist = createPersist({
    label: '仓库',
    loaded,
    loadError,
    writeError,
    writeLocal: () => writeLocalData(STORAGE_KEY, items.value),
    writeRemote: () => warehouseSave(items.value),
});

export async function loadWarehouse(): Promise<void> {
    if (tradePending.value) return;
    await loadData({
        loaded,
        loadError,
        error: '仓库读取失败，已暂停写入，请重新读取',
        readLocal: () => {
            try {
                recoverAssetTradeLocal();
            } catch {
                return { ok: false, error: '关联交易恢复失败，请重新读取' };
            }
            return readLocalData(STORAGE_KEY, parseWarehouse);
        },
        readRemote: warehouseLoad,
        applyLocal: (value) => {
            items.value = value ?? [];
        },
        applyRemote: (value) => {
            items.value = parseWarehouse(value);
        },
    });
}

/** 关联交易由账号写队列一次落库；完成前仓库不能单独改写。 */
export function stageWarehouseTrade(next: WarehouseItem[]): boolean {
    if (tradePending.value || persist.pending.value || writeError.value || !persist.canWrite())
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

export function useWarehouse() {
    function save(drafts: readonly ReadonlyWarehouseItem[], expected?: string): boolean {
        operationError.value = '';
        if (tradePending.value || !persist.canWrite()) return false;
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
        if (tradePending.value || !persist.canWrite() || !items.value.some((item) => item.id === id))
            return false;
        items.value = items.value.filter((item) => item.id !== id);
        void persist();
        return true;
    }
    return {
        items: readonly(items),
        loaded,
        loadError,
        writeError,
        operationError,
        tradePending: readonly(tradePending),
        pending: persist.pending,
        flush: persist.flush,
        retry: () => tradePending.value ? Promise.resolve(false) : persist(),
        save,
        remove,
    };
}
