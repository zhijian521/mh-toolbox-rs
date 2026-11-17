/** 浏览器名册与仓库共用恢复日志，任何一步中断后重试完整写回。 */
import { writeLocalData } from './local-data';

const JOURNAL = 'mh-character-assets';
export function recoverCharacterAssetsLocal(): void {
    const raw = globalThis.localStorage?.getItem(JOURNAL);
    if (raw === null || raw === undefined) return;
    const value = JSON.parse(raw) as { roster?: unknown; warehouse?: unknown };
    if (!Array.isArray(value.roster) || !Array.isArray(value.warehouse))
        throw new Error('角色物品恢复数据损坏');
    writeLocalData('mh-roster', value.roster);
    writeLocalData('mh-warehouse', value.warehouse);
    localStorage.removeItem(JOURNAL);
}

export function writeCharacterAssetsLocal(roster: unknown, warehouse: unknown): void {
    writeLocalData(JOURNAL, { roster, warehouse });
    recoverCharacterAssetsLocal();
}
