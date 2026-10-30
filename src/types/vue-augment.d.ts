/**
 * 模板类型补充。
 *
 * 这里补两件事，都是为了让 `strictTemplates` 能开、又不逼着组件为每个 ARIA 属性写 prop。
 *
 * 1. `data-tauri-drag-region` —— Tauri 无边框窗口读取的自定义属性，不属于 HTML 标准。
 *
 * 2. `ComponentCustomProps` 并入 `HTMLAttributes` —— 让 `:aria-current`、`:aria-expanded`
 *    这类原生属性可以透传给任何组件。
 *
 * 为什么不在组件里逐个声明 ARIA prop：Vue 的规则是「声明成 prop 就不再自动透传」，
 * 声明后必须在组件内部手动绑回根元素；而带连字符的 key 在 `<script setup>` 里取不到值
 * （`$props['aria-x']` 会被编译成 `$props.$props['aria-x']`，生产构建下恒为 undefined；
 * `{ 'aria-x': x }` 重命名解构同样拿不到）。两条路都会让属性静默消失——已逐一实测。
 * ARIA 有几十个属性，逐个声明既不现实，也把简单透传变成了高风险操作。
 *
 * 放开的只是原生属性：`HTMLAttributes` 里没有 `lable`、`iconn` 这种拼错的组件自有
 * prop，所以 `strictTemplates` 对「组件属性拼错」的拦截依然有效。真正丢掉的是
 * 「给组件传了一个不存在的原生属性」这一层——那本来也不是类型该管的事。
 *
 * `export {}` 不能删：没有它，本文件是全局脚本，`declare module` 会**覆盖**
 * 整个模块的声明而不是合并，Vue 的类型会被整片抹掉。
 */
import type { HTMLAttributes } from 'vue';

declare module '@vue/runtime-dom' {
    interface HTMLAttributes {
        /** Tauri 无边框窗口的拖动区标记：只看有没有，值写空串或 true 都行。 */
        'data-tauri-drag-region'?: boolean | '';
    }
}

declare module '@vue/runtime-core' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 只做接口合并，不新增成员
    interface ComponentCustomProps extends HTMLAttributes {}
}

export {};
