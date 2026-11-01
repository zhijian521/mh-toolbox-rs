import { effectScope, ref, watch } from 'vue';

export type FontScale = 'small' | 'default' | 'large';

const STORAGE_KEY = 'mh-font-scale';

/**
 * 字号三档：较小 / 默认 / 较大。
 *
 * 只改根元素上的 `--fs-scale` 一个变量——`tokens.css` 里每一档字号都是
 * `calc(Npx * var(--fs-scale))`，所以全站跟着缩放，组件不需要第二套值。
 *
 * 系数不是等差的：中文在 0.9 以下笔画开始粘连，1.15 以上行高会撑破既有版式。
 * 0.92 / 1 / 1.1 是「看得出差别但不破版」的区间。
 *
 * **状态放在模块作用域，不放在函数里**：设置页拆成「外观」和「原子组件」两个组件后，
 * 两处都会调 `useFontScale()`——各 new 一个 ref 的话，拖其中一个另一个不动，
 * 而且每次挂载都多注册一次 `watch`。这和 `use-theme.ts` 是同一个坑，只是换了个文件。
 */
const FACTOR: Record<FontScale, number> = {
    small: 0.92,
    default: 1,
    large: 1.1,
};

const stored = localStorage.getItem(STORAGE_KEY) as FontScale | null;
const scale = ref<FontScale>(stored && stored in FACTOR ? stored : 'default');

function apply() {
    document.documentElement.style.setProperty('--fs-scale', String(FACTOR[scale.value]));
}

let wired = false;

/** 脱离组件的独立作用域，见 `wire()` 里的说明。模块级持有，避免被回收。 */
const scope = effectScope(true);

function wire() {
    if (wired) return;
    wired = true;
    // `watch` 必须注册在脱离组件的独立作用域里。`wire()` 第一次是在「外观」那张卡的
    // setup 里被调用的，裸 `watch` 会被记进那个组件的 effect scope —— 离开设置页时组件
    // 卸载，watcher 随之停掉；而 `wired` 已置位，再进来也不会补注册。
    // 表现就是：首次进设置页切字号一直有效，去别的页面转一圈回来，滑块能动、字号不动、
    // 存储也不写了。`use-theme.ts` 同一个坑（那边首调者是常驻的左栏，才侥幸没暴露）。
    scope.run(() => {
        watch(scale, () => {
            apply();
            localStorage.setItem(STORAGE_KEY, scale.value);
        });
    });
    apply();
}

export function useFontScale() {
    wire();
    return { scale };
}
