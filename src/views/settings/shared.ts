import type { ThemeMode } from '../../composables/use-theme';

/**
 * 设置页内部共享的常量。
 *
 * 主题选项被「外观」和「原子组件」两处用到——放在这里各取一份，
 * 不要在两个组件里各写一遍字面量，那样改文案会漏。
 */
export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];
