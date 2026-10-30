import { ref, watch } from 'vue';

export type FontScale = 'small' | 'default' | 'large';

const STORAGE_KEY = 'mh-font-scale';

/**
 * 字号三档：较小 / 默认 / 较大。
 *
 * 只改根元素上的 `--fs-scale` 一个变量——`tokens.css` 里八档字号全是
 * `calc(Npx * var(--fs-scale))`，所以全站跟着缩放，组件不需要第二套值。
 *
 * 系数不是等差的：中文在 0.9 以下笔画开始粘连，1.15 以上行高会撑破既有版式。
 * 0.92 / 1 / 1.1 是「看得出差别但不破版」的区间。
 */
const FACTOR: Record<FontScale, number> = {
    small: 0.92,
    default: 1,
    large: 1.1,
};

export function useFontScale() {
    const stored = localStorage.getItem(STORAGE_KEY) as FontScale | null;
    const scale = ref<FontScale>(stored && stored in FACTOR ? stored : 'default');

    const apply = () => {
        document.documentElement.style.setProperty('--fs-scale', String(FACTOR[scale.value]));
    };

    watch(scale, () => {
        apply();
        localStorage.setItem(STORAGE_KEY, scale.value);
    });
    apply();

    return { scale };
}
