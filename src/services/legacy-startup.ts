import { commands } from './bindings';
import { legacyDataImport } from './data-files';
import { hasDesktop } from './desktop';
import { loadGameData } from './game-data';

export interface StartupNotice {
    title: string;
    note: string;
}

/** 先于各领域加载和自动写入；转换与设置页共用，只有旧文件存在时加载转换模块。 */
export async function importLegacyOnStartup(): Promise<StartupNotice | undefined> {
    if (!hasDesktop()) return;
    try {
        const original = await commands.legacyStartupRead();
        if (original === null) return;
        await loadGameData();
        const { convertLegacyData } = await import('../import/legacy');
        const { backup, warnings } = convertLegacyData(original);
        const outcome = await legacyDataImport(original, JSON.stringify(backup), true);
        if (outcome.status === 'failed') throw new Error(outcome.error);
        if (outcome.status !== 'ok') return;
        const truncation = outcome.truncation?.points
            ? `${outcome.truncation.items} 件物品的历史超出保留上限，下次保存将裁去 ${outcome.truncation.points} 条。`
            : '';
        return {
            title: '已导入旧版本数据，可以直接使用',
            note: ['旧版原件已保留。', ...warnings, truncation].filter(Boolean).join(' '),
        };
    } catch (error) {
        console.error('首次旧版导入失败', error);
        return {
            title: '旧版本数据未能自动导入',
            note: `${error instanceof Error ? error.message : String(error)}。可在「设置 → 数据 → 导入旧版」重试，旧版文件未修改。`,
        };
    }
}
