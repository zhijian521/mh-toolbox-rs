import { computed, effectScope, ref, watch } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeStyle = 'ledger' | 'celadon' | 'azure' | 'crystal';

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
];

const STORAGE_KEY = 'mh-theme';
const STYLE_STORAGE_KEY = 'mh-theme-style';

/**
 * 明暗走根元素的 dark 类与 color-scheme，风格走 data-style，两者互不改写。
 *
 * `tokens.css` 里每个颜色都是 `light-dark(亮, 暗)`，所以切换主题不需要换一套变量，
 * 也不需要页面里的防闪脚本——挂载前应用两个偏好，所有令牌同时生效。
 *
 * 选了「跟随系统」时读 `prefers-color-scheme`，并监听它的变化：Tauri 侧以后接
 * `window.setTheme('system')`，WebView2 就会改这个媒体查询，前端不必再改。
 *
 * **状态放在模块作用域，不放在函数里**：设置页的三档胶囊、开发页的调色板、左栏牌记
 * 都调 `useTheme()`，各自 new 一个 ref 的话几处会互相看不见——换了一处，别处不动。
 * 设置页和开发页操作同一份偏好，局部预览不另存一套状态。
 */
/**
 * 读档：认不出 / 读不到就回到对应默认值。
 *
 * **为什么这里必须有 try/catch**：下面那两行是**模块求值时**执行的（不是某个组件的
 * setup 里），`localStorage` 被策略禁用时（部分 WebView2 企业策略、隐私模式、
 * 文件协议下的某些环境）访问它直接抛 `SecurityError`，于是整个模块 import 就炸。
 * 而 `use-theme.ts` 是被 `App.vue` / 设置页 / 左栏一起引的，炸掉等于**整个应用白屏**，
 * 报错还指向一个与主题无关的文件。同一个理由见 `use-font-scale.ts`、`use-dev-mode.ts`。
 */
function readStoredOption<T extends string>(key: string, options: { value: T }[], fallback: T): T {
    try {
        const stored = globalThis.localStorage?.getItem(key);
        return options.find((option) => option.value === stored)?.value ?? fallback;
    } catch {
        return fallback;
    }
}

function storeOption(key: string, value: string) {
    try {
        globalThis.localStorage?.setItem(key, value);
    } catch {
        // 存储不可用时仍应用当前选择，只是不跨启动记忆。
    }
}

/**
 * 系统暗色的媒体查询。没有 `window`（Node 里跑单测）或没有 `matchMedia` 时返回 `null`，
 * 「跟随系统」于是表现为**亮色**——与 `light-dark()` 的默认面一致，也与
 * `systemDark = false` 的初值一致。守卫同样是为了不在 import 阶段抛错。
 */
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

/** 脱离组件的独立作用域，见 `wire()` 里的说明。模块级持有，避免被回收。 */
const scope = effectScope(true);

function wire() {
    if (wired) return;
    wired = true;
    /* `media` 可能是 `null`（见 `systemMedia`）：那时没有系统主题可跟随，
     * `systemDark` 恒为 false，切换三档仍然照常工作。 */
    media?.addEventListener('change', (event) => {
        systemDark.value = event.matches;
    });
    // 与 `use-font-scale.ts` 同一个坑：`wire()` 是在某个组件的 setup 里被第一次调用的，
    // 裸 `watch` 会绑到那个组件上、随它卸载而停。主题这边首调者是常驻的左栏，
    // 所以一直没暴露；但谁先调是可以变的，别赌。
    scope.run(() => {
        watch(
            [mode, systemDark],
            () => {
                document.documentElement.classList.toggle('dark', isDark.value);
                storeOption(STORAGE_KEY, mode.value);
            },
            { immediate: true },
        );
        watch(
            style,
            () => {
                document.documentElement.dataset.style = style.value;
                storeOption(STYLE_STORAGE_KEY, style.value);
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
