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

        /**
         * `data-*` 一律放行。
         *
         * 它们是自定义数据属性，键名本来就由调用方定（物价页用 `data-point-id` /
         * `data-act` 做「删一条价之后把焦点还回原按钮」的定位），逐个在
         * `HTMLAttributes` 里声明等于把 `data-` 这批也变成需要记忆的白名单。
         *
         * **代价要写清**：这条一加，`data-*` 拼错不会再报——`data-piont-id` 会静默
         * 通过，然后在 `querySelector` 里选不中、`?.` 让失败无声。这是 data-* 的本意
         * （自定义属性，类型系统无法知道它该叫什么），不是拦截力整体下降：
         * `strictTemplates` 对**组件自有 prop** 拼错（`lable`、`iconn`）依然有效，
         * 上面的 `'data-tauri-drag-region'` 也仍然保留精确类型。
         *
         * 写在这里而不是组件里：`ComponentCustomProps extends HTMLAttributes`
         * （见下），所以组件上透传的 `data-act` 跟着一起放行，不必开第二处。
         */
        [key: `data-${string}`]: string | number | boolean | undefined;
    }

    /**
     * SVG 元素是另一套属性接口（`SVGAttributes`），`HTMLAttributes` 的放行到不了它。
     *
     * 场景：物价卡里那根迷你走势线是 `<svg>`，整片可点区域靠
     * `closest('[data-role="history"]')` 区分「点折线看历史」与「点价格记价」，
     * 标记必须挂在 `<svg>` 本身上——挂在外面的话 `closest` 会从 `<path>` 先撞到它，
     * 把「点价格」也一并算成历史。
     */
    interface SVGAttributes {
        [key: `data-${string}`]: string | number | boolean | undefined;
    }
}

declare module '@vue/runtime-core' {
    interface ComponentCustomProps extends HTMLAttributes {
        /**
         * 组件上的 `data-*` 要再放行一次（原生元素靠上一条 `data-${string}` 就够）。
         *
         * 原因：**组件**标签上的 `data-act` 会被模板编译器规范化成驼峰 `dataAct`
         * 再去查 props，而 `data-${string}` 是带连字符的模板字面量键，匹配不到
         * `dataAct`，于是照样报 TS2353。原生元素（如 `<li :data-point-id>`）
         * 不经过这层规范化，所以那条一次就够。
         *
         * 为什么必须写在 `ComponentCustomProps` 而不是组件的 `defineProps`：
         * 后者会让 Vue 认为它是 prop，随之**不再自动透传**，DOM 上就真的没有
         * `data-act` 了——那比类型报错严重得多（`querySelector` 会静默选不中）。
         * `ComponentCustomProps` 是 attrs 层面的声明，透传行为不受影响，
         * 运行时属性名仍是 `data-act`。
         */
        [key: `data${string}`]: string | number | boolean | undefined;
    }
}

export {};
