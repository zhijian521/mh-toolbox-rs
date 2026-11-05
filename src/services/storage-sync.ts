/**
 * 跨窗口同步：`storage` 事件的**边界**只有一份。
 *
 * ---- 为什么单独一个文件 ----
 * 收益账与物价表各写过一遍这段样板，逐字相同：
 *
 * ```ts
 * if (typeof window === 'undefined') return;
 * window.addEventListener('storage', (event) => {
 *     if (event.key !== null && event.key !== STORAGE_KEY) return;
 *     ...
 * });
 * ```
 *
 * 抄两遍的风险不在行数，在**边界**：`event.key === null` 意味着有人调了
 * `clear()`（整份存储被清空），这时也必须重读——漏了这一条，用户在另一个窗口
 * 点了「清除全部数据」，这一边还显示着旧账。这行判断只在物价那一份写了完整理由，
 * 收益那一份是简写，第三个 store 照着抄时很容易把它当成冗余删掉。
 *
 * 所以把「什么时候该重读」收进来，「读到之后怎么应用」仍留在各 store——
 * 那部分与各自的归一函数、解析失败策略绑死，抽象出去只是换一种写法。
 *
 * ---- 桌面版不会走到这里 ----
 * 两个窗口共享同一个 SQLite 文件，`localStorage` 的 `storage` 事件不触发；两窗同时写
 * 由 SQLite 自己串行化。这条链路只服务浏览器路径：`npm run dev` 与探针。
 *
 * `persist.ts` 那边写着「`storage` 事件监听留在各 store」，指的是**应用逻辑**；
 * 这里只收事件的过滤条件，两者不冲突。
 */
export function onStorageSync(key: string, apply: (raw: string | null) => void): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (event) => {
        /* `key === null` 是 `clear()`：整份存储被清掉了，要重读（读成空）。
         * 别的键（主题、字号）变化与本份数据无关，不该让它重读一次。 */
        if (event.key !== null && event.key !== key) return;

        /* `raw === null` 是 `removeItem` / `clear`，与「解析失败」是两件事：
         * 前者确实该空，后者必须保持现状（见各 store 里的分支）。 */
        apply(event.newValue);
    });
}
