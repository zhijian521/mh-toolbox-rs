import { toRaw } from 'vue';

/**
 * 弹窗里的草稿：**深拷贝一份再改**，`Esc` 才是「什么都没发生」。
 *
 * `GearQuick` 与 `PetQuick` 共用这一份，因为它要解释的坑两边一样：
 *
 * 1. **为什么不是 `JSON.parse(JSON.stringify())`**：那条会静默丢掉 `undefined` 字段
 *    （装备的 `level` / `note`、召唤兽的 `portrait` 都是可选的），还会把 `Date` 变
 *    字符串、被 `toJSON` 干扰。现在这些结构碰不到，但换个字段就会出意外，而且不报错。
 * 2. **`toRaw` 不能省**：传进来的是从名册 `ref` 里取出来的对象，已经被 Vue 包成
 *    `Proxy`，而 `structuredClone` 遇到 Proxy 直接抛 `DataCloneError`
 *    （实测：`Proxy` 一进 `structuredClone` 就红，剥一层就正常）。`toRaw` 只剥最外层，
 *    内层挂的都是原始值，够用。
 */
export function cloneDraft<T>(source: T): T {
    return structuredClone(toRaw(source));
}
