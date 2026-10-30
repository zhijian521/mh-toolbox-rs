import { onBeforeUnmount, ref, watch } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mh-theme';

/**
 * 主题只有一条通路：根元素上的 `color-scheme`。
 *
 * `tokens.css` 里每个颜色都是 `light-dark(亮, 暗)`，所以切换主题不需要换一套变量，
 * 也不需要页面里的防闪脚本——把根元素切到 dark，所有令牌同时翻面。
 *
 * 选了「跟随系统」时读 `prefers-color-scheme`，并监听它的变化：Tauri 侧以后接
 * `window.setTheme('system')`，WebView2 就会改这个媒体查询，前端不必再改。
 */
export function useTheme() {
    const mode = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemDark = ref(media.matches);

    const onSystemChange = (event: MediaQueryListEvent) => {
        systemDark.value = event.matches;
    };
    media.addEventListener('change', onSystemChange);
    onBeforeUnmount(() => media.removeEventListener('change', onSystemChange));

    const apply = () => {
        const dark = mode.value === 'dark' || (mode.value === 'system' && systemDark.value);
        document.documentElement.classList.toggle('dark', dark);
    };

    watch([mode, systemDark], () => {
        apply();
        localStorage.setItem(STORAGE_KEY, mode.value);
    });
    apply();

    return { mode, dark: () => mode.value === 'dark' || (mode.value === 'system' && systemDark.value) };
}
