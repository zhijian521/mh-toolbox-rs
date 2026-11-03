import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 字号档位**读取守卫**的回归用例。
 *
 * ---- 为什么这层值得单独测 ----
 * `use-font-scale.ts` 的 `scale` 是在**模块求值时**从 `localStorage` 读出来的。
 * 于是「存储里那个字符串是否可信」不是一次读档的小事：写坏的值会被当成合法档位，
 * `apply()` 把 `--fs-scale` 设成 `String(FACTOR[那个值])`，而全站每一档字号都是
 * `calc(Npx * var(--fs-scale))`——一处失效，整站字号一起塌，**且不报错**。
 *
 * 具体两件事：
 * 1. `Object.hasOwn` 而不是 `in`。`in` 沿原型链走，`'toString'` / `'constructor'` /
 *    `'valueOf'` / `'__proto__'` 在 `FACTOR` 上全是 `in === true`，取出来是函数。
 * 2. `localStorage` 被策略禁用时访问即抛 `SecurityError`，没有 `try/catch` 就是
 *    import 阶段炸掉整个应用。
 *
 * ---- 为什么要 `resetModules` + 动态 import ----
 * 这个模块在**顶层**就读存储、并建了一个模块级 `ref`。静态 import 会让所有用例共用
 * 同一次求值结果（第一个用例定终身），所以每条用例都 `vi.resetModules()` 再 `import()`，
 * 拿一个全新的单例——与 `roster.test.ts` 里那段「拒绝写入」的用例同一个理由。
 */

/** 测试环境是 node，没有 `document`：这里只造 `apply()` 真正用到的那一格。 */
function stubDocument(): (name: string) => string {
    const values = new Map<string, string>();
    const style = {
        setProperty(name: string, value: string) {
            values.set(name, value);
        },
        getPropertyValue(name: string) {
            return values.get(name) ?? '';
        },
    };
    vi.stubGlobal('document', { documentElement: { style } });
    return (name: string) => style.getPropertyValue(name);
}

/**
 * 装一份「存储里写着 `raw`」的环境，`import()` 一个新模块并调一次 `useFontScale()`。
 *
 * 返回读出来的档位与**真正写进 CSS 的** `--fs-scale`——后者才是用户看到的东西：
 * 断言「值是 default」不够，得证明它没被 `String(函数)` 污染。
 *
 * **`await import('vue')` 必须排在建 `document` 桩之前**：`@vue/runtime-dom` 在模块求值时
 * 就看 `typeof document`，有 document 就走浏览器分支去调 `doc.createElement('template')`。
 * 先建桩再 import vue，得到的是 `TypeError: doc.createElement is not a function`——
 * 而且报错指向 vue 的内部，与本文件毫无关系。先让 vue 在没有 document 的环境里求值完
 * （它于是记住 `doc = null`），再把桩补上给 `apply()` 用，两边互不干扰。
 */
async function readScale(raw: string | null) {
    vi.resetModules();
    await import('vue');
    const store = new Map<string, string>();
    if (raw !== null) store.set('mh-font-scale', raw);
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
    });
    const readStyle = stubDocument();

    const { useFontScale } = await import('./use-font-scale');
    const { scale } = useFontScale();
    return { scale, fsScale: readStyle('--fs-scale') };
}

describe('字号档位读取守卫', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    /* 每条用例自己造全局桩，用完就撤——否则下一条会看到上一条的 `localStorage`。 */
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /* 前四个是原型链上的名字（`in` 会误判成合法档位），后两个是类型对但值不对。 */
    it.each(['toString', 'constructor', '__proto__', 'valueOf', '1.5', '', 'LARGE'])(
        '存储被写成 %j 时回落到 default，且不动坏 CSS 变量',
        async (raw) => {
            const { scale, fsScale } = await readScale(raw);

            expect(scale.value).toBe('default');
            /* `--fs-scale` 必须是系数 1，绝不能是 `function toString() {...}` 这类字符串：
             * 一旦出现，每一处 `calc(Npx * var(--fs-scale))` 都不成立。 */
            expect(fsScale).toBe('1');
            expect(fsScale).not.toContain('function');
        },
    );

    it('从没存过（null）也是 default', async () => {
        const { scale, fsScale } = await readScale(null);

        expect(scale.value).toBe('default');
        expect(fsScale).toBe('1');
    });

    it('正常档位照常读出来——守卫不能把正常路径也关掉', async () => {
        expect((await readScale('large')).fsScale).toBe('1.1');
        expect((await readScale('small')).fsScale).toBe('0.92');
        const { scale, fsScale } = await readScale('default');
        expect(scale.value).toBe('default');
        expect(fsScale).toBe('1');
    });

    it('localStorage 被策略禁用（访问即抛）时不炸 import，回落到 default', async () => {
        vi.resetModules();
        /* 同上：vue 要先在没有 document 的环境里求值完，再补桩。 */
        await import('vue');
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('SecurityError: 存储被禁用');
            },
            setItem: () => {
                throw new Error('SecurityError: 存储被禁用');
            },
        });
        const readStyle = stubDocument();

        /* 这一句就是断言本身：模块能 import 成功、`useFontScale()` 能返回，
         * 说明 `readStoredScale()` 的 `catch` 兜住了。抛错的话这条用例直接红。 */
        const { useFontScale } = await import('./use-font-scale');
        expect(useFontScale().scale.value).toBe('default');
        expect(readStyle('--fs-scale')).toBe('1');
    });
});
