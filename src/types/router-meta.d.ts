import 'vue-router';

/**
 * 路由元信息。
 *
 * 原先没有类型，`route.meta` 的每个字段都是 `unknown`，于是 `PlaceholderView.vue`
 * 只能写 `String(route.meta.title ?? '')`——用一次运行时兜底掩盖一个编译期就能说清的事实：
 * 这条路由一定有标题。加完这个声明，`route.meta.title` 直接是 `string`。
 *
 * **拼错的字段名抓不住**：vue-router 的 `RouteMeta` 自带 `Record<PropertyKey, unknown>`
 * 索引签名（实测 `meta.titel` 不报错），所以这里能给的只是「读对的字段有类型」，
 * 不是「读错的字段会红」。别把它当成拼写检查。
 *
 * 只声明**真的会读**的字段。`hidden` 现在没有消费方（`/dev` 靠「不进 `NAV_ITEMS`」
 * 表达隐藏，不是靠这个标记），留着是因为 `router.ts` 里写着它，声明在这里比让
 * 它变成 `unknown` 更诚实。
 */
declare module 'vue-router' {
    interface RouteMeta {
        /** 页面标题，主要给占位页与调试用。左栏文案的真源仍是 `navigation.ts`。 */
        title: string;
        /** 这一页是否已实现；`false` 时路由挂 `PlaceholderView`。 */
        ready: boolean;
        /** 不在左栏出现的页面（当前只有 `dev-kit`）。 */
        hidden?: boolean;
    }
}
