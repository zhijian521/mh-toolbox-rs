import { computed, effectScope, ref, watch } from 'vue';
import { writePreference } from '../services/local-data';
import { notify } from './use-notify';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeStyle = 'ledger' | 'celadon' | 'azure' | 'crystal' | 'dunhuang' | 'rosewood';

/** 明暗与风格各有一组选项，设置页与开发页共用。 */
export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];

export const STYLE_OPTIONS: { value: ThemeStyle; label: string }[] = [
    { value: 'ledger', label: '账簿' },
    { value: 'celadon', label: '青瓷' },
    { value: 'azure', label: '霁蓝' },
    { value: 'crystal', label: '水晶' },
    { value: 'dunhuang', label: '敦煌岩彩' },
    { value: 'rosewood', label: '紫檀书斋' },
];

const STORAGE_KEY = 'mh-theme';
const STYLE_STORAGE_KEY = 'mh-theme-style';

/** 明暗与风格共享模块状态；存储不可读或值非法时回落默认值。 */
function readStoredOption<T extends string>(key: string, options: { value: T }[], fallback: T): T {
    try {
        const stored = globalThis.localStorage?.getItem(key);
        return options.find((option) => option.value === stored)?.value ?? fallback;
    } catch {
        return fallback;
    }
}

function storeOption(key: string, value: string, report: boolean) {
    if (!writePreference(key, value) && report) notify.error('本次设置已生效，未能记住');
}

/** 无媒体查询时按浅色处理，模块求值不依赖浏览器环境。 */
function systemMedia(): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia('(prefers-color-scheme: dark)');
}

const mode = ref(readStoredOption<ThemeMode>(STORAGE_KEY, THEME_OPTIONS, 'system'));
const style = ref(readStoredOption<ThemeStyle>(STYLE_STORAGE_KEY, STYLE_OPTIONS, 'ledger'));
const media = systemMedia();
const systemDark = ref(media?.matches ?? false);

const isDark = computed(
    () => mode.value === 'dark' || (mode.value === 'system' && systemDark.value),
);

let wired = false;

/** 独立作用域避免首次调用组件卸载时停止全局偏好同步。 */
const scope = effectScope(true);

function wire() {
    if (wired) return;
    wired = true;
    /* `media` 可能是 `null`（见 `systemMedia`）：那时没有系统主题可跟随，
     * `systemDark` 恒为 false，切换三档仍然照常工作。 */
    media?.addEventListener('change', (event) => {
        systemDark.value = event.matches;
    });
    scope.run(() => {
        watch(
            [mode, systemDark],
            () => document.documentElement.classList.toggle('dark', isDark.value),
            { immediate: true },
        );
        watch(mode, (value, previous) => storeOption(STORAGE_KEY, value, previous !== undefined), {
            immediate: true,
        });
        watch(
            style,
            (value, previous) => {
                document.documentElement.dataset.style = value;
                storeOption(STYLE_STORAGE_KEY, value, previous !== undefined);
            },
            { immediate: true },
        );
    });
}

export function useTheme() {
    wire();

    /** 快捷切换只认亮/暗两态，按一下就不跟随系统了——这是按钮该有的确定性。 */
    const toggle = () => {
        mode.value = isDark.value ? 'light' : 'dark';
    };

    return { mode, style, isDark, toggle };
}
