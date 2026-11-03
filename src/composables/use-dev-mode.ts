import { computed, ref } from 'vue';

const STORAGE_KEY = 'mh-dev-mode';

/**
 * 开发者模式：界面里所有「测试入口」的总开关。
 *
 * **默认关**——首次启动、`localStorage` 里没有这个键时，一定是关的。开着的时候，
 * 给开发与验证用的东西才会出现——目前只有一个：捉鬼页右下角的「测试文字」面板。
 * 后面的测试工具都挂这一个开关，不再各配一个。
 *
 * **为什么是「生成与否」而不是「藏起来」**：关着时组件根本不渲染（`v-if`），
 * 这样它不会占 tab 停留点、不会被读屏念到、也不会在截图中出现。`v-show` 只是
 * `display: none`，停靠点还在 DOM 里。
 *
 * **为什么记住选择**：默认关，但用户主动打开之后要记得住。它表达的是「我现在正处在
 * 这个模式下」，每刷新一次掉回关，等于每次都得先去开发页点一下。这与「高概率区域
 * 默认开且不记忆」（`use-ghost-watch.ts`）不是一回事——那条反对的是「记住上次会把
 * 默认值悄悄变成上次」，而这里默认值本来就该是关，记住的只是用户显式做的选择。
 * 要回到「从没设置过」的状态，清掉 `localStorage` 的 `mh-dev-mode` 即可。
 *
 * 状态放模块作用域：开发页与捉鬼页各调一次 `useDevMode()`，必须是同一个 ref——
 * 各 new 一个的话，在开发页打开了，捉鬼页那份仍是 false。这个坑 `use-theme.ts`、
 * `use-font-scale.ts` 都踩过，注释里各留了一条。
 */
/**
 * 读档：读不到就当「没开过」——默认关，与「从没存过」同一个语义。
 *
 * **为什么这里必须有 try/catch**：下一行是**模块求值时**执行的，`localStorage` 被策略
 * 禁用时访问它会抛 `SecurityError`，整个模块 import 就炸——而这个模块被开发页与捉鬼页
 * 一起引着，炸掉等于**整个应用白屏**。同一个理由见 `use-theme.ts`、`use-font-scale.ts`。
 *
 * 用 `=== '1'` 而不是 `getItem(...) !== null`：键被写坏成别的值时，回落到关。
 */
function readStoredDevMode(): boolean {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

/** 真实状态。 */
const enabled = ref(readStoredDevMode());

/** 对外的可写句柄：模板里 `v-model` 直接绑，切换时同时落存储。 */
const devMode = computed({
    get: () => enabled.value,
    set: (value: boolean) => {
        enabled.value = value;
        localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    },
});

export function useDevMode() {
    return { devMode };
}
