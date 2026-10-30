import { computed, ref, watch } from 'vue';

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
 *
 * **状态放在模块作用域，不放在函数里**：设置页的三档胶囊和左栏的快捷切换按钮
 * 都调 `useTheme()`，各自 new 一个 ref 的话两边会互相看不见——点了侧栏，设置页那块不动。
 */
const mode = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system');
const media = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(media.matches);

const isDark = computed(
    () => mode.value === 'dark' || (mode.value === 'system' && systemDark.value),
);

let wired = false;

function wire() {
    if (wired) return;
    wired = true;
    media.addEventListener('change', (event) => {
        systemDark.value = event.matches;
    });
    watch(
        [mode, systemDark],
        () => {
            document.documentElement.classList.toggle('dark', isDark.value);
            localStorage.setItem(STORAGE_KEY, mode.value);
        },
        { immediate: true },
    );
}

export function useTheme() {
    wire();

    /** 快捷切换只认亮/暗两态，按一下就不跟随系统了——这是按钮该有的确定性。 */
    const toggle = () => {
        mode.value = isDark.value ? 'light' : 'dark';
    };

    return { mode, isDark, toggle };
}
