/** 浏览器交易日志统一恢复账号、库存及可选的售出角色归属。 */
import { writeLocalData } from './local-data';

const JOURNAL = 'mh-asset-trade';
export function recoverAssetTradeLocal(): void {
    const raw = globalThis.localStorage?.getItem(JOURNAL);
    if (raw === null || raw === undefined) return;
    const value = JSON.parse(raw) as { accounts?: unknown; warehouse?: unknown; roster?: unknown };
    if (
        !Array.isArray(value.accounts) ||
        !Array.isArray(value.warehouse) ||
        (value.roster !== undefined && !Array.isArray(value.roster))
    )
        throw new Error('关联交易恢复数据损坏');
    writeLocalData('mh-accounts', value.accounts);
    writeLocalData('mh-warehouse', value.warehouse);
    if (value.roster !== undefined) writeLocalData('mh-roster', value.roster);
    localStorage.removeItem(JOURNAL);
}

export function writeAssetTradeLocal(accounts: unknown, warehouse: unknown, roster?: unknown): void {
    writeLocalData(JOURNAL, { accounts, warehouse, ...(roster == null ? {} : { roster }) });
    recoverAssetTradeLocal();
}
