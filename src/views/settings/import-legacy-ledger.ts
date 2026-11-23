import { askConfirm } from '../../composables/use-confirm';
import { legacyDataImport, legacyDataRead, type DataOutcome } from '../../services/data-files';
import { prepareLegacyData } from '../../services/legacy-startup';

/** 两个设置页都先预览，再提交用户确认的同一份原文。 */
export async function importLegacyLedger(): Promise<DataOutcome> {
    const source = await legacyDataRead();
    if (source.status !== 'ok') return source;
    try {
        const { backup, warnings } = await prepareLegacyData(source.raw);
        const counts = `${backup.characters.length} 个角色、${backup.prices.length} 件物价、${backup.income.length} 笔收益、${backup.accounts.length} 笔账号记录、${backup.online.length} 条上线记录、${backup.goals.length} 个目标`;
        const ok = await askConfirm({
            danger: true,
            title: '用旧版数据替换当前账本？',
            note: `替换前会自动备份当前账本。可转换：${counts}。${warnings.join(' ')}`.trim(),
            confirmText: '替换并导入',
        });
        if (!ok) return { status: 'canceled' };
        const result = await legacyDataImport(source.raw, JSON.stringify(backup));
        return result.status === 'ok' ? { ...result, warning: warnings.join(' ') } : result;
    } catch (error) {
        return {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
