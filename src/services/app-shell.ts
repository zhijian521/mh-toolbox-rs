import { readPreference, writePreference } from './local-data';

export type AppShell = 'liquid' | 'legacy';
const preferenceKey = 'mh-app-shell';

function readAppShell(): AppShell {
    const saved = readPreference(preferenceKey);
    if (saved === 'liquid' || saved === 'legacy') return saved;
    return import.meta.env.MODE === 'legacy' ? 'legacy' : 'liquid';
}

// 两套入口各自加载全局样式，当前界面在文档生命周期内固定。
export const activeAppShell = readAppShell();

export function saveAppShell(shell: AppShell): boolean {
    return writePreference(preferenceKey, shell);
}
