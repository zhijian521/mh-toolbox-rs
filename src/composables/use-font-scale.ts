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
 * **状态放在模块作用域，不放在函数里**：设置页的「外观」卡与开发页的「原子组件」卡
 * 都会调 `useFontScale()`——各 new 一个 ref 的话，拖其中一个另一个不动，
 * 而且每次挂载都多注册一次 `watch`。这和 `use-theme.ts` 是同一个坑，只是换了个文件。
 */
const FACTOR: Record<FontScale, number> = {
    small: 0.92,
    default: 1,
    large: 1.1,
};

/**
 * 读档：认不出 / 读不到就用 `'default'`（与「从没存过」同一个语义）。
 *
 * **为什么这里必须有 try/catch**：下一行是**模块求值时**执行的，`localStorage` 被策略
 * 禁用时访问它会抛 `SecurityError`，整个模块 import 就炸——而这个模块被设置页、
 * 开发页、以及所有读 `--fs-scale` 的入口一起引着，炸掉等于**整个应用白屏**。
 * 同一个理由见 `use-theme.ts`、`use-dev-mode.ts`。
 *
 * **为什么是 `Object.hasOwn` 而不是 `in`**：`in` 会沿**原型链**判断，而 `FACTOR` 是对象
 * 字面量——`'toString'` / `'constructor'` / `'valueOf'` / `'__proto__'` 在它身上全是
 * `in` 为真。那样 `stored = 'toString'` 会被当成合法档位，`apply()` 把 `--fs-scale`
 * 设成 `String(Function)`，于是每一处 `calc(Npx * var(--fs-scale))` 当场失效、
 * 整站字号塌掉，而且不报错。这里要问的是「这是不是我定义的那几档」，
 * 不是「这个属性存不存在」——`Object.hasOwn` 查的是自有属性，正好对应前者。
 * （`tsconfig.json` 的 `lib` 含 `ES2022`，Node 22 与 WebView2 都支持，不用退回
 * `Object.prototype.hasOwnProperty.call`。）
 */
function readStoredScale(): FontScale {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        return stored && Object.hasOwn(FACTOR, stored) ? (stored as FontScale) : 'default';
    } catch {
        return 'default';
    }
}

const scale = ref<FontScale>(readStoredScale());

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
