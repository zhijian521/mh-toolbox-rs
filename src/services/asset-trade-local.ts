/** 浏览器预览的两份数据通过日志恢复，写入中断后不能只留下半笔交易。 */
import { writeLocalData } from './local-data';

const JOURNAL = 'mh-asset-trade';
export function recoverAssetTradeLocal(): void {
    const raw = globalThis.localStorage?.getItem(JOURNAL);
    if (raw === null || raw === undefined) return;
    const value = JSON.parse(raw) as { accounts?: unknown; warehouse?: unknown };
    if (!Array.isArray(value.accounts) || !Array.isArray(value.warehouse))
        throw new Error('关联交易恢复数据损坏');
    writeLocalData('mh-accounts', value.accounts);
    writeLocalData('mh-warehouse', value.warehouse);
    localStorage.removeItem(JOURNAL);
}

export function writeAssetTradeLocal(accounts: unknown, warehouse: unknown): void {
    writeLocalData(JOURNAL, { accounts, warehouse });
    recoverAssetTradeLocal();
}
